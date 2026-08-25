// M1-A5: 调动流程 service | HRMS
// 状态机：draft → submitted → approved / rejected / cancelled
// 仅 import approval/audit/config/notification + prisma；员工/岗位/薪资历史走 prisma 直接操作

import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as approvalService from './approval.service';
import * as auditService from './audit.service';
import * as configService from './config.service';
import * as notificationService from './notification.service';

const RESOURCE_TYPE = 'TransferRecord';

const NOTIFY_APPROVED = 'transfer_approved:in_app';
const NOTIFY_REJECTED = 'transfer_rejected:in_app';

export interface CreateTransferInput {
  employeeId: string;
  transferType: 'transfer' | 'promote' | 'demote';
  reason?: string;
  fromCompanyId?: string;
  fromDeptId?: string;
  toCompanyId: string;
  toDeptId: string;
  toPosition: string;
  newBaseSalary?: number;
  newPerformanceSalary?: number;
  newTotalSalary?: number;
  effectiveDate: Date | string;
}

export interface UpdateTransferInput {
  transferType?: 'transfer' | 'promote' | 'demote';
  reason?: string | null;
  toCompanyId?: string;
  toDeptId?: string;
  toPosition?: string;
  newBaseSalary?: number | null;
  newPerformanceSalary?: number | null;
  newTotalSalary?: number | null;
  effectiveDate?: Date | string;
}

export interface ListTransfersQuery {
  employeeId?: string;
  status?: string;
  fromDeptId?: string;
  toDeptId?: string;
  page?: number;
  pageSize?: number;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function startOfDay(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toOptionalDecimal(v: number | null | undefined): Decimal | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return new Decimal(v);
}

function getNextMonthStart(from: Date = new Date()): Date {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

async function getApprovalFlowKey(): Promise<string> {
  try {
    const v = await configService.getValue('transfer', 'approval_flow_key');
    return typeof v === 'string' ? v : 'transfer:transfer_approval';
  } catch {
    // TODO: configs.transfer.approval_flow_key fallback
    return 'transfer:transfer_approval';
  }
}

async function getApprovalNodes(): Promise<string[]> {
  try {
    const v = await configService.getValue('transfer', 'approval_nodes');
    if (Array.isArray(v)) return v.map(String);
    return ['from_dept_leader', 'to_dept_leader', 'hr', 'ceo'];
  } catch {
    // TODO: configs.transfer.approval_nodes fallback
    return ['from_dept_leader', 'to_dept_leader', 'hr', 'ceo'];
  }
}

/**
 * 计算 effectiveDate 对应的薪资生效策略
 * @returns 'immediate' | 'next_month'
 */
async function getSalaryEffectiveStrategy(): Promise<'immediate' | 'next_month'> {
  try {
    const v = await configService.getValue('transfer', 'salary_effective');
    if (v === 'next_month') return 'next_month';
    return 'immediate';
  } catch {
    // TODO: configs.transfer.salary_effective fallback
    return 'immediate';
  }
}

async function getRequiresSalaryForPromote(): Promise<boolean> {
  try {
    const v = await configService.getValue('transfer', 'requires_salary_for_promote');
    if (typeof v === 'boolean') return v;
    return Boolean(v);
  } catch {
    // TODO: configs.transfer.requires_salary_for_promote fallback
    return true;
  }
}

async function getMaxFutureDays(): Promise<number> {
  try {
    const v = await configService.getValue('transfer', 'max_future_days');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 90;
  } catch {
    // TODO: configs.transfer.max_future_days fallback
    return 90;
  }
}

/**
 * 校验晋升/降职必填薪资
 */
async function validatePromoteDemoteSalary(
  transferType: string,
  input: { newBaseSalary?: number; newTotalSalary?: number },
): Promise<void> {
  if (transferType !== 'promote' && transferType !== 'demote') return;
  const required = await getRequiresSalaryForPromote();
  if (!required) return;
  if (input.newBaseSalary == null || input.newTotalSalary == null) {
    throw new AppError('晋升/降职必须提供新薪资', 400, 71607);
  }
}

/**
 * 校验生效日：>= today 且 <= today + max_future_days
 */
async function validateEffectiveDate(effectiveDate: Date): Promise<void> {
  const today = startOfDay();
  const eff = startOfDay(effectiveDate);
  if (eff < today) {
    throw new AppError('生效日不能早于今天', 400, 71609);
  }
  const maxDays = await getMaxFutureDays();
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + maxDays);
  if (eff > maxDate) {
    throw new AppError(`生效日不能超过未来 ${maxDays} 天`, 400, 71609);
  }
}

/**
 * 获取员工当前岗位（最新岗位历史）
 */
async function getCurrentPosition(employeeId: string): Promise<string | null> {
  const latest = await prisma.employeePositionHistory.findFirst({
    where: { employeeId },
    orderBy: { changeDate: 'desc' },
    select: { toPosition: true },
  });
  return latest?.toPosition ?? null;
}

async function enrichTransfer(record: {
  id: string;
  employeeId: string;
  fromDeptId: string;
  toDeptId: string;
  [key: string]: unknown;
}) {
  const [employee, fromDept, toDept] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: record.employeeId, deletedAt: null },
      select: {
        id: true, employeeNo: true, name: true, status: true,
      },
    }),
    prisma.department.findUnique({
      where: { id: record.fromDeptId },
      select: { id: true, name: true, code: true },
    }),
    prisma.department.findUnique({
      where: { id: record.toDeptId },
      select: { id: true, name: true, code: true },
    }),
  ]);
  return {
    ...record,
    employee,
    fromDept,
    toDept,
  };
}

