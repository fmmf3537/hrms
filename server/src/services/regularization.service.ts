// M1-A4: 转正流程 service | HRMS
// 状态机：draft → submitted → approved / rejected / cancelled
// 审批/通知/配置/审计复用既有 export；员工状态/薪资历史走 prisma 直接操作

import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as approvalService from './approval.service';
import * as auditService from './audit.service';
import * as configService from './config.service';
import * as notificationService from './notification.service';

const RESOURCE_TYPE = 'RegularizationRecord';

/** 通知模板键（TEMPLATE_KEYS 不存在于 notification.service，此处常量 + bypassTemplate fallback） */
const NOTIFY_CONFIRMED = 'regularization_confirmed:in_app';
const NOTIFY_REJECTED = 'regularization_rejected:in_app';
// regularization_upcoming:in_app — listUpcoming 仅返回列表，通知由 BullMQ 调用方发送

export interface CreateRegularizationInput {
  employeeId: string;
  selfEvaluation?: string;
  managerEvaluation?: string;
  hrEvaluation?: string;
  performanceScore?: number;
  newBaseSalary?: number;
  newPerformanceSalary?: number;
  newTotalSalary?: number;
  createdBy?: string;
}

export interface UpdateRegularizationInput {
  selfEvaluation?: string | null;
  managerEvaluation?: string | null;
  hrEvaluation?: string | null;
  performanceScore?: number | null;
  newBaseSalary?: number | null;
  newPerformanceSalary?: number | null;
  newTotalSalary?: number | null;
}

export interface ListRegularizationsQuery {
  companyId?: string;
  departmentId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

function toOptionalDecimal(v: number | null | undefined): Decimal | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return new Decimal(v);
}

async function getProbationMonths(): Promise<number> {
  try {
    const v = await configService.getValue('probation', 'months');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 3;
  } catch {
    // TODO: configs.probation.months fallback
    return 3;
  }
}

async function getRemindDays(): Promise<number> {
  try {
    const v = await configService.getValue('probation', 'remind_days');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 15;
  } catch {
    // TODO: configs.probation.remind_days fallback
    return 15;
  }
}

async function getApprovalFlowKey(): Promise<string> {
  try {
    const v = await configService.getValue('regularization', 'approval_flow_key');
    return typeof v === 'string' ? v : 'regularization:regularization_approval';
  } catch {
    // TODO: configs.regularization.approval_flow_key fallback
    return 'regularization:regularization_approval';
  }
}

async function getSalaryEffective(): Promise<string> {
  try {
    const v = await configService.getValue('regularization', 'salary_effective');
    return typeof v === 'string' ? v : 'next_month';
  } catch {
    // TODO: configs.regularization.salary_effective fallback
    return 'next_month';
  }
}

async function getApprovalNodes(): Promise<string[]> {
  try {
    const v = await configService.getValue('regularization', 'approval_nodes');
    if (Array.isArray(v)) return v.map(String);
    return ['department_leader', 'hr', 'ceo'];
  } catch {
    // TODO: configs.regularization.approval_nodes fallback
    return ['department_leader', 'hr', 'ceo'];
  }
}

/**
 * 计算试用期到期日 = hireDate + configs.probation.months
 */
async function getProbationEndDate(hireDate: Date): Promise<Date> {
  const months = await getProbationMonths();
  const end = new Date(hireDate);
  end.setMonth(end.getMonth() + months);
  return end;
}

/**
 * 次月 1 号（薪资生效用）
 */
function getNextMonthStart(from: Date = new Date()): Date {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

/**
 * 校验员工为试用期
 */
async function validateEmployeeProbation(employeeId: string) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404, 71201);
  }
  if (employee.status !== 'probation') {
    throw new AppError('仅试用期员工可发起转正', 400, 71404);
  }
  return employee;
}

/**
 * 校验无进行中的转正记录（cancelled / rejected 可重新提交）
 */
