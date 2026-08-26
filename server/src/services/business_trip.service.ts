// M2-B5: 出差 service | HRMS
// 仅 import approval/audit/config/notification + prisma；不联动 B2 打卡 / M4 薪酬

import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as approvalService from './approval.service';
import * as auditService from './audit.service';
import * as configService from './config.service';
import * as notificationService from './notification.service';

const RESOURCE_TYPE = 'BusinessTrip';

const NOTIFY_SUBMITTED = 'trip_submitted:in_app';
const NOTIFY_APPROVED = 'trip_approved:in_app';
const NOTIFY_REJECTED = 'trip_rejected:in_app';

const DEFAULT_ALLOWANCE_STANDARD = 200;
const DEFAULT_MIN_ADVANCE_DAYS = 3;
const DEFAULT_FLOW_KEY = 'trip:trip_approval';
const DEFAULT_WEEKEND_INCLUSIVE = false;

const DEFAULT_CITY_TIER_RATES: Record<string, number> = {
  tier1: 1.5,
  tier2: 1.2,
  tier3: 1.0,
};

const DEFAULT_LEVEL_TIER_RATES: Record<string, number> = {
  executive: 1.5,
  manager: 1.2,
  employee: 1.0,
};

const DEFAULT_CITY_TIER_MAPPING: Record<string, string> = {
  北京: 'tier1',
  上海: 'tier1',
  深圳: 'tier1',
  广州: 'tier1',
  成都: 'tier2',
  杭州: 'tier2',
  南京: 'tier2',
  武汉: 'tier3',
  西安: 'tier3',
};

const PROJECT_CODE_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;

export interface CreateBusinessTripInput {
  employeeId: string;
  destination: string;
  startDate: Date | string;
  endDate: Date | string;
  reason: string;
  projectCode?: string;
}

export interface ListBusinessTripsQuery {
  employeeId?: string;
  companyId?: string;
  departmentId?: string;
  destination?: string;
  status?: string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  page?: number;
  pageSize?: number;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calendarDaysInclusive(start: Date, end: Date): number {
  const a = startOfDay(start).getTime();
  const b = startOfDay(end).getTime();
  return Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

async function getAllowanceStandard(): Promise<number> {
  try {
    const v = await configService.getValue('trip', 'allowance_standard');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : DEFAULT_ALLOWANCE_STANDARD;
  } catch {
    return DEFAULT_ALLOWANCE_STANDARD;
  }
}

async function getCityTierRates(): Promise<Record<string, number>> {
  try {
    const v = await configService.getValue('trip', 'city_tier_rates');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, Number(val)]),
      );
    }
    return { ...DEFAULT_CITY_TIER_RATES };
  } catch {
    return { ...DEFAULT_CITY_TIER_RATES };
  }
}

async function getLevelTierRates(): Promise<Record<string, number>> {
  try {
    const v = await configService.getValue('trip', 'level_tier_rates');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, Number(val)]),
      );
    }
    return { ...DEFAULT_LEVEL_TIER_RATES };
  } catch {
    return { ...DEFAULT_LEVEL_TIER_RATES };
  }
}

async function getCityTierMapping(): Promise<Record<string, string>> {
  try {
    const v = await configService.getValue('trip', 'city_tier_mapping');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, String(val)]),
      );
    }
    return { ...DEFAULT_CITY_TIER_MAPPING };
  } catch {
    return { ...DEFAULT_CITY_TIER_MAPPING };
  }
}

async function getApprovalFlowKey(): Promise<string> {
  try {
    const v = await configService.getValue('trip', 'approval_flow_key');
    return typeof v === 'string' && v.length > 0 ? v : DEFAULT_FLOW_KEY;
  } catch {
    return DEFAULT_FLOW_KEY;
  }
}

async function getMinAdvanceDays(): Promise<number> {
  try {
    const v = await configService.getValue('trip', 'min_advance_days');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : DEFAULT_MIN_ADVANCE_DAYS;
  } catch {
    return DEFAULT_MIN_ADVANCE_DAYS;
  }
}

async function getWeekendInclusive(): Promise<boolean> {
  try {
    const v = await configService.getValue('trip', 'weekend_inclusive');
    if (typeof v === 'boolean') return v;
    return DEFAULT_WEEKEND_INCLUSIVE;
  } catch {
    return DEFAULT_WEEKEND_INCLUSIVE;
  }
}

/**
 * 内部：职级推断（employee.level 字段留二期，暂从 position 推断）
 */
