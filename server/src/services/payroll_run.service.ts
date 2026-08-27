// M4-C4: 算薪批次 + 3 级审批流程 | HRMS
// 调 approval.submitApproval / withdraw；调 payroll_calculation；不改 C1-C3

import type { PayrollRun, Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as approvalService from './approval.service';
import * as auditService from './audit.service';
import * as configService from './config.service';
import * as calcService from './payroll_calculation.service';

const RESOURCE_TYPE = 'payroll_run';
const FALLBACK_FLOWS = {
  hr: 'payroll:hr_submit',
  finance: 'payroll:finance_review',
  ceo: 'payroll:ceo_approve',
};

export interface CreatePayrollRunInput {
  period: string;
  deptIds?: string[];
  remark?: string;
}

export interface ListPayrollRunFilter {
  period?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedPayrollRuns {
  items: PayrollRun[];
  total: number;
  page: number;
  pageSize: number;
}

function parsePeriod(period: string): void {
  if (!/^(\d{4})-(0[1-9]|1[0-2])$/.test(period)) {
    throw new AppError('period 格式错误，应为 YYYY-MM', 400, 73404);
  }
}

async function getApprovalFlows(): Promise<typeof FALLBACK_FLOWS> {
  try {
    const v = await configService.getValue('salary', 'payroll.approval_flow');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const row = v as Record<string, unknown>;
      return {
        hr: typeof row.hr === 'string' ? row.hr : FALLBACK_FLOWS.hr,
        finance: typeof row.finance === 'string' ? row.finance : FALLBACK_FLOWS.finance,
        ceo: typeof row.ceo === 'string' ? row.ceo : FALLBACK_FLOWS.ceo,
      };
    }
    return FALLBACK_FLOWS;
  } catch {
    // TODO: configs.salary.payroll.approval_flow 未配置时 fallback
    return FALLBACK_FLOWS;
  }
}

async function getLockAfterApprove(): Promise<boolean> {
  try {
    const v = await configService.getValue('salary', 'payroll.lock_after_approve');
    return v === true;
  } catch {
    // TODO: configs.salary.payroll.lock_after_approve 未配置时 fallback
    return true;
  }
}

async function getTriggerDay(): Promise<number> {
  try {
    const v = await configService.getValue('salary', 'payroll.trigger_day');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 5;
  } catch {
    // TODO: configs.salary.payroll.trigger_day 未配置时 fallback（BullMQ 留独立任务）
    return 5;
  }
}

async function findRunOrThrow(id: string): Promise<PayrollRun> {
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) {
    throw new AppError('算薪批次不存在', 400, 73401);
  }
  return run;
}

function assertNotLocked(run: PayrollRun): void {
  if (run.locked || run.status === 'locked') {
    throw new AppError('算薪批次已锁定', 400, 73406);
  }
}

async function startApproval(
  actorId: string,
  run: PayrollRun,
  flowKey: string,
  title: string,
): Promise<void> {
  try {
    await approvalService.submitApproval({
      flowKey,
      businessType: 'payroll',
      businessId: run.id,
      title,
      initiatorId: actorId,
      data: { runId: run.id, period: run.period, status: run.status },
    });
  } catch (err) {
    if (err instanceof AppError && err.code === 20101) {
      throw new AppError('算薪审批流未配置', 400, 73403);
    }
    throw err;
  }
}

/**
 * 发起算薪（period 唯一 + 批量 calculateSinglePayroll + 写 payslips/items）
 * @throws AppError(400, 73404) period 非法
 * @throws AppError(400, 73402) 同 period 已有 run
 */