/**
 * HR 提交调动申请（draft）
 */
export async function createTransfer(
  input: CreateTransferInput,
  createdBy: string,
) {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404, 71201);
  }
  if (employee.status !== 'active') {
    throw new AppError('仅在职员工可调动', 400, 71604);
  }

  const fromCompanyId = employee.companyId;
  const fromDeptId = employee.departmentId;
  if (!fromDeptId) {
    throw new AppError('员工未分配部门，无法调动', 409, 71603);
  }

  if (input.fromCompanyId && input.fromCompanyId !== fromCompanyId) {
    throw new AppError('调出公司与员工当前公司不一致', 409, 71603);
  }
  if (input.fromDeptId && input.fromDeptId !== fromDeptId) {
    throw new AppError('调出部门与员工当前部门不一致', 409, 71603);
  }

  const toCompany = await prisma.company.findUnique({
    where: { id: input.toCompanyId },
  });
  if (!toCompany) {
    throw new AppError('目标法人不存在', 404, 71001);
  }

  const toDept = await prisma.department.findUnique({
    where: { id: input.toDeptId },
  });
  if (!toDept || toDept.companyId !== input.toCompanyId) {
    throw new AppError('目标部门不存在', 400, 71610);
  }

  if (fromDeptId === input.toDeptId) {
    throw new AppError('调出和调入部门相同，无需调动', 409, 71605);
  }

  const pending = await prisma.transferRecord.findFirst({
    where: {
      employeeId: input.employeeId,
      status: { notIn: ['rejected', 'cancelled'] },
    },
  });
  if (pending) {
    throw new AppError('该员工已有进行中的调动', 409, 71606);
  }

  await validatePromoteDemoteSalary(input.transferType, input);

  const effectiveDate = toDate(input.effectiveDate);
  await validateEffectiveDate(effectiveDate);

  const fromPosition = await getCurrentPosition(input.employeeId);

  const record = await prisma.transferRecord.create({
    data: {
      employeeId: input.employeeId,
      transferType: input.transferType,
      reason: input.reason,
      fromCompanyId,
      fromDeptId,
      fromPosition,
      toCompanyId: input.toCompanyId,
      toDeptId: input.toDeptId,
      toPosition: input.toPosition,
      newBaseSalary: input.newBaseSalary !== undefined
        ? new Decimal(input.newBaseSalary)
        : undefined,
      newPerformanceSalary: toOptionalDecimal(input.newPerformanceSalary),
      newTotalSalary: input.newTotalSalary !== undefined
        ? new Decimal(input.newTotalSalary)
        : undefined,
      effectiveDate,
      status: 'draft',
      createdBy,
    },
  });

  await auditService.auditLog({
    userId: createdBy,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.CREATE,
    resourceType: RESOURCE_TYPE,
    resourceId: record.id,
    description: `创建调动申请 ${employee.name}`,
    newValue: {
      employeeId: input.employeeId,
      transferType: input.transferType,
      fromDeptId,
      toDeptId: input.toDeptId,
    },
  });

  return record;
}

