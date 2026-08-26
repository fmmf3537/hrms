// M2-B4: 加班 service | HRMS
// 仅 import approval/audit/config/notification + prisma；不调 leave.service 累计调休余额

import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as approvalService from './approval.service';
import * as auditService from './audit.service';
import * as configService from './config.service';
import * as notificationService from './notification.service';

const RESOURCE_TYPE = 'OvertimeRequest';
const MONTHLY_WORK_DAYS = 21.75;
const DAILY_WORK_HOURS = 8;

const NOTIFY_SUBMITTED = 'overtime_submitted:in_app';
const NOTIFY_APPROVED = 'overtime_approved:in_app';
const NOTIFY_REJECTED = 'overtime_rejected:in_app';

const DEFAULT_MAX_DAILY = 3;
const DEFAULT_MAX_MONTHLY = 36;
const DEFAULT_MIN_ADVANCE = 4;
const DEFAULT_FLOW_KEY = 'overtime:overtime_approval';
const DEFAULT_PAY_WEEKDAY = 1.5;
const DEFAULT_PAY_WEEKEND = 2.0;
const DEFAULT_PAY_HOLIDAY = 3.0;

export interface CreateOvertimeRequestInput {
  employeeId: string;
  startTime: Date | string;
  endTime: Date | string;
  overtimeType?: string;
  compensationType: string;
  reason: string;
  attachments?: Prisma.InputJsonValue;
}

export interface ListOvertimeRequestsQuery {
  employeeId?: string;
  companyId?: string;
  departmentId?: string;
  compensationType?: string;
  status?: string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  page?: number;
  pageSize?: number;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function getMaxDailyHours(): Promise<number> {
  try {
    const v = await configService.getValue('overtime', 'max_daily_hours');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : DEFAULT_MAX_DAILY;
  } catch {
    return DEFAULT_MAX_DAILY;
  }
}

async function getMaxMonthlyHours(): Promise<number> {
  try {
    const v = await configService.getValue('overtime', 'max_monthly_hours');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : DEFAULT_MAX_MONTHLY;
  } catch {
    return DEFAULT_MAX_MONTHLY;
  }
}

async function getMinAdvanceHours(): Promise<number> {
  try {
    const v = await configService.getValue('overtime', 'min_advance_hours');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : DEFAULT_MIN_ADVANCE;
  } catch {
    return DEFAULT_MIN_ADVANCE;
  }
}

async function getApprovalFlowKey(): Promise<string> {
  try {
    const v = await configService.getValue('overtime', 'approval_flow_key');
    return typeof v === 'string' && v.length > 0 ? v : DEFAULT_FLOW_KEY;
  } catch {
    return DEFAULT_FLOW_KEY;
  }
}

async function getPayMultiplier(overtimeType: string): Promise<number> {
  const keyMap: Record<string, string> = {
    weekday: 'pay_multiplier_weekday',
    weekend: 'pay_multiplier_weekend',
    holiday: 'pay_multiplier_holiday',
  };
  const defaults: Record<string, number> = {
    weekday: DEFAULT_PAY_WEEKDAY,
    weekend: DEFAULT_PAY_WEEKEND,
    holiday: DEFAULT_PAY_HOLIDAY,
  };
  const configKey = keyMap[overtimeType] ?? 'pay_multiplier_weekday';
  try {
    const v = await configService.getValue('overtime', configKey);
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : (defaults[overtimeType] ?? DEFAULT_PAY_WEEKDAY);
  } catch {
    return defaults[overtimeType] ?? DEFAULT_PAY_WEEKDAY;
  }
}

async function validateEmployee(employeeId: string) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404, 71201);
  }
  if (!employee.departmentId) {
    throw new AppError('员工未分配部门', 400, 71201);
  }
  return { ...employee, departmentId: employee.departmentId };
}

function validateCompensationType(compensationType: string): void {
  if (compensationType !== 'pay' && compensationType !== 'comp') {
    throw new AppError('补偿方式不合法', 400, 72107);
  }
}

/**
 * 内部：加班时长计算（小时，保留 2 位小数）
 */
export function calculateOvertimeHours(startTime: Date, endTime: Date): number {
  const ms = endTime.getTime() - startTime.getTime();
  return round2(ms / (3600 * 1000));
}

/**
 * 内部：加班类型判定（B4 简化：weekday / weekend；法定假日留二期）
 */
export function determineOvertimeType(startTime: Date): 'weekday' | 'weekend' {
  const dow = startTime.getDay();
  return dow === 0 || dow === 6 ? 'weekend' : 'weekday';
}

/**
 * 内部：调休转换（1:1，totalHours / 8）
 */
