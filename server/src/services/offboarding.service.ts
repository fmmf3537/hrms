// M1-A6: 离职流程 service | HRMS
// 状态机：draft → handover_pending → submitted → approved → certificate_issued
//                      / rejected / cancelled
// 仅 import approval/audit/config/notification + prisma；员工状态/账号禁用走 prisma

import { promises as fs } from 'fs';
import path from 'path';

import type { Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as approvalService from './approval.service';
import * as auditService from './audit.service';
import * as configService from './config.service';
import * as notificationService from './notification.service';

const RESOURCE_TYPE = 'OffboardingRecord';

const NOTIFY_CREATED = 'offboarding_created:in_app';
const NOTIFY_APPROVED = 'offboarding_approved:in_app';
const NOTIFY_REJECTED = 'offboarding_rejected:in_app';
const NOTIFY_CERTIFICATE = 'offboarding_certificate:in_app';

const HANDOVER_CATEGORY_MAP: Record<string, string> = {
  工作文档交接: 'document',
  '客户/项目交接': 'client',
  '财务/物资交接': 'finance',
  系统账号交接: 'account',
  未了事项说明: 'misc',
};

const DEFAULT_HANDOVER = [
  '工作文档交接', '客户/项目交接', '财务/物资交接', '系统账号交接', '未了事项说明',
];

/** 离职 1 年后档案访问角色默认（与 configs.offboarding.archive_access_after_1y 一致） */
const DEFAULT_ARCHIVE_ROLES = ['admin', 'hr'];

export interface CreateOffboardingInput {
  employeeId: string;
  resignationType: 'employee_initiated' | 'company_initiated';
  reason?: string;
  lastWorkingDate: Date | string;
}

export interface ListOffboardingsQuery {
  companyId?: string;
  departmentId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

async function getHandoverTemplate(): Promise<string[]> {
  try {
    const v = await configService.getValue('offboarding', 'handover_template');
    if (Array.isArray(v)) return v.map(String);
    return [...DEFAULT_HANDOVER];
  } catch {
    // TODO: configs.offboarding.handover_template fallback
    return [...DEFAULT_HANDOVER];
  }
}

async function getApprovalFlowKey(): Promise<string> {
  try {
    const v = await configService.getValue('offboarding', 'approval_flow_key');
    return typeof v === 'string' ? v : 'offboarding:offboarding_approval';
  } catch {
    // TODO: configs.offboarding.approval_flow_key fallback
    return 'offboarding:offboarding_approval';
  }
}

async function getAccountDisableStrategy(): Promise<'on_resignation_date' | 'immediately'> {
  try {
    const v = await configService.getValue('offboarding', 'account_disable_strategy');
    if (v === 'immediately') return 'immediately';
    return 'on_resignation_date';
  } catch {
    // TODO: configs.offboarding.account_disable_strategy fallback
    return 'on_resignation_date';
  }
}

async function getArchiveYears(): Promise<number> {
  try {
    const v = await configService.getValue('archive', 'years');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 5;
  } catch {
    // TODO: configs.archive.years fallback
    return 5;
  }
}

async function getCertNumberFormat(): Promise<string> {
  try {
    const v = await configService.getValue('offboarding', 'certificate_number_format');
    return typeof v === 'string' ? v : 'OFFBOARD-{year}{seq:4}';
  } catch {
    // TODO: configs.offboarding.certificate_number_format fallback
    return 'OFFBOARD-{year}{seq:4}';
  }
}

async function getArchiveAccessRoles(): Promise<string[]> {
  try {
    const v = await configService.getValue('offboarding', 'archive_access_after_1y');
    if (Array.isArray(v)) return v.map(String);
    return [...DEFAULT_ARCHIVE_ROLES];
  } catch {
    // TODO: configs.offboarding.archive_access_after_1y fallback
    return [...DEFAULT_ARCHIVE_ROLES];
  }
}

/**
 * 生成证书编号（与 employee_no 算法类似）
 */
async function generateCertificateNumber(): Promise<string> {
  const format = await getCertNumberFormat();
  const year = String(new Date().getFullYear());
  const prefix = format
    .replace('{year}', year)
    .replace(/\{seq:\d+\}/, '');

  const latest = await prisma.offboardingRecord.findFirst({
    where: { certificateNumber: { startsWith: prefix } },
    orderBy: { certificateNumber: 'desc' },
    select: { certificateNumber: true },
  });

  let seq = 1;
  if (latest?.certificateNumber) {
    const tail = latest.certificateNumber.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) seq = n + 1;
  }

  const seqMatch = /\{seq:(\d+)\}/.exec(format);
  const width = seqMatch ? Number(seqMatch[1]) : 4;
  return `${prefix}${String(seq).padStart(width, '0')}`;
}

/**
 * 账号禁用（immediately 立即禁用；on_resignation_date 仅记录，BullMQ 扫描执行）
 */
async function disableUserAccount(
  userId: string,
  strategy: 'on_resignation_date' | 'immediately',
  _effectiveAt: Date,
): Promise<{ disabledNow: boolean }> {
  if (strategy === 'immediately') {
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'disabled' },
    });
    return { disabledNow: true };
  }
  // on_resignation_date：A6 仅记录逻辑，定时禁用留独立 BullMQ 任务
  return { disabledNow: false };
}