async function validateNoActiveRegularization(employeeId: string): Promise<void> {
  const existing = await prisma.regularizationRecord.findFirst({
    where: {
      employeeId,
      status: { notIn: ['cancelled', 'rejected'] },
    },
  });
  if (existing) {
    throw new AppError('该员工已有进行中的转正记录', 409, 71405);
  }
}

function validateSalaryFields(input: {
  newBaseSalary?: number | null;
  newTotalSalary?: number | null;
}): void {
  if (input.newBaseSalary != null && input.newTotalSalary == null) {
    throw new AppError('调整基本工资时必须提供 newTotalSalary', 400, 71407);
  }
}

/**
 * HR 代员工创建转正草稿
 */
export async function createRegularization(input: CreateRegularizationInput) {
  validateSalaryFields(input);
  const employee = await validateEmployeeProbation(input.employeeId);
  await validateNoActiveRegularization(input.employeeId);

  const probationEndDate = await getProbationEndDate(employee.hireDate);

  const record = await prisma.regularizationRecord.create({
    data: {
      employeeId: input.employeeId,
      hireDate: employee.hireDate,
      probationEndDate,
      selfEvaluation: input.selfEvaluation,
      managerEvaluation: input.managerEvaluation,
      hrEvaluation: input.hrEvaluation,
      performanceScore: input.performanceScore,
      newBaseSalary: toOptionalDecimal(input.newBaseSalary) ?? undefined,
      newPerformanceSalary: toOptionalDecimal(input.newPerformanceSalary) ?? undefined,
      newTotalSalary: toOptionalDecimal(input.newTotalSalary) ?? undefined,
      status: 'draft',
      createdBy: input.createdBy,
    },
  });

  await auditService.auditLog({
    userId: input.createdBy,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.CREATE,
    resourceType: RESOURCE_TYPE,
    resourceId: record.id,
    description: `创建转正草稿 employee=${input.employeeId}`,
    newValue: {
      employeeId: record.employeeId,
      probationEndDate: probationEndDate.toISOString().slice(0, 10),
      status: 'draft',
    },
  });

  return record;
}

/**
 * 按 ID 查询（附带 employee 信息）
 */
export async function getRegularizationById(id: string) {
  const record = await prisma.regularizationRecord.findUnique({ where: { id } });
  if (!record) {
    throw new AppError('转正记录不存在', 404, 71401);
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
    },
  });
  return { ...record, employee };
}

/**
 * 分页列表（companyId/departmentId 经 employee 过滤）
 */
export async function listRegularizations(query: ListRegularizationsQuery = {}) {
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

  const where: Prisma.RegularizationRecordWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.regularizationRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.regularizationRecord.count({ where }),
  ]);

  return {
    data, total, page, pageSize,
  };
}

/**
 * 更新草稿（仅 draft）
 */
export async function updateRegularization(
  id: string,
  input: UpdateRegularizationInput,
  operatorId?: string,
) {
  const existing = await prisma.regularizationRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('转正记录不存在', 404, 71401);
  }
  if (existing.status !== 'draft') {
    throw new AppError('仅草稿状态可修改', 409, 71403);
  }
  let effectiveBase = input.newBaseSalary;
  if (effectiveBase === undefined) {
    effectiveBase = existing.newBaseSalary != null
      ? Number(existing.newBaseSalary)
      : undefined;
  }
  let effectiveTotal = input.newTotalSalary;
  if (effectiveTotal === undefined) {
    effectiveTotal = existing.newTotalSalary != null
      ? Number(existing.newTotalSalary)
      : undefined;
  }
  validateSalaryFields({
    newBaseSalary: effectiveBase,
    newTotalSalary: effectiveTotal,
  });

  const updated = await prisma.regularizationRecord.update({
    where: { id },
    data: {
      selfEvaluation: input.selfEvaluation,
      managerEvaluation: input.managerEvaluation,
      hrEvaluation: input.hrEvaluation,
      performanceScore: input.performanceScore,
      newBaseSalary: toOptionalDecimal(input.newBaseSalary),
      newPerformanceSalary: toOptionalDecimal(input.newPerformanceSalary),
      newTotalSalary: toOptionalDecimal(input.newTotalSalary),
    },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.UPDATE,
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '更新转正草稿',
    oldValue: { status: existing.status },
    newValue: { performanceScore: updated.performanceScore },
  });

  return updated;
}