/**
 * 单查（含 employee + fromDept + toDept 关联信息）
 */
export async function getTransferById(id: string) {
  const record = await prisma.transferRecord.findUnique({ where: { id } });
  if (!record) {
    throw new AppError('调动记录不存在', 404, 71601);
  }
  return enrichTransfer(record);
}

/**
 * 列表（分页 + 状态/员工/fromDept/toDept 过滤）
 */
export async function listTransfers(query: ListTransfersQuery = {}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where: Prisma.TransferRecordWhereInput = {
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.fromDeptId ? { fromDeptId: query.fromDeptId } : {}),
    ...(query.toDeptId ? { toDeptId: query.toDeptId } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.transferRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transferRecord.count({ where }),
  ]);

  const enriched = await Promise.all(data.map((r) => enrichTransfer(r)));

  return {
    data: enriched,
    total,
    page,
    pageSize,
  };
}

/**
 * 更新（仅 draft 状态可改）
 */
export async function updateTransfer(
  id: string,
  input: UpdateTransferInput,
  operatorId: string,
) {
  const existing = await prisma.transferRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('调动记录不存在', 404, 71601);
  }
  if (existing.status !== 'draft') {
    throw new AppError('仅草稿状态可更新', 409, 71603);
  }

  const transferType = input.transferType ?? existing.transferType;
  let effectiveBase: number | undefined;
  if (input.newBaseSalary !== undefined) {
    effectiveBase = input.newBaseSalary ?? undefined;
  } else if (existing.newBaseSalary != null) {
    effectiveBase = Number(existing.newBaseSalary);
  }
  let effectiveTotal: number | undefined;
  if (input.newTotalSalary !== undefined) {
    effectiveTotal = input.newTotalSalary ?? undefined;
  } else if (existing.newTotalSalary != null) {
    effectiveTotal = Number(existing.newTotalSalary);
  }

  await validatePromoteDemoteSalary(transferType, {
    newBaseSalary: effectiveBase,
    newTotalSalary: effectiveTotal,
  });

  if (input.effectiveDate !== undefined) {
    await validateEffectiveDate(toDate(input.effectiveDate));
  }

  const toDeptId = input.toDeptId ?? existing.toDeptId;
  const toCompanyId = input.toCompanyId ?? existing.toCompanyId;

  if (input.toDeptId || input.toCompanyId) {
    const toCompany = await prisma.company.findUnique({ where: { id: toCompanyId } });
    if (!toCompany) {
      throw new AppError('目标法人不存在', 404, 71001);
    }
    const toDept = await prisma.department.findUnique({ where: { id: toDeptId } });
    if (!toDept || toDept.companyId !== toCompanyId) {
      throw new AppError('目标部门不存在', 400, 71610);
    }
    if (toDeptId === existing.fromDeptId) {
      throw new AppError('调出和调入部门相同，无需调动', 409, 71605);
    }
  }

  const updated = await prisma.transferRecord.update({
    where: { id },
    data: {
      transferType: input.transferType,
      reason: input.reason,
      toCompanyId: input.toCompanyId,
      toDeptId: input.toDeptId,
      toPosition: input.toPosition,
      newBaseSalary: toOptionalDecimal(input.newBaseSalary),
      newPerformanceSalary: toOptionalDecimal(input.newPerformanceSalary),
      newTotalSalary: toOptionalDecimal(input.newTotalSalary),
      effectiveDate: input.effectiveDate !== undefined
        ? toDate(input.effectiveDate)
        : undefined,
    },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.UPDATE,
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '更新调动草稿',
    oldValue: { status: existing.status },
    newValue: { toPosition: updated.toPosition },
  });

  return updated;
}

/**
 * 提交审批（draft → submitted）
 */