export async function createPayrollRun(
  actorId: string,
  input: CreatePayrollRunInput,
): Promise<{ run: PayrollRun; payslipCount: number }> {
  parsePeriod(input.period);
  await getTriggerDay();
  const existing = await prisma.payrollRun.findFirst({
    where: { period: input.period, status: { not: 'cancelled' } },
  });
  if (existing) {
    throw new AppError('该月已有算薪批次', 400, 73402);
  }

  const where: Prisma.EmployeeWhereInput = { deletedAt: null, status: 'active' };
  if (input.deptIds && input.deptIds.length > 0) {
    where.departmentId = { in: input.deptIds };
  }
  const employees = await prisma.employee.findMany({
    where,
    select: { id: true },
  });
  if (employees.length === 0) {
    throw new AppError('部门下无在职员工', 400);
  }

  const calcs = await Promise.all(
    employees.map((emp) => calcService.calculateSinglePayroll(actorId, {
      employeeId: emp.id,
      period: input.period,
    })),
  );

  let totalGross = 0;
  let totalNet = 0;
  let anomalyCount = 0;
  calcs.forEach((c) => {
    totalGross += c.grossAmount;
    totalNet += c.netAmount;
    if (c.anomaly.isAnomaly) anomalyCount += 1;
  });

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.payrollRun.create({
      data: {
        period: input.period,
        status: 'draft',
        totalGross,
        totalNet,
        anomalyCount,
        remark: input.remark ?? null,
        createdById: actorId,
      },
    });
    await Promise.all(calcs.map(async (c) => {
      const payslip = await tx.payslip.create({
        data: {
          runId: created.id,
          employeeId: c.employeeId,
          period: c.period,
          baseAmount: c.baseAmount,
          performanceAmount: c.performanceAmount,
          overtimeAmount: c.overtimeAmount,
          allowanceAmount: c.allowanceAmount,
          salesCommissionAmount: c.salesCommissionAmount,
          yearEndBonusAmount: c.yearEndBonusAmount,
          grossAmount: c.grossAmount,
          socialInsuranceAmount: c.socialInsuranceAmount,
          housingFundAmount: c.housingFundAmount,
          taxAmount: c.taxAmount,
          absenceAmount: c.absenceAmount,
          deductionAmount: c.deductionAmount,
          netAmount: c.netAmount,
          status: 'calculated',
        },
      });
      const items = calcService.toPayslipItemRows(c);
      await tx.payslipItem.createMany({
        data: items.map((it) => ({
          payslipId: payslip.id,
          itemType: it.itemType,
          itemName: it.itemName,
          amount: it.amount,
          description: it.description ?? null,
        })),
      });
    }));
    return created;
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PAYROLL_RUN_CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: run.id,
    description: `发起 ${input.period} 算薪`,
    newValue: {
      period: run.period, totalGross, totalNet, anomalyCount, payslipCount: calcs.length,
    },
  });

  return { run, payslipCount: calcs.length };
}

/**
 * 算薪批次列表（period/status + 分页）
 */
export async function listPayrollRuns(
  actorId: string,
  filter: ListPayrollRunFilter = {},
): Promise<PaginatedPayrollRuns> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  const where: Prisma.PayrollRunWhereInput = {
    ...(filter.period ? { period: filter.period } : {}),
    ...(filter.status ? { status: filter.status as PayrollRun['status'] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.payrollRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payrollRun.count({ where }),
  ]);
  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PAYROLL_LIST',
    resourceType: RESOURCE_TYPE,
    description: '查询算薪批次列表',
    newValue: { total, page },
  });
  return {
    items, total, page, pageSize,
  };
}

/**
 * 批次详情（含 payslips）
 */
export async function getPayrollRun(actorId: string, id: string) {
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: { payslips: { include: { items: true } } },
  });
  if (!run) {
    throw new AppError('算薪批次不存在', 400, 73401);
  }
  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PAYROLL_LIST',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '查看算薪批次详情',
  });
  return run;
}

/**
 * 锁定（approved → locked）
 */
export async function lockPayrollRun(actorId: string, id: string): Promise<PayrollRun> {
  const run = await findRunOrThrow(id);
  if (run.status !== 'approved') {
    throw new AppError('仅已审批批次可锁定', 400, 73403);
  }
  const updated = await prisma.payrollRun.update({
    where: { id },
    data: {
      status: 'locked',
      locked: true,
      lockedAt: new Date(),
    },
  });
  await prisma.payslip.updateMany({
    where: { runId: id },
    data: { status: 'locked' },
  });
  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PAYROLL_RUN_LOCK',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '锁定算薪批次',
  });
  return updated;
}

