// M2-B3: 请假 service | HRMS
// 仅 import approval/audit/config/notification + prisma；余额不存表，calculateLeaveBalance 计算

import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as approvalService from './approval.service';
import * as auditService from './audit.service';
import * as configService from './config.service';
import * as notificationService from './notification.service';

const RESOURCE_TYPE = 'LeaveRequest';

const NOTIFY_SUBMITTED = 'leave_submitted:in_app';
const NOTIFY_APPROVED = 'leave_approved:in_app';
const NOTIFY_REJECTED = 'leave_rejected:in_app';

const DEFAULT_LEAVE_TYPES = [
  'annual', 'sick', 'personal', 'compensatory',
  'marriage', 'maternity', 'paternity', 'bereavement',
];

const DEFAULT_ANNUAL_RULES: Record<string, number> = {
  '1-10': 5,
  '10-20': 10,
  '>20': 15,
};

const DEFAULT_FLOW_SHORT = 'leave:leave_short';
const DEFAULT_FLOW_LONG = 'leave:leave_long';

export interface CreateLeaveRequestInput {
  employeeId: string;
  leaveType: string;
  startDate: Date | string;
  endDate: Date | string;
  reason?: string;
  attachments?: Prisma.InputJsonValue;
}

export interface ListLeaveRequestsQuery {
  employeeId?: string;
  companyId?: string;
  departmentId?: string;
  leaveType?: string;
  status?: string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  page?: number;
  pageSize?: number;
}

export interface LeaveBalance {
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  expiryDate?: string;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function calendarDaysInclusive(start: Date, end: Date): number {
  const a = startOfDay(start).getTime();
  const b = startOfDay(end).getTime();
  return Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

async function getLeaveTypes(): Promise<string[]> {
  try {
    const v = await configService.getValue('leave', 'types');
    if (Array.isArray(v)) return v.map(String);
    return [...DEFAULT_LEAVE_TYPES];
  } catch {
    return [...DEFAULT_LEAVE_TYPES];
  }
}

async function getAnnualLeaveRules(): Promise<Record<string, number>> {
  try {
    const v = await configService.getValue('leave', 'annual_leave_rules');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, Number(val)]),
      );
    }
    return { ...DEFAULT_ANNUAL_RULES };
  } catch {
    return { ...DEFAULT_ANNUAL_RULES };
  }
}

async function getCompLeaveValidityMonths(): Promise<number> {
  try {
    const v = await configService.getValue('leave', 'comp_leave_validity_months');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 6;
  } catch {
    return 6;
  }
}

async function getApprovalFlowShort(): Promise<string> {
  try {
    const v = await configService.getValue('leave', 'approval_flow_short');
    return typeof v === 'string' && v.length > 0 ? v : DEFAULT_FLOW_SHORT;
  } catch {
    return DEFAULT_FLOW_SHORT;
  }
}

async function getApprovalFlowLong(): Promise<string> {
  try {
    const v = await configService.getValue('leave', 'approval_flow_long');
    return typeof v === 'string' && v.length > 0 ? v : DEFAULT_FLOW_LONG;
  } catch {
    return DEFAULT_FLOW_LONG;
  }
}

async function getMaxConsecutiveDays(): Promise<number> {
  try {
    const v = await configService.getValue('leave', 'max_consecutive_days');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 30;
  } catch {
    return 30;
  }
}

async function getMinAdvanceDaysAnnual(): Promise<number> {
  try {
    const v = await configService.getValue('leave', 'min_advance_days_annual');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 7;
  } catch {
    return 7;
  }
}

async function getWorkdayExcludeWeekends(): Promise<boolean> {
  try {
    const v = await configService.getValue('leave', 'workday_exclude_weekends');
    if (typeof v === 'boolean') return v;
    return true;
  } catch {
    return true;
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
  if (!employee.hireDate) {
    throw new AppError('员工入职日期缺失，无法计算假期余额', 500, 72010);
  }
  return { ...employee, departmentId: employee.departmentId, hireDate: employee.hireDate };
}

async function validateLeaveType(leaveType: string): Promise<void> {
  const types = await getLeaveTypes();
  if (!types.includes(leaveType)) {
    throw new AppError('假期类型不合法', 400, 72003);
  }
}

function yearsOfService(hireDate: Date, refYear: number): number {
  const ref = new Date(refYear, 11, 31);
  const diff = ref.getTime() - hireDate.getTime();
  return Math.max(0, Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000)));
}

function annualEntitlement(years: number, rules: Record<string, number>): number {
  if (years > 20) return rules['>20'] ?? 15;
  if (years >= 10) return rules['10-20'] ?? 10;
  return rules['1-10'] ?? 5;
}