export async function submitTransfer(id: string, operatorId: string) {
  const existing = await prisma.transferRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('调动记录不存在', 404, 71601);
  }
  if (existing.status === 'submitted') {
    throw new AppError('调动已提交', 409, 71602);
  }
  if (existing.status !== 'draft') {
    throw new AppError('仅草稿可提交审批', 409, 71602);
  }

  await validatePromoteDemoteSalary(existing.transferType, {
    newBaseSalary: existing.newBaseSalary != null ? Number(existing.newBaseSalary) : undefined,
    newTotalSalary: existing.newTotalSalary != null ? Number(existing.newTotalSalary) : undefined,
  });

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404, 71201);
  }

  const [fromDept, toDept] = await Promise.all([
    prisma.department.findUnique({
      where: { id: existing.fromDeptId },
      select: { name: true },
    }),
    prisma.department.findUnique({
      where: { id: existing.toDeptId },
      select: { name: true },
    }),
  ]);

  const flowKey = await getApprovalFlowKey();
  const nodes = await getApprovalNodes();
  const requiresSalary = await getRequiresSalaryForPromote();

  const instance = await approvalService.submitApproval({
    flowKey,
    businessType: 'transfer',
    businessId: id,
    initiatorId: operatorId,
    title: `${employee.name} 调动审批 (${fromDept?.name ?? existing.fromDeptId} → ${toDept?.name ?? existing.toDeptId})`,
    data: {
      employeeId: existing.employeeId,
      transferType: existing.transferType,
      fromDeptId: existing.fromDeptId,
      toDeptId: existing.toDeptId,
      effectiveDate: existing.effectiveDate.toISOString().slice(0, 10),
      newBaseSalary: existing.newBaseSalary != null ? Number(existing.newBaseSalary) : null,
      requiresSalary,
      approvalNodes: nodes,
    },
  });

  const updated = await prisma.transferRecord.update({
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
    description: `提交调动审批 ${employee.name}`,
    oldValue: { status: 'draft' },
    newValue: { status: 'submitted', approvalInstanceId: instance.id },
  });

  return updated;
}

/**
 * 审批拒绝回调（submitted → rejected）
 */
export async function rejectTransfer(
  id: string,
  reason: string,
  operatorId: string,
) {
  const existing = await prisma.transferRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('调动记录不存在', 404, 71601);
  }
  if (existing.status !== 'submitted') {
    throw new AppError('仅已提交状态可驳回', 409, 71603);
  }

  const updated = await prisma.transferRecord.update({
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
    select: { name: true, userId: true },
  });

  if (employee?.userId) {
    // TODO: 模板 transfer_rejected 入库后去掉 bypassTemplate
    await notificationService.sendNotification({
      templateKey: NOTIFY_REJECTED,
      userId: employee.userId,
      data: {
        employee_name: employee.name,
        reason,
        transfer_id: id,
      },
      bypassTemplate: {
        channel: 'in_app',
        subject: '调动审批已驳回',
        content: `${employee.name} 的调动申请已驳回：${reason}`,
      },
    }).catch(() => undefined);
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'REJECT',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `驳回调动 ${employee?.name ?? existing.employeeId}`,
    oldValue: { status: 'submitted' },
    newValue: { status: 'rejected', reason },
  });

  return updated;
}

/**
 * 审批通过回调（submitted → approved）—— 系统内部调用
 */