/**
 * 提交审批：draft → submitted
 */
export async function submitRegularization(id: string, operatorId: string) {
  const existing = await prisma.regularizationRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('转正记录不存在', 404, 71401);
  }
  if (existing.status === 'submitted') {
    throw new AppError('转正已提交', 409, 71402);
  }
  if (existing.status !== 'draft') {
    throw new AppError('仅草稿可提交审批', 409, 71403);
  }

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404, 71201);
  }

  const flowKey = await getApprovalFlowKey();
  const nodes = await getApprovalNodes();

  const instance = await approvalService.submitApproval({
    flowKey,
    businessType: 'regularization',
    businessId: id,
    initiatorId: operatorId,
    title: `${employee.name} 转正审批`,
    data: {
      employeeId: existing.employeeId,
      currentStatus: employee.status,
      probationEndDate: existing.probationEndDate.toISOString().slice(0, 10),
      performanceScore: existing.performanceScore,
      newBaseSalary: existing.newBaseSalary != null ? Number(existing.newBaseSalary) : null,
      approvalNodes: nodes,
    },
  });

  const updated = await prisma.regularizationRecord.update({
    where: { id },
    data: {
      status: 'submitted',
      approvalInstanceId: instance.id,
    },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.UPDATE,
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `提交转正审批 ${employee.name}`,
    oldValue: { status: 'draft' },
    newValue: { status: 'submitted', approvalInstanceId: instance.id },
  });

  return updated;
}

/**
 * 审批通过回调：submitted → approved；员工 status probation → active
 */
export async function confirmRegularization(
  id: string,
  approvalResult: { approved: boolean; instanceId?: string },
  operatorId: string,
) {
  const existing = await prisma.regularizationRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('转正记录不存在', 404, 71401);
  }
  if (existing.status === 'approved') {
    throw new AppError('转正已批准', 409, 71405);
  }
  if (existing.status !== 'submitted') {
    throw new AppError('非法状态转换：仅 submitted 可确认转正', 409, 71403);
  }
  if (!approvalResult.approved) {
    throw new AppError('审批未通过，无法确认转正', 400, 71406);
  }

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404, 71201);
  }

  const salaryEffective = await getSalaryEffective();
  const effectiveDate = salaryEffective === 'next_month'
    ? getNextMonthStart()
    : new Date();

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: existing.employeeId },
      data: { status: 'active' },
    });

    if (existing.newBaseSalary != null) {
      const base = existing.newBaseSalary;
      const perf = existing.newPerformanceSalary ?? new Decimal(0);
      const total = existing.newTotalSalary ?? base.add(perf);
      await tx.employeeSalaryHistory.create({
        data: {
          employeeId: existing.employeeId,
          effectiveDate,
          baseSalary: base,
          performanceSalary: existing.newPerformanceSalary,
          totalSalary: total,
          changeType: 'regularization',
          reason: '转正调薪',
          operatorId,
        },
      });
    }

    await tx.regularizationRecord.update({
      where: { id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: operatorId,
        approvalInstanceId: approvalResult.instanceId ?? existing.approvalInstanceId,
      },
    });
  });

  if (employee.userId) {
    // TODO: 模板 regularization_confirmed 入库后去掉 bypassTemplate
    await notificationService.sendNotification({
      templateKey: NOTIFY_CONFIRMED,
      userId: employee.userId,
      data: {
        employee_name: employee.name,
        employee_id: employee.id,
        regularization_id: id,
      },
      bypassTemplate: {
        channel: 'in_app',
        subject: '转正已通过',
        content: `您好 ${employee.name}，您的转正申请已通过。`,
      },
    }).catch(() => undefined);
  }

  const updated = await prisma.regularizationRecord.findUnique({ where: { id } });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'APPROVE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `确认转正 ${employee.name}`,
    newValue: { status: 'approved', employeeStatus: 'active' },
  });

  return updated!;
}