/**
 * 内部：工作日计算（排除周末）
 */
export function calculateWorkingDays(
  startDate: Date,
  endDate: Date,
  excludeWeekends = true,
): number {
  let count = 0;
  const cur = startOfDay(startDate);
  const end = startOfDay(endDate);

  while (cur <= end) {
    const dow = cur.getDay();
    if (!excludeWeekends || (dow !== 0 && dow !== 6)) {
      count += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return count;
}

/**
 * 内部：请假区间重叠校验
 */
export async function hasOverlappingLeave(
  employeeId: string,
  startDate: Date,
  endDate: Date,
  excludeId?: string,
): Promise<boolean> {
  const overlapping = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      status: { notIn: ['rejected', 'cancelled'] },
      startDate: { lte: startOfDay(endDate) },
      endDate: { gte: startOfDay(startDate) },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    take: 1,
  });
  return overlapping.length > 0;
}

/**
 * 假期余额查询（不存表，service 函数计算）
 */
export async function calculateLeaveBalance(
  employeeId: string,
  leaveType: string,
  year: number = new Date().getFullYear(),
): Promise<LeaveBalance> {
  await validateLeaveType(leaveType);

  if (leaveType === 'compensatory') {
    // TODO: B4 加班累计后接入调休余额；B3 暂返回 0（validity: comp_leave_validity_months）
    await getCompLeaveValidityMonths();
    return {
      totalDays: 0,
      usedDays: 0,
      remainingDays: 0,
      expiryDate: undefined,
    };
  }

  if (!['annual', 'sick', 'personal', 'marriage', 'maternity', 'paternity', 'bereavement'].includes(leaveType)) {
    throw new AppError('余额计算失败', 500, 72010);
  }

  if (leaveType !== 'annual') {
    return {
      totalDays: 999,
      usedDays: 0,
      remainingDays: 999,
    };
  }

  const employee = await validateEmployee(employeeId);
  const rules = await getAnnualLeaveRules();
  const tenure = yearsOfService(employee.hireDate, year);
  const totalDays = annualEntitlement(tenure, rules);

  const approved = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      leaveType: 'annual',
      status: 'approved',
      startDate: { gte: new Date(year, 0, 1) },
      endDate: { lte: new Date(year, 11, 31) },
    },
    select: { totalDays: true },
  });

  const usedDays = approved.reduce(
    (sum, r) => sum + Number(r.totalDays),
    0,
  );

  return {
    totalDays,
    usedDays,
    remainingDays: Math.max(0, totalDays - usedDays),
    expiryDate: `${year + 1}-12-31`,
  };
}

/**
 * 提交请假申请（draft → submitted）
 */
export async function createLeaveRequest(
  input: CreateLeaveRequestInput,
  operatorId: string,
) {
  await validateLeaveType(input.leaveType);
  const employee = await validateEmployee(input.employeeId);

  const startDate = startOfDay(toDate(input.startDate));
  const endDate = startOfDay(toDate(input.endDate));
  const today = startOfDay(new Date());

  if (startDate > endDate) {
    throw new AppError('请假日期不合法', 400, 72002);
  }
  if (startDate < today) {
    throw new AppError('请假日期不合法', 400, 72002);
  }

  const calendarSpan = calendarDaysInclusive(startDate, endDate);
  const maxDays = await getMaxConsecutiveDays();
  if (calendarSpan > maxDays) {
    throw new AppError('单次请假不能超过 30 天', 400, 72008);
  }

  const excludeWeekends = await getWorkdayExcludeWeekends();
  const totalDays = calculateWorkingDays(startDate, endDate, excludeWeekends);
  if (totalDays <= 0) {
    throw new AppError('请假日期不合法', 400, 72002);
  }

  if (input.leaveType === 'annual') {
    const minAdvance = await getMinAdvanceDaysAnnual();
    if (startDate > today) {
      const advanceDays = calendarDaysInclusive(today, startDate) - 1;
      if (advanceDays < minAdvance) {
        throw new AppError('年假需提前 7 天申请', 400, 72009);
      }
    }
    const balance = await calculateLeaveBalance(input.employeeId, 'annual', startDate.getFullYear());
    if (balance.remainingDays < totalDays) {
      throw new AppError('假期余额不足', 422, 72004);
    }
  }

  if (input.leaveType === 'compensatory') {
    const balance = await calculateLeaveBalance(input.employeeId, 'compensatory', startDate.getFullYear());
    if (balance.remainingDays < totalDays) {
      throw new AppError('假期余额不足', 422, 72004);
    }
  }

  const overlap = await hasOverlappingLeave(input.employeeId, startDate, endDate);
  if (overlap) {
    throw new AppError('请假区间重叠', 409, 72005);
  }

  const draft = await prisma.leaveRequest.create({
    data: {
      employeeId: employee.id,
      companyId: employee.companyId,
      departmentId: employee.departmentId,
      leaveType: input.leaveType,
      startDate,
      endDate,
      totalDays: new Decimal(totalDays),
      reason: input.reason,
      attachments: input.attachments,
      status: 'draft',
      createdBy: operatorId,
    },
  });

  const flowKey = totalDays <= 3
    ? await getApprovalFlowShort()
    : await getApprovalFlowLong();

  const instance = await approvalService.submitApproval({
    flowKey,
    businessType: 'leave',
    businessId: draft.id,
    title: `${employee.name} ${input.leaveType} 请假 ${totalDays} 天`,
    initiatorId: operatorId,
    data: {
      employeeId: employee.id,
      leaveType: input.leaveType,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      totalDays,
    },
  });

  const record = await prisma.leaveRequest.update({
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
      data: { leave_type: input.leaveType, total_days: totalDays },
      bypassTemplate: {
        channel: 'in_app',
        subject: '请假已提交',
        content: `您的${input.leaveType}请假申请（${totalDays} 天）已提交审批。`,
      },
    }).catch(() => undefined);
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.CREATE,
    resourceType: RESOURCE_TYPE,
    resourceId: record.id,
    description: `提交请假 ${input.leaveType}`,
    newValue: { totalDays, flowKey },
  });

  return record;
}

