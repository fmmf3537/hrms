// M4-C5: 工资条邮件 + 系统通知 | HRMS
// 复用 M0.5-2 notification.sendNotification，严禁重写通知 service

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';
import * as notificationService from './notification.service';
import * as generator from './payslip_generator.service';

const RESOURCE_TYPE = 'payslip';
const FALLBACK_SUBJECT = '您的 {period} 工资条';
const FALLBACK_METHODS = ['email', 'system'];

export interface DeliverPayslipInput {
  methods?: string[];
}

export interface DeliverPayslipResult {
  payslipId: string;
  deliveredAt: Date;
  emailStatus: 'sent' | 'skipped' | 'failed';
  systemStatus: 'sent' | 'skipped' | 'failed';
  methods: string[];
}

async function getEmailSubject(period: string): Promise<string> {
  try {
    const v = await configService.getValue('salary', 'payslip.email_subject');
    const tpl = typeof v === 'string' && v.length > 0 ? v : FALLBACK_SUBJECT;
    return tpl.replace('{period}', period);
  } catch {
    // TODO: configs.salary.payslip.email_subject 未配置时 fallback
    return FALLBACK_SUBJECT.replace('{period}', period);
  }
}

async function getDeliveryMethods(override?: string[]): Promise<string[]> {
  if (override && override.length > 0) return override;
  try {
    const v = await configService.getValue('salary', 'payslip.delivery_methods');
    if (Array.isArray(v)) {
      const list = v.filter((x): x is string => typeof x === 'string');
      if (list.length > 0) return list;
    }
    return FALLBACK_METHODS;
  } catch {
    // TODO: configs.salary.payslip.delivery_methods 未配置时 fallback
    return FALLBACK_METHODS;
  }
}

/**
 * 发送工资条（邮件 + 系统通知，V1.2 §二.4.6）
 * @throws AppError(400, 73501) 不存在
 * @throws AppError(400, 73502) 未审批
 * @throws AppError(400, 73508) 发送失败
 * 校验链：
 *  1. 查 payslip + employee
 *  2. status 必须 approved / locked
 *  3. generatePayslip
 *  4. 调 notificationService.sendNotification（email + in_app，bypassTemplate）
 *  5. 写 audit PAYSLIP_DELIVER（C4 payslips 无 paidAt，发放时间记 audit）
 * 注：严禁重写 M0.5-2
 */
export async function deliverPayslip(
  actorId: string,
  payslipId: string,
  input: DeliverPayslipInput = {},
): Promise<DeliverPayslipResult> {
  const rec = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: { employee: true },
  });
  if (!rec) {
    throw new AppError('工资单不存在', 400, 73501);
  }
  if (rec.status !== 'approved' && rec.status !== 'locked') {
    throw new AppError('工资单尚未审批，无法发放', 400, 73502);
  }

  const generated = await generator.generatePayslip(actorId, payslipId);
  const methods = await getDeliveryMethods(input.methods);
  const subject = await getEmailSubject(rec.period);
  const notifyUserId = rec.employee.userId ?? actorId;
  const netAmount = Number(rec.netAmount);

  let emailStatus: DeliverPayslipResult['emailStatus'] = 'skipped';
  let systemStatus: DeliverPayslipResult['systemStatus'] = 'skipped';

  try {
    if (methods.includes('email')) {
      await notificationService.sendNotification({
        templateKey: 'payslip',
        userId: notifyUserId,
        data: {
          html: generated.html,
          period: rec.period,
          employeeName: rec.employee.name,
          netAmount,
          emailSubject: subject,
        },
        bypassTemplate: {
          channel: 'email',
          subject,
          content: generated.html,
        },
      });
      emailStatus = 'sent';
    }
    if (methods.includes('system')) {
      await notificationService.sendNotification({
        templateKey: 'payslip_published',
        userId: notifyUserId,
        data: { period: rec.period, netAmount },
        bypassTemplate: {
          channel: 'in_app',
          subject: `${rec.period} 工资条已发布`,
          content: `您的 ${rec.period} 实发 ${netAmount.toFixed(2)} 元工资条已可查看`,
        },
      });
      systemStatus = 'sent';
    }
  } catch {
    throw new AppError('工资条发送失败', 400, 73508);
  }

  const deliveredAt = new Date();
  const result: DeliverPayslipResult = {
    payslipId,
    deliveredAt,
    emailStatus,
    systemStatus,
    methods,
  };

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PAYSLIP_DELIVER',
    resourceType: RESOURCE_TYPE,
    resourceId: payslipId,
    description: `发放 ${rec.period} 工资条`,
    newValue: {
      payslipId, methods, emailStatus, systemStatus, deliveredAt: deliveredAt.toISOString(),
    },
  });

  return result;
}

/**
 * 按算薪批次批量发放工资条
 */
export async function deliverBatchPayslips(
  actorId: string,
  runId: string,
  input: DeliverPayslipInput = {},
): Promise<{ runId: string; count: number; results: DeliverPayslipResult[] }> {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: { payslips: true },
  });
  if (!run) {
    throw new AppError('算薪批次不存在', 404);
  }
  const eligible = run.payslips.filter(
    (slip) => slip.status === 'approved' || slip.status === 'locked',
  );
  const results = await Promise.all(
    eligible.map((slip) => deliverPayslip(actorId, slip.id, input)),
  );
  return { runId, count: results.length, results };
}