/**
 * 审批拒绝：submitted → rejected
 */
export async function rejectRegularization(
  id: string,
  reason: string,
  operatorId: string,
) {
  const existing = await prisma.regularizationRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('转正记录不存在', 404, 71401);
  }
  if (existing.status !== 'submitted') {
    throw new AppError('仅已提交状态可驳回', 409, 71403);
  }

  const updated = await prisma.regularizationRecord.update({
    where: { id },
    data: {
      status: 'rejected',
      rejectedAt: new Date(),
      rejectedBy: operatorId,
      rejectedReason: reason,
    },
  });

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
    select: {
      name: true, userId: true,
    },
  });

  if (employee?.userId) {
    // TODO: 模板 regularization_rejected 入库后去掉 bypassTemplate
    await notificationService.sendNotification({
      templateKey: NOTIFY_REJECTED,
      userId: employee.userId,
      data: {
        employee_name: employee.name,
        reason,
        regularization_id: id,
      },
      bypassTemplate: {
        channel: 'in_app',
        subject: '转正已驳回',
        content: `${employee.name} 的转正申请已驳回：${reason}`,
      },
    }).catch(() => undefined);
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'REJECT',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `驳回转正 ${employee?.name ?? existing.employeeId}`,
    oldValue: { status: 'submitted' },
    newValue: { status: 'rejected', reason },
  });

  return updated;
}

/**
 * 取消/撤回
 */
export async function cancelRegularization(
  id: string,
  reason: string,
  operatorId: string,
) {
  const existing = await prisma.regularizationRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('转正记录不存在', 404, 71401);
  }
  if (existing.status === 'approved') {
    throw new AppError('已批准的转正不可取消', 409, 71408);
  }
  if (existing.status === 'cancelled' || existing.status === 'rejected') {
    throw new AppError('当前状态不可取消', 409, 71408);
  }
  if (existing.status !== 'draft' && existing.status !== 'submitted') {
    throw new AppError('当前状态不可取消', 409, 71408);
  }

  if (existing.status === 'submitted' && existing.approvalInstanceId) {
    await approvalService.withdraw({
      instanceId: existing.approvalInstanceId,
      initiatorId: operatorId,
    });
  }

  const updated = await prisma.regularizationRecord.update({
    where: { id },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledBy: operatorId,
      cancelledReason: reason,
    },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'CANCEL',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '取消转正申请',
    oldValue: { status: existing.status },
    newValue: { status: 'cancelled', reason },
  });

  return updated;
}

/**
 * 试用期即将到期员工列表（供 BullMQ 调用；定时任务本身不在 A4 范围）
 * @param days 提前天数，默认读 configs.probation.remind_days
 */
export async function listUpcomingRegularizations(days?: number) {
  const windowDays = days ?? await getRemindDays();
  const months = await getProbationMonths();
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + windowDays);

  const employees = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      status: 'probation',
    },
    select: {
      id: true,
      employeeNo: true,
      name: true,
      companyId: true,
      departmentId: true,
      hireDate: true,
      userId: true,
    },
  });

  const result = employees
    .map((emp) => {
      const probationEndDate = new Date(emp.hireDate);
      probationEndDate.setMonth(probationEndDate.getMonth() + months);
      return { ...emp, probationEndDate };
    })
    .filter((emp) => emp.probationEndDate >= now && emp.probationEndDate <= end);

  // TODO: 模板 regularization_upcoming 入库后可由 BullMQ 调用方发通知；此处仅返回列表

  return {
    days: windowDays,
    count: result.length,
    data: result,
  };
}