/**
 * 档案归档元数据写入
 */
async function archiveEmployee(offboardingId: string): Promise<number> {
  const years = await getArchiveYears();
  await prisma.offboardingRecord.update({
    where: { id: offboardingId },
    data: {
      archivedAt: new Date(),
      archiveRetentionYears: years,
    },
  });
  return years;
}

/**
 * 提交离职申请（直接进入 handover_pending + 创建 5 个交接任务）
 */
export async function createOffboarding(
  input: CreateOffboardingInput,
  createdBy: string,
) {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404, 71201);
  }
  if (employee.status !== 'active') {
    throw new AppError('仅在职员工可发起离职', 400, 71504);
  }

  const existing = await prisma.offboardingRecord.findFirst({
    where: {
      employeeId: input.employeeId,
      status: { notIn: ['rejected', 'cancelled'] },
    },
  });
  if (existing) {
    throw new AppError('该员工已有进行中的离职记录', 409, 71505);
  }

  const template = await getHandoverTemplate();
  const lastWorkingDate = toDate(input.lastWorkingDate);
  const archiveYears = await getArchiveYears();

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.offboardingRecord.create({
      data: {
        employeeId: input.employeeId,
        resignationType: input.resignationType,
        reason: input.reason,
        lastWorkingDate,
        status: 'handover_pending',
        archiveRetentionYears: archiveYears,
        createdBy,
        tasks: {
          create: template.map((name) => ({
            name,
            category: HANDOVER_CATEGORY_MAP[name] ?? 'misc',
            status: 'pending',
          })),
        },
      },
      include: { tasks: true },
    });
    return created;
  });

  await auditService.auditLog({
    userId: createdBy,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.CREATE,
    resourceType: RESOURCE_TYPE,
    resourceId: record.id,
    description: `创建离职申请 employee=${input.employeeId}`,
    newValue: {
      status: 'handover_pending',
      resignationType: input.resignationType,
      taskCount: record.tasks.length,
    },
  });

  // TODO: 模板 offboarding_created 入库后去掉 bypassTemplate
  if (employee.userId) {
    await notificationService.sendNotification({
      templateKey: NOTIFY_CREATED,
      userId: employee.userId,
      data: {
        employee_name: employee.name,
        last_working_date: lastWorkingDate.toISOString().slice(0, 10),
        offboarding_id: record.id,
      },
      bypassTemplate: {
        channel: 'in_app',
        subject: '离职申请已创建',
        content: `${employee.name} 的离职申请已进入工作交接阶段。`,
      },
    }).catch(() => undefined);
  }

  return record;
}

/**
 * 单查（含 employee + tasks）
 */
export async function getOffboardingById(id: string) {
  const record = await prisma.offboardingRecord.findUnique({
    where: { id },
    include: { tasks: { orderBy: { createdAt: 'asc' } } },
  });
  if (!record) {
    throw new AppError('离职记录不存在', 404, 71501);
  }
  const employee = await prisma.employee.findFirst({
    where: { id: record.employeeId, deletedAt: null },
    select: {
      id: true,
      employeeNo: true,
      name: true,
      status: true,
      companyId: true,
      departmentId: true,
      hireDate: true,
      userId: true,
      resignationDate: true,
    },
  });
  return { ...record, employee };
}