/**
 * 单查（含 employee 基本信息）
 */
export async function getLeaveRequestById(id: string) {
  const record = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!record) {
    throw new AppError('请假记录不存在', 404, 72001);
  }
  const emp = await prisma.employee.findFirst({
    where: { id: record.employeeId, deletedAt: null },
    select: { id: true, name: true, employeeNo: true },
  });
  return { ...record, employee: emp };
}

/**
 * 列表
 */
export async function listLeaveRequests(query: ListLeaveRequestsQuery = {}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where: Prisma.LeaveRequestWhereInput = {
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.leaveType ? { leaveType: query.leaveType } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  if (query.dateFrom || query.dateTo) {
    where.startDate = {
      ...(query.dateFrom ? { gte: toDate(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: toDate(query.dateTo) } : {}),
    };
  }

  const [data, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.leaveRequest.count({ where }),
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
export async function cancelLeaveRequest(
  id: string,
  reason: string,
  operatorId: string,
) {
  const existing = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('请假记录不存在', 404, 72001);
  }
  if (existing.status === 'approved' || existing.status === 'rejected') {
    throw new AppError('已批准/已拒绝不可撤回', 409, 72007);
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

  const updated = await prisma.leaveRequest.update({
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
    description: '撤回请假',
    newValue: { reason },
  });

  return updated;
}

/**
 * 审批通过/拒绝回调
 */
export async function confirmLeaveRequest(
  id: string,
  approvalResult: { approved: boolean; instanceId?: string },
  operatorId: string,
  rejectedReason?: string,
) {
  const existing = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('请假记录不存在', 404, 72001);
  }
  if (existing.status !== 'submitted') {
    throw new AppError('请假已审批', 409, 72006);
  }

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
    select: { id: true, name: true, userId: true },
  });

  if (approvalResult.approved) {
    const updated = await prisma.leaveRequest.update({
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
          subject: '请假已通过',
          content: `${employee.name}，您的请假申请已通过。`,
        },
      }).catch(() => undefined);
    }

    await auditService.auditLog({
      userId: operatorId,
      actorType: 'USER',
      action: 'APPROVE',
      resourceType: RESOURCE_TYPE,
      resourceId: id,
      description: '请假审批通过',
    });

    return updated;
  }

  const updated = await prisma.leaveRequest.update({
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
        subject: '请假已驳回',
        content: `${employee.name}，您的请假申请已驳回。`,
      },
    }).catch(() => undefined);
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'REJECT',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '请假审批驳回',
  });

  return updated;
}

/**
 * 给 BullMQ 调用的即将请假列表
 */
export async function listUpcomingLeaves(days: number) {
  const now = startOfDay(new Date());
  const until = new Date(now);
  until.setDate(until.getDate() + days);

  return prisma.leaveRequest.findMany({
    where: {
      status: 'approved',
      startDate: { gte: now, lte: until },
    },
    orderBy: { startDate: 'asc' },
  });
}