/**
 * HR 提交财务复核（draft → submitted）
 */
export async function submitPayrollRun(actorId: string, id: string): Promise<PayrollRun> {
  const run = await findRunOrThrow(id);
  assertNotLocked(run);
  if (run.status !== 'draft') {
    throw new AppError('仅草稿可提交', 400, 73403);
  }
  if (run.anomalyCount > 0) {
    throw new AppError('存在未解决异常，禁止提交', 400, 73405);
  }
  const flows = await getApprovalFlows();
  await startApproval(actorId, run, flows.hr, `算薪 ${run.period} HR 提交`);
  const updated = await prisma.payrollRun.update({
    where: { id },
    data: {
      status: 'submitted',
      submittedAt: new Date(),
      submittedById: actorId,
    },
  });
  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PAYROLL_RUN_SUBMIT',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '提交财务复核',
  });
  return updated;
}

/**
 * 财务复核（submitted → reviewed）；hr 兼任
 */
export async function reviewPayrollRun(
  actorId: string,
  id: string,
  _input: { comment?: string } = {},
): Promise<PayrollRun> {
  const run = await findRunOrThrow(id);
  assertNotLocked(run);
  if (run.status !== 'submitted') {
    throw new AppError('仅已提交批次可复核', 400, 73403);
  }
  const flows = await getApprovalFlows();
  await startApproval(actorId, run, flows.finance, `算薪 ${run.period} 财务复核`);
  const updated = await prisma.payrollRun.update({
    where: { id },
    data: {
      status: 'reviewed',
      reviewedAt: new Date(),
      reviewedById: actorId,
    },
  });
  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PAYROLL_RUN_REVIEW',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '财务复核通过',
  });
  return updated;
}

/**
 * 财务拒绝（submitted → draft）
 */
export async function rejectPayrollRun(
  actorId: string,
  id: string,
  reason: string,
): Promise<PayrollRun> {
  const run = await findRunOrThrow(id);
  assertNotLocked(run);
  if (run.status !== 'submitted') {
    throw new AppError('仅已提交批次可拒绝', 400, 73403);
  }
  const instance = await prisma.approvalInstance.findFirst({
    where: { businessType: 'payroll', businessId: id, status: 'pending' },
  });
  if (instance) {
    await approvalService.withdraw({
      instanceId: instance.id,
      initiatorId: instance.initiatorId,
    });
  }
  const updated = await prisma.payrollRun.update({
    where: { id },
    data: {
      status: 'draft',
      remark: reason,
      submittedAt: null,
      submittedById: null,
    },
  });
  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PAYROLL_RUN_REJECT',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `拒绝算薪：${reason}`,
  });
  return updated;
}

/**
 * CEO 审批（reviewed → approved；可选自动锁定）
 */
export async function approvePayrollRun(actorId: string, id: string): Promise<PayrollRun> {
  const run = await findRunOrThrow(id);
  assertNotLocked(run);
  if (run.status !== 'reviewed') {
    throw new AppError('仅已复核批次可审批', 400, 73403);
  }
  if (run.anomalyCount > 0) {
    throw new AppError('存在未解决异常，禁止审批', 400, 73405);
  }
  const flows = await getApprovalFlows();
  await startApproval(actorId, run, flows.ceo, `算薪 ${run.period} CEO 审批`);
  let updated = await prisma.payrollRun.update({
    where: { id },
    data: {
      status: 'approved',
      approvedAt: new Date(),
      approvedById: actorId,
    },
  });
  await prisma.payslip.updateMany({
    where: { runId: id },
    data: { status: 'approved' },
  });
  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PAYROLL_RUN_APPROVE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: 'CEO 审批通过',
  });
  const autoLock = await getLockAfterApprove();
  if (autoLock) {
    updated = await lockPayrollRun(actorId, id);
  }
  return updated;
}