/**
 * 分页列表
 */
export async function listOffboardings(query: ListOffboardingsQuery = {}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  let employeeIds: string[] | undefined;
  if (query.companyId || query.departmentId) {
    const emps = await prisma.employee.findMany({
      where: {
        deletedAt: null,
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      },
      select: { id: true },
    });
    employeeIds = emps.map((e) => e.id);
    if (employeeIds.length === 0) {
      return {
        data: [], total: 0, page, pageSize,
      };
    }
  }

  const where: Prisma.OffboardingRecordWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.offboardingRecord.findMany({
      where,
      include: { tasks: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.offboardingRecord.count({ where }),
  ]);

  return {
    data, total, page, pageSize,
  };
}

/**
 * 提交审批（内部，confirmHandover 调用）
 */
async function submitOffboardingInternal(id: string, operatorId: string): Promise<string> {
  const existing = await prisma.offboardingRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('离职记录不存在', 404, 71501);
  }
  if (existing.status === 'submitted') {
    throw new AppError('离职已提交审批', 409, 71502);
  }

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404, 71201);
  }

  const flowKey = await getApprovalFlowKey();
  const instance = await approvalService.submitApproval({
    flowKey,
    businessType: 'offboarding',
    businessId: id,
    initiatorId: operatorId,
    title: `${employee.name} 离职审批`,
    data: {
      employeeId: existing.employeeId,
      lastWorkingDate: existing.lastWorkingDate.toISOString().slice(0, 10),
      resignationType: existing.resignationType,
    },
  });

  await prisma.offboardingRecord.update({
    where: { id },
    data: {
      status: 'submitted',
      approvalInstanceId: instance.id,
      handoverCompleted: true,
      handoverCompletedBy: operatorId,
      handoverCompletedAt: new Date(),
    },
  });

  return instance.id;
}

/**
 * 部门负责人确认交接（handover_pending → submitted）
 */
export async function confirmHandover(id: string, operatorId: string) {
  const existing = await prisma.offboardingRecord.findUnique({
    where: { id },
    include: { tasks: true },
  });
  if (!existing) {
    throw new AppError('离职记录不存在', 404, 71501);
  }
  if (existing.status !== 'handover_pending') {
    throw new AppError('仅交接中状态可确认交接', 409, 71503);
  }

  const incomplete = existing.tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'skipped',
  );
  if (incomplete.length > 0) {
    throw new AppError('工作交接未完成', 409, 71505);
  }

  await submitOffboardingInternal(id, operatorId);

  const updated = await prisma.offboardingRecord.findUnique({
    where: { id },
    include: { tasks: true },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.UPDATE,
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '确认工作交接并提交离职审批',
    oldValue: { status: 'handover_pending' },
    newValue: { status: 'submitted' },
  });

  return updated!;
}

/**
 * 审批拒绝：submitted → rejected
 */
export async function rejectOffboarding(
  id: string,
  reason: string,
  operatorId: string,
) {
  const existing = await prisma.offboardingRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('离职记录不存在', 404, 71501);
  }
  if (existing.status !== 'submitted') {
    throw new AppError('仅已提交状态可驳回', 409, 71503);
  }

  const updated = await prisma.offboardingRecord.update({
    where: { id },
    data: {
      status: 'rejected',
      cancelledReason: reason,
    },
    include: { tasks: true },
  });

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
    select: { name: true, userId: true },
  });

  if (employee?.userId) {
    // TODO: 模板 offboarding_rejected 入库后去掉 bypassTemplate
    await notificationService.sendNotification({
      templateKey: NOTIFY_REJECTED,
      userId: employee.userId,
      data: {
        employee_name: employee.name,
        reason,
        offboarding_id: id,
      },
      bypassTemplate: {
        channel: 'in_app',
        subject: '离职审批已驳回',
        content: `${employee.name} 的离职申请已驳回：${reason}`,
      },
    }).catch(() => undefined);
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'REJECT',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `驳回离职 ${employee?.name ?? existing.employeeId}`,
    oldValue: { status: 'submitted' },
    newValue: { status: 'rejected', reason },
  });

  return updated;
}