export function calculateOvertimeCompDays(totalHours: number): number {
  return round2(totalHours / DAILY_WORK_HOURS);
}

/**
 * 内部：加班费计算
 */
export async function calculateOvertimePay(
  employeeId: string,
  totalHours: number,
  overtimeType: string,
): Promise<number> {
  const salary = await prisma.employeeSalaryHistory.findFirst({
    where: { employeeId },
    orderBy: { effectiveDate: 'desc' },
  });
  if (!salary) {
    throw new AppError('加班费计算失败', 500, 72110);
  }
  const baseSalary = Number(salary.baseSalary);
  const multiplier = await getPayMultiplier(overtimeType);
  const hourlyRate = baseSalary / MONTHLY_WORK_DAYS / DAILY_WORK_HOURS;
  return round2(hourlyRate * totalHours * multiplier);
}

/**
 * 内部：加班区间重叠校验
 */
async function hasOverlappingOvertime(
  employeeId: string,
  startTime: Date,
  endTime: Date,
  excludeId?: string,
): Promise<boolean> {
  const overlapping = await prisma.overtimeRequest.findFirst({
    where: {
      employeeId,
      status: { notIn: ['rejected', 'cancelled'] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  return overlapping !== null;
}

/**
 * 内部：当月已批准加班小时数
 */
async function getMonthlyApprovedHours(
  employeeId: string,
  refDate: Date,
): Promise<number> {
  const monthStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const monthEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);

  const records = await prisma.overtimeRequest.findMany({
    where: {
      employeeId,
      status: 'approved',
      startTime: { gte: monthStart, lte: monthEnd },
    },
    select: { totalHours: true },
  });

  return records.reduce((sum, r) => sum + Number(r.totalHours), 0);
}

/**
 * 提交加班申请（draft → submitted）
 */
export async function createOvertimeRequest(
  input: CreateOvertimeRequestInput,
  operatorId: string,
) {
  validateCompensationType(input.compensationType);
  const employee = await validateEmployee(input.employeeId);

  const startTime = toDate(input.startTime);
  const endTime = toDate(input.endTime);

  if (startTime >= endTime) {
    throw new AppError('加班时间不合法', 400, 72102);
  }

  const minAdvance = await getMinAdvanceHours();
  const advanceMs = startTime.getTime() - Date.now();
  if (advanceMs < minAdvance * 3600 * 1000) {
    throw new AppError('加班需提前 4 小时申请', 400, 72108);
  }

  const totalHours = calculateOvertimeHours(startTime, endTime);
  if (totalHours <= 0) {
    throw new AppError('加班时间不合法', 400, 72102);
  }

  const maxDaily = await getMaxDailyHours();
  if (totalHours > maxDaily) {
    throw new AppError('单日加班不能超过 3 小时', 400, 72103);
  }

  const monthlyUsed = await getMonthlyApprovedHours(input.employeeId, startTime);
  const maxMonthly = await getMaxMonthlyHours();
  if (monthlyUsed + totalHours > maxMonthly) {
    throw new AppError('单月加班不能超过 36 小时', 400, 72104);
  }

  const overlap = await hasOverlappingOvertime(input.employeeId, startTime, endTime);
  if (overlap) {
    throw new AppError('加班区间重叠', 409, 72109);
  }

  const overtimeType = input.overtimeType && ['weekday', 'weekend', 'holiday'].includes(input.overtimeType)
    ? input.overtimeType
    : determineOvertimeType(startTime);

  let overtimePay: Decimal | null = null;
  let compDays: Decimal | null = null;

  if (input.compensationType === 'pay') {
    const pay = await calculateOvertimePay(input.employeeId, totalHours, overtimeType);
    overtimePay = new Decimal(pay);
  } else {
    compDays = new Decimal(calculateOvertimeCompDays(totalHours));
  }

  const draft = await prisma.overtimeRequest.create({
    data: {
      employeeId: employee.id,
      companyId: employee.companyId,
      departmentId: employee.departmentId,
      startTime,
      endTime,
      totalHours: new Decimal(totalHours),
      overtimeType,
      compensationType: input.compensationType,
      overtimePay,
      compDays,
      reason: input.reason,
      attachments: input.attachments,
      status: 'draft',
      createdBy: operatorId,
    },
  });

  const flowKey = await getApprovalFlowKey();
  const instance = await approvalService.submitApproval({
    flowKey,
    businessType: 'overtime',
    businessId: draft.id,
    title: `${employee.name} 加班申请 - ${startTime.toISOString()}`,
    initiatorId: operatorId,
    data: {
      employeeId: employee.id,
      totalHours,
      compensationType: input.compensationType,
      overtimeType,
    },
  });

  const record = await prisma.overtimeRequest.update({
    where: { id: draft.id },
    data: {
      status: 'submitted',
      approvalInstanceId: instance.id,
    },
  });

  if (employee.userId) {
    await notificationService.sendNotification({
      templateKey: NOTIFY_SUBMITTED,
      userId: employee.userId,
      data: { total_hours: totalHours, compensation_type: input.compensationType },
      bypassTemplate: {
        channel: 'in_app',
        subject: '加班已提交',
        content: `您的加班申请（${totalHours} 小时）已提交审批。`,
      },
    }).catch(() => undefined);
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.CREATE,
    resourceType: RESOURCE_TYPE,
    resourceId: record.id,
    description: '提交加班申请',
    newValue: { totalHours, compensationType: input.compensationType, flowKey },
  });

  return record;
}

/**
 * 列表（分页 + 多维过滤）
 */
export async function listOvertimeRequests(query: ListOvertimeRequestsQuery = {}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where: Prisma.OvertimeRequestWhereInput = {
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.compensationType ? { compensationType: query.compensationType } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  if (query.dateFrom || query.dateTo) {
    where.startTime = {
      ...(query.dateFrom ? { gte: toDate(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: toDate(query.dateTo) } : {}),
    };
  }

  const [data, total] = await Promise.all([
    prisma.overtimeRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.overtimeRequest.count({ where }),
  ]);

  return {
    data,
    total,
    page,
    pageSize,
  };
}

/**
 * 撤回
 */
export async function cancelOvertimeRequest(
  id: string,
  reason: string,
  operatorId: string,
) {
  const existing = await prisma.overtimeRequest.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('加班记录不存在', 404, 72101);
  }
  if (existing.status === 'approved' || existing.status === 'rejected') {
    throw new AppError('已批准/已拒绝不可撤回', 409, 72106);
  }
  if (existing.status === 'cancelled') {
    return existing;
  }

  if (existing.status === 'submitted' && existing.approvalInstanceId) {
    await approvalService.withdraw({
      instanceId: existing.approvalInstanceId,
      initiatorId: operatorId,
    });
  }

  const updated = await prisma.overtimeRequest.update({
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
    description: '撤回加班申请',
    newValue: { reason },
  });

  return updated;
}

/**
 * 审批通过/拒绝回调
 */
export async function confirmOvertimeRequest(
  id: string,
  approvalResult: { approved: boolean; instanceId?: string },
  operatorId: string,
  rejectedReason?: string,
) {
  const existing = await prisma.overtimeRequest.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('加班记录不存在', 404, 72101);
  }
  if (existing.status !== 'submitted') {
    throw new AppError('加班已审批', 409, 72105);
  }

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
    select: { id: true, name: true, userId: true },
  });

  if (approvalResult.approved) {
    const updated = await prisma.overtimeRequest.update({
      where: { id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: operatorId,
      },
    });

    if (employee?.userId) {
      await notificationService.sendNotification({
        templateKey: NOTIFY_APPROVED,
        userId: employee.userId,
        data: { employee_name: employee.name },
        bypassTemplate: {
          channel: 'in_app',
          subject: '加班已通过',
          content: `${employee.name}，您的加班申请已通过。`,
        },
      }).catch(() => undefined);
    }

    await auditService.auditLog({
      userId: operatorId,
      actorType: 'USER',
      action: 'APPROVE',
      resourceType: RESOURCE_TYPE,
      resourceId: id,
      description: '加班审批通过',
    });

    return updated;
  }

  const updated = await prisma.overtimeRequest.update({
    where: { id },
    data: {
      status: 'rejected',
      rejectedAt: new Date(),
      rejectedBy: operatorId,
      rejectedReason: rejectedReason ?? '审批驳回',
    },
  });

  if (employee?.userId) {
    await notificationService.sendNotification({
      templateKey: NOTIFY_REJECTED,
      userId: employee.userId,
      data: { employee_name: employee.name },
      bypassTemplate: {
        channel: 'in_app',
        subject: '加班已驳回',
        content: `${employee.name}，您的加班申请已驳回。`,
      },
    }).catch(() => undefined);
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'REJECT',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '加班审批驳回',
  });

  return updated;
}

/**
 * 给 BullMQ 调用的即将加班列表
 */
export async function listUpcomingOvertime(days: number) {
  const now = new Date();
  const until = new Date(now);
  until.setDate(until.getDate() + days);

  return prisma.overtimeRequest.findMany({
    where: {
      status: 'approved',
      startTime: { gte: now, lte: until },
    },
    orderBy: { startTime: 'asc' },
  });
}