export async function confirmTransfer(
  id: string,
  approvalResult: { approved: boolean; instanceId?: string },
  operatorId: string,
) {
  if (!approvalResult.approved) {
    return rejectTransfer(id, '审批未通过', operatorId);
  }

  const existing = await prisma.transferRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('调动记录不存在', 404, 71601);
  }
  if (existing.status !== 'submitted') {
    throw new AppError('非法状态转换：仅 submitted 可确认调动', 409, 71603);
  }

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404, 71201);
  }

  const salaryStrategy = await getSalaryEffectiveStrategy();
  const today = startOfDay();
  const effDay = startOfDay(existing.effectiveDate);
  const deptEffectiveNow = effDay <= today;

  let {
    positionHistoryWritten,
    salaryHistoryWritten,
    employeeUpdated,
  } = existing;

  await prisma.$transaction(async (tx) => {
    if (!positionHistoryWritten) {
      await tx.employeePositionHistory.create({
        data: {
          employeeId: existing.employeeId,
          fromCompanyId: existing.fromCompanyId,
          fromDeptId: existing.fromDeptId,
          fromPosition: existing.fromPosition,
          toCompanyId: existing.toCompanyId,
          toDeptId: existing.toDeptId,
          toPosition: existing.toPosition,
          changeType: existing.transferType,
          changeDate: existing.effectiveDate,
          reason: existing.reason,
          operatorId,
        },
      });
      positionHistoryWritten = true;
    }

    if (existing.newBaseSalary != null && !salaryHistoryWritten) {
      const base = existing.newBaseSalary;
      const perf = existing.newPerformanceSalary ?? new Decimal(0);
      const total = existing.newTotalSalary ?? base.add(perf);
      const salaryEffectiveDate = salaryStrategy === 'next_month'
        ? getNextMonthStart()
        : existing.effectiveDate;

      await tx.employeeSalaryHistory.create({
        data: {
          employeeId: existing.employeeId,
          effectiveDate: salaryEffectiveDate,
          baseSalary: base,
          performanceSalary: existing.newPerformanceSalary,
          totalSalary: total,
          changeType: 'transfer',
          reason: existing.reason ?? `${existing.transferType} 调薪`,
          operatorId,
        },
      });
      salaryHistoryWritten = true;
    }

    if (deptEffectiveNow && !employeeUpdated) {
      await tx.employee.update({
        where: { id: existing.employeeId },
        data: {
          departmentId: existing.toDeptId,
          companyId: existing.toCompanyId,
        },
      });
      employeeUpdated = true;
    }

    await tx.transferRecord.update({
      where: { id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: operatorId,
        approvalInstanceId: approvalResult.instanceId ?? existing.approvalInstanceId,
        positionHistoryWritten,
        salaryHistoryWritten,
        employeeUpdated,
      },
    });
  });

  const [fromDept, toDept] = await Promise.all([
    prisma.department.findUnique({
      where: { id: existing.fromDeptId },
      select: { name: true },
    }),
    prisma.department.findUnique({
      where: { id: existing.toDeptId },
      select: { name: true },
    }),
  ]);

  if (employee.userId) {
    // TODO: 模板 transfer_approved 入库后去掉 bypassTemplate
    await notificationService.sendNotification({
      templateKey: NOTIFY_APPROVED,
      userId: employee.userId,
      data: {
        employee_name: employee.name,
        from_dept: fromDept?.name,
        to_dept: toDept?.name,
        transfer_id: id,
      },
      bypassTemplate: {
        channel: 'in_app',
        subject: '调动审批已通过',
        content: `${employee.name}，您的调动申请已通过（${fromDept?.name ?? ''} → ${toDept?.name ?? ''}）。`,
      },
    }).catch(() => undefined);
  }

  const auditNewValue: Record<string, unknown> = {
    status: 'approved',
    positionHistoryWritten,
    salaryHistoryWritten,
    employeeUpdated,
  };
  if (!deptEffectiveNow) {
    auditNewValue.expectedUpdateAt = existing.effectiveDate.toISOString().slice(0, 10);
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'APPROVE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `确认调动 ${employee.name}`,
    newValue: auditNewValue,
  });

  const updated = await prisma.transferRecord.findUnique({ where: { id } });
  return updated!;
}

/**
 * 撤回 / 取消
 */
export async function cancelTransfer(
  id: string,
  reason: string,
  operatorId: string,
) {
  const existing = await prisma.transferRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('调动记录不存在', 404, 71601);
  }
  if (existing.status === 'approved') {
    throw new AppError('已批准的调动不可取消', 409, 71608);
  }
  if (existing.status === 'cancelled' || existing.status === 'rejected') {
    throw new AppError('当前状态不可取消', 409, 71603);
  }
  if (existing.status !== 'draft' && existing.status !== 'submitted') {
    throw new AppError('当前状态不可取消', 409, 71603);
  }

  if (existing.status === 'submitted' && existing.approvalInstanceId) {
    await approvalService.withdraw({
      instanceId: existing.approvalInstanceId,
      initiatorId: operatorId,
    });
  }

  const updated = await prisma.transferRecord.update({
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
    description: '取消调动申请',
    oldValue: { status: existing.status },
    newValue: { status: 'cancelled', reason },
  });

  return updated;
}

/**
 * 给 BullMQ 调用的"即将生效的调动"列表
 */
export async function listUpcomingTransfers(days: number) {
  const now = startOfDay();
  const end = new Date(now);
  end.setDate(end.getDate() + days);

  return prisma.transferRecord.findMany({
    where: {
      status: 'approved',
      effectiveDate: {
        gte: now,
        lte: end,
      },
      employeeUpdated: false,
    },
    orderBy: { effectiveDate: 'asc' },
  });
}