/**
 * 审批通过回调：submitted → approved
 */
export async function confirmOffboarding(
  id: string,
  approvalResult: { approved: boolean; instanceId?: string },
  operatorId: string,
) {
  if (!approvalResult.approved) {
    return rejectOffboarding(id, '审批未通过', operatorId);
  }

  const existing = await prisma.offboardingRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('离职记录不存在', 404, 71501);
  }
  if (existing.status !== 'submitted') {
    throw new AppError('非法状态转换：仅 submitted 可确认离职', 409, 71503);
  }

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404, 71201);
  }

  const strategy = await getAccountDisableStrategy();
  let accountDisabled = false;
  let accountDisabledAt: Date | null = null;

  if (employee.userId) {
    const result = await disableUserAccount(
      employee.userId,
      strategy,
      existing.lastWorkingDate,
    );
    if (result.disabledNow) {
      accountDisabled = true;
      accountDisabledAt = new Date();
    }
  }

  await prisma.employee.update({
    where: { id: existing.employeeId },
    data: {
      status: 'resigned',
      resignationDate: existing.lastWorkingDate,
    },
  });

  const years = await archiveEmployee(id);

  const updated = await prisma.offboardingRecord.update({
    where: { id },
    data: {
      status: 'approved',
      approvalInstanceId: approvalResult.instanceId ?? existing.approvalInstanceId,
      accountDisabled,
      accountDisabledAt,
      archiveRetentionYears: years,
    },
    include: { tasks: true },
  });

  if (employee.userId) {
    // TODO: 模板 offboarding_approved 入库后去掉 bypassTemplate
    await notificationService.sendNotification({
      templateKey: NOTIFY_APPROVED,
      userId: employee.userId,
      data: {
        employee_name: employee.name,
        last_working_date: existing.lastWorkingDate.toISOString().slice(0, 10),
        offboarding_id: id,
      },
      bypassTemplate: {
        channel: 'in_app',
        subject: '离职审批已通过',
        content: `${employee.name}，您的离职申请已通过，最后工作日为 ${existing.lastWorkingDate.toISOString().slice(0, 10)}。`,
      },
    }).catch(() => undefined);
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'APPROVE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `确认离职 ${employee.name}`,
    newValue: {
      status: 'approved',
      employeeStatus: 'resigned',
      accountDisabled,
    },
  });

  return updated;
}

/**
 * 离职证明生成（approved → certificate_issued）；一期 mock HTML+水印，不接 e-签宝
 */
export async function issueCertificate(id: string, operatorId: string) {
  const existing = await prisma.offboardingRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('离职记录不存在', 404, 71501);
  }
  if (existing.certificateIssued || existing.status === 'certificate_issued') {
    throw new AppError('证书已签发', 409, 71507);
  }
  if (existing.status !== 'approved') {
    throw new AppError('仅已批准状态可签发离职证明', 409, 71503);
  }

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404, 71201);
  }

  const company = await prisma.company.findFirst({
    where: { id: employee.companyId, deletedAt: null },
  });

  const certificateNumber = await generateCertificateNumber();
  const companyName = company?.name ?? '西安辰航卓越科技有限公司';
  const lastDay = existing.lastWorkingDate.toISOString().slice(0, 10);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"/><title>离职证明 ${certificateNumber}</title>