function resolveEmployeeLevel(position?: string | null): string {
  const pos = position ?? '';
  if (/总经理|高管|executive/i.test(pos)) return 'executive';
  if (/经理|主管|manager/i.test(pos)) return 'manager';
  return 'employee';
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

function validateDestination(destination: string): void {
  if (!destination || destination.trim().length === 0) {
    throw new AppError('出差城市必填', 400, 72210);
  }
}

function validateProjectCode(projectCode?: string): void {
  if (projectCode === undefined || projectCode === null || projectCode === '') {
    return;
  }
  if (!PROJECT_CODE_PATTERN.test(projectCode)) {
    throw new AppError('项目代码不合法', 400, 72207);
  }
}

async function resolveCityTier(destination: string): Promise<string> {
  const mapping = await getCityTierMapping();
  const tier = mapping[destination.trim()];
  if (!tier) {
    throw new AppError('出差城市不合法', 400, 72206);
  }
  return tier;
}

/**
 * 内部：出差天数计算（默认排除周末，与 B3 一致）
 */
export function calculateTripDays(
  startDate: Date,
  endDate: Date,
  weekendInclusive = false,
): number {
  let count = 0;
  const cur = startOfDay(startDate);
  const end = startOfDay(endDate);

  while (cur <= end) {
    const dow = cur.getDay();
    if (weekendInclusive || (dow !== 0 && dow !== 6)) {
      count += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return count;
}

/**
 * 内部：差旅补助计算
 */
export async function calculateTravelAllowance(
  employeeId: string,
  destination: string,
  totalDays: number,
): Promise<{ allowanceAmount: number; cityTier: string; levelRate: number }> {
  const mapping = await getCityTierMapping();
  const cityTier = mapping[destination.trim()];
  if (!cityTier) {
    throw new AppError('差旅补助计算失败', 500, 72209);
  }

  const cityRates = await getCityTierRates();
  const cityRate = cityRates[cityTier];
  if (!Number.isFinite(cityRate)) {
    throw new AppError('差旅补助计算失败', 500, 72209);
  }

  const posHistory = await prisma.employeePositionHistory.findFirst({
    where: { employeeId },
    orderBy: { changeDate: 'desc' },
    select: { toPosition: true },
  });
  // TODO: employee.level 字段留二期；暂从最新岗位历史推断职级
  const level = resolveEmployeeLevel(posHistory?.toPosition);
  const levelRates = await getLevelTierRates();
  const levelRate = levelRates[level] ?? levelRates.employee ?? 1.0;

  const baseAmount = await getAllowanceStandard();
  const allowanceAmount = round2(baseAmount * cityRate * levelRate * totalDays);

  return { allowanceAmount, cityTier, levelRate };
}

/**
 * 内部：出差区间重叠校验
 */
async function hasOverlappingTrip(
  employeeId: string,
  startDate: Date,
  endDate: Date,
  excludeId?: string,
): Promise<boolean> {
  const overlapping = await prisma.businessTrip.findMany({
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
 * 提交出差申请（draft → submitted）
 */
export async function createBusinessTrip(
  input: CreateBusinessTripInput,
  operatorId: string,
) {
  validateDestination(input.destination);
  validateProjectCode(input.projectCode);
  const employee = await validateEmployee(input.employeeId);

  const destination = input.destination.trim();
  await resolveCityTier(destination);

  const startDate = startOfDay(toDate(input.startDate));
  const endDate = startOfDay(toDate(input.endDate));
  const today = startOfDay(new Date());

  if (startDate > endDate) {
    throw new AppError('出差日期不合法', 400, 72202);
  }

  const minAdvance = await getMinAdvanceDays();
  if (startDate > today) {
    const advanceDays = calendarDaysInclusive(today, startDate) - 1;
    if (advanceDays < minAdvance) {
      throw new AppError('出差需提前 3 天申请', 400, 72203);
    }
  } else if (startDate < today) {
    throw new AppError('出差日期不合法', 400, 72202);
  }

  const weekendInclusive = await getWeekendInclusive();
  const totalDays = calculateTripDays(startDate, endDate, weekendInclusive);
  if (totalDays <= 0) {
    throw new AppError('出差日期不合法', 400, 72202);
  }

  const overlap = await hasOverlappingTrip(input.employeeId, startDate, endDate);
  if (overlap) {
    throw new AppError('出差区间重叠', 409, 72208);
  }

  const allowance = await calculateTravelAllowance(input.employeeId, destination, totalDays);

  const draft = await prisma.businessTrip.create({
    data: {
      employeeId: employee.id,
      companyId: employee.companyId,
      departmentId: employee.departmentId,
      destination,
      startDate,
      endDate,
      totalDays: new Decimal(totalDays),
      reason: input.reason,
      projectCode: input.projectCode,
      allowanceAmount: new Decimal(allowance.allowanceAmount),
      cityTier: allowance.cityTier,
      levelRate: new Decimal(allowance.levelRate),
      status: 'draft',
      createdBy: operatorId,
    },
  });

  const flowKey = await getApprovalFlowKey();
  const instance = await approvalService.submitApproval({
    flowKey,
    businessType: 'business_trip',
    businessId: draft.id,
    title: `${employee.name} 出差申请 - ${destination}`,
    initiatorId: operatorId,
    data: {
      employeeId: employee.id,
      destination,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      totalDays,
      allowanceAmount: allowance.allowanceAmount,
    },
  });

  const record = await prisma.businessTrip.update({
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
      data: {
        destination,
        total_days: totalDays,
        allowance_amount: allowance.allowanceAmount,
      },
      bypassTemplate: {
        channel: 'in_app',
        subject: '出差已提交',
        content: `您的${destination}出差申请（${totalDays} 天）已提交审批。`,
      },
    }).catch(() => undefined);
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.CREATE,
    resourceType: RESOURCE_TYPE,
    resourceId: record.id,
    description: `提交出差 ${destination}`,
    newValue: { totalDays, allowanceAmount: allowance.allowanceAmount, flowKey },
  });

  return record;
}

/**
 * 列表（分页 + 多维过滤）
 */
export async function listBusinessTrips(query: ListBusinessTripsQuery = {}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where: Prisma.BusinessTripWhereInput = {
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.destination ? { destination: query.destination } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  if (query.dateFrom || query.dateTo) {
    where.startDate = {
      ...(query.dateFrom ? { gte: toDate(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: toDate(query.dateTo) } : {}),
    };
  }

  const [data, total] = await Promise.all([
    prisma.businessTrip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.businessTrip.count({ where }),
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
export async function cancelBusinessTrip(
  id: string,
  reason: string,
  operatorId: string,
) {
  const existing = await prisma.businessTrip.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('出差记录不存在', 404, 72201);
  }
  if (existing.status === 'approved' || existing.status === 'rejected') {
    throw new AppError('已批准/已拒绝不可撤回', 409, 72205);
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

  const updated = await prisma.businessTrip.update({
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
    description: '撤回出差申请',
    newValue: { reason },
  });

  return updated;
}

/**
 * 审批通过/拒绝回调
 */
export async function confirmBusinessTrip(
  id: string,
  approvalResult: { approved: boolean; instanceId?: string },
  operatorId: string,
  rejectedReason?: string,
) {
  const existing = await prisma.businessTrip.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('出差记录不存在', 404, 72201);
  }
  if (existing.status !== 'submitted') {
    throw new AppError('出差已审批', 409, 72204);
  }

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
    select: { id: true, name: true, userId: true },
  });

  if (approvalResult.approved) {
    const updated = await prisma.businessTrip.update({
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
        data: { employee_name: employee.name, destination: existing.destination },
        bypassTemplate: {
          channel: 'in_app',
          subject: '出差已通过',
          content: `${employee.name}，您的${existing.destination}出差申请已通过。`,
        },
      }).catch(() => undefined);
    }

    await auditService.auditLog({
      userId: operatorId,
      actorType: 'USER',
      action: 'APPROVE',
      resourceType: RESOURCE_TYPE,
      resourceId: id,
      description: '出差审批通过',
    });

    return updated;
  }

  const updated = await prisma.businessTrip.update({
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
        subject: '出差已驳回',
        content: `${employee.name}，您的出差申请已驳回。`,
      },
    }).catch(() => undefined);
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'REJECT',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '出差审批驳回',
  });

  return updated;
}

/**
 * 给 BullMQ 调用的即将出差列表
 */
export async function listUpcomingTrips(days: number) {
  const now = startOfDay(new Date());
  const until = new Date(now);
  until.setDate(until.getDate() + days);

  return prisma.businessTrip.findMany({
    where: {
      status: 'approved',
      startDate: { gte: now, lte: until },
    },
    orderBy: { startDate: 'asc' },
  });
}