<style>
body{font-family:serif;padding:48px;position:relative;color:#222}
.watermark{position:fixed;top:40%;left:10%;font-size:42px;color:rgba(0,0,0,.08);
  transform:rotate(-30deg);pointer-events:none;white-space:nowrap}
h1{text-align:center;letter-spacing:.3em}
.meta{margin-top:32px;line-height:2}
.seal{margin-top:64px;text-align:right}
</style></head>
<body>
<div class="watermark">${companyName}</div>
<h1>离 职 证 明</h1>
<p class="meta">编号：${certificateNumber}</p>
<p class="meta">兹证明 <strong>${employee.name}</strong>（工号 ${employee.employeeNo}）
曾在本公司任职，于 <strong>${lastDay}</strong> 正式离职。特此证明。</p>
<p class="seal">${companyName}<br/>签发日期：${new Date().toISOString().slice(0, 10)}</p>
</body></html>`;

  const dir = path.join(process.cwd(), 'uploads', 'offboarding-certificates');
  const fileName = `${certificateNumber}.html`;
  const filePath = path.join(dir, fileName);
  const certificateUrl = `/uploads/offboarding-certificates/${fileName}`;

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, html, 'utf8');
  } catch (err) {
    throw new AppError(
      `证书生成失败: ${err instanceof Error ? err.message : 'unknown'}`,
      500,
      71510,
    );
  }

  const updated = await prisma.offboardingRecord.update({
    where: { id },
    data: {
      status: 'certificate_issued',
      certificateIssued: true,
      certificateIssuedAt: new Date(),
      certificateIssuedBy: operatorId,
      certificateNumber,
      certificateUrl,
    },
    include: { tasks: true },
  });

  if (employee.userId) {
    // TODO: 模板 offboarding_certificate 入库后去掉 bypassTemplate
    await notificationService.sendNotification({
      templateKey: NOTIFY_CERTIFICATE,
      userId: employee.userId,
      data: {
        employee_name: employee.name,
        certificate_number: certificateNumber,
        certificate_url: certificateUrl,
        offboarding_id: id,
      },
      bypassTemplate: {
        channel: 'in_app',
        subject: '离职证明已签发',
        content: `${employee.name}，您的离职证明（${certificateNumber}）已生成。`,
      },
    }).catch(() => undefined);
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'ISSUE_CERTIFICATE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `签发离职证明 ${certificateNumber}`,
    newValue: { certificateNumber, certificateUrl },
  });

  return updated;
}

/**
 * 撤回 / 取消
 */
export async function cancelOffboarding(
  id: string,
  reason: string,
  operatorId: string,
) {
  const existing = await prisma.offboardingRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('离职记录不存在', 404, 71501);
  }
  if (existing.status === 'approved' || existing.status === 'certificate_issued') {
    throw new AppError('已批准的离职不可取消', 409, 71506);
  }
  if (existing.status === 'cancelled' || existing.status === 'rejected') {
    throw new AppError('当前状态不可取消', 409, 71506);
  }
  if (
    existing.status !== 'draft'
    && existing.status !== 'handover_pending'
    && existing.status !== 'submitted'
  ) {
    throw new AppError('当前状态不可取消', 409, 71506);
  }

  if (existing.status === 'submitted' && existing.approvalInstanceId) {
    await approvalService.withdraw({
      instanceId: existing.approvalInstanceId,
      initiatorId: operatorId,
    });
  }

  const updated = await prisma.offboardingRecord.update({
    where: { id },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledBy: operatorId,
      cancelledReason: reason,
    },
    include: { tasks: true },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'CANCEL',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '取消离职申请',
    oldValue: { status: existing.status },
    newValue: { status: 'cancelled', reason },
  });

  return updated;
}

/**
 * 即将离职列表（供 BullMQ 调用）
 */
export async function listUpcomingResignations(days: number) {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + days);

  return prisma.offboardingRecord.findMany({
    where: {
      status: 'approved',
      lastWorkingDate: { gte: now, lte: end },
    },
    orderBy: { lastWorkingDate: 'asc' },
  });
}

/**
 * 离职 1 年后档案访问 RBAC（同步；角色列表与 configs 默认一致）
 * @returns true 可访问；false 应抛 71509
 */
export function checkArchiveAccess(
  _employeeId: string,
  userRoles: string[],
  resignationDate: Date,
): boolean {
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - resignationDate.getTime();
  if (elapsed < oneYearMs) return true;
  // TODO: 生产可改为 async 读 configs.offboarding.archive_access_after_1y
  const allowed = DEFAULT_ARCHIVE_ROLES;
  return userRoles.some((r) => allowed.includes(r));
}

/**
 * 档案访问断言（async，读 config）；不可访问抛 71509
 */
export async function assertArchiveAccess(
  employeeId: string,
  userRoles: string[],
  resignationDate: Date,
): Promise<void> {
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  if (Date.now() - resignationDate.getTime() < oneYearMs) return;
  const allowed = await getArchiveAccessRoles();
  if (!userRoles.some((r) => allowed.includes(r))) {
    throw new AppError(`档案访问权限不足 (employee=${employeeId})`, 403, 71509);
  }
}
