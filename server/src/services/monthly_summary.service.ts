// M2-B6: 月度考勤汇总 service | HRMS
// 仅 import audit/config/notification + prisma；不 import leave/overtime/attendance 等跨 service

import type { Employee, MonthlySummary, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';
import * as notificationService from './notification.service';

const RESOURCE_TYPE = 'MonthlySummary';

const NOTIFY_GENERATED = 'summary_generated:in_app';

const DEFAULT_AUTO_GENERATE_DAY = 1;
const DEFAULT_EMPLOYEE_CONFIRM_DEADLINE = 3;
const DEFAULT_HR_LOCK_DAY = 5;
const DEFAULT_CONFIRM_STRATEGY = 'auto_confirm';
const DEFAULT_WORK_DAYS_PER_MONTH = 21.75;
const HOURS_PER_DAY = 8;

export interface GenerateMonthlySummaryInput {
  year: number;
  month: number;
  employeeId?: string;
}

export interface GetMonthlySummaryQuery {
  employeeId?: string;
  companyId?: string;
  departmentId?: string;
  year: number;
  month: number;
  status?: string;
}

export interface AttendanceSummary {
  workDays: number;
  lateCount: number;
  earlyLeaveCount: number;
  missingCount: number;
}

export interface LeaveSummary {
  leaveDays: number;
  leaveHours: number;
}

export interface OvertimeSummary {
  overtimeHours: number;
}

export interface TripSummary {
  tripDays: number;
}

interface SummaryMetricsData {
  workDays: Decimal;
  lateCount: number;
  earlyLeaveCount: number;
  missingCount: number;
  leaveDays: Decimal;
  leaveHours: Decimal;
  overtimeHours: Decimal;
  tripDays: Decimal;
  compBalance: Decimal;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function toDecimal(n: number): Decimal {
  return new Decimal(round1(n));
}

function monthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

function validateYearMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    throw new AppError('月份不合法', 400, 72303);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError('月份不合法', 400, 72303);
  }
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

async function getSummaryConfigNumber(
  key: string,
  fallback: number,
): Promise<number> {
  try {
    const v = await configService.getValue('summary', key);
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    // TODO: summary configs 入库后去掉 fallback
    return fallback;
  }
}

async function getSummaryConfigString(
  key: string,
  fallback: string,
): Promise<string> {
  try {
    const v = await configService.getValue('summary', key);
    return typeof v === 'string' ? v : fallback;
  } catch {
    return fallback;
  }
}

function assertInConfirmWindow(deadlineDay: number): void {
  const today = new Date().getDate();
  if (today > deadlineDay) {
    throw new AppError('已超出员工确认窗口期', 400, 72307);
  }
}

function assertInLockWindow(lockDay: number): void {
  const today = new Date().getDate();
  if (today > lockDay) {
    throw new AppError('已超出 HR 锁定窗口期', 400, 72308);
  }
}

/**
 * 内部：考勤聚合（从 B2 attendance_records 读）
 */
export async function aggregateAttendanceSummary(
  employeeId: string,
  year: number,
  month: number,
): Promise<AttendanceSummary> {
  const { start, end } = monthRange(year, month);
  const records = await prisma.attendanceRecord.findMany({
    where: {
      employeeId,
      status: 'approved',
      clockInTime: { not: null, gte: start, lte: end },
    },
  });

  const workDaySet = records.reduce((set, r) => {
    if (r.clockInTime) set.add(dateKey(r.clockInTime));
    return set;
  }, new Set<string>());

  const lateCount = records.filter((r) => r.isLate).length;
  const earlyLeaveCount = records.filter((r) => r.isEarlyLeave).length;
  const missingCount = records.filter((r) => r.isMissing).length;

  return {
    workDays: workDaySet.size,
    lateCount,
    earlyLeaveCount,
    missingCount,
  };
}

/**
 * 内部：请假聚合（从 B3 leave_requests 读）
 */
export async function aggregateLeaveSummary(
  employeeId: string,
  year: number,
  month: number,
): Promise<LeaveSummary> {
  const { start, end } = monthRange(year, month);
  const records = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      status: 'approved',
      startDate: { gte: start, lte: end },
    },
  });

  const leaveDays = records.reduce((sum, r) => sum + Number(r.totalDays), 0);
  return {
    leaveDays: round1(leaveDays),
    leaveHours: round1(leaveDays * HOURS_PER_DAY),
  };
}

/**
 * 内部：加班聚合（从 B4 overtime_requests 读）
 */
async function aggregateOvertimeSummary(
  employeeId: string,
  year: number,
  month: number,
): Promise<OvertimeSummary> {
  const { start, end } = monthRange(year, month);
  const records = await prisma.overtimeRequest.findMany({
    where: {
      employeeId,
      status: 'approved',
      startTime: { gte: start, lte: end },
    },
  });

  const overtimeHours = records.reduce((sum, r) => sum + Number(r.totalHours), 0);
  return { overtimeHours: round1(overtimeHours) };
}

/**
 * 内部：出差聚合（从 B5 business_trips 读）
 */
async function aggregateTripSummary(
  employeeId: string,
  year: number,
  month: number,
): Promise<TripSummary> {
  const { start, end } = monthRange(year, month);
  const records = await prisma.businessTrip.findMany({
    where: {
      employeeId,
      status: 'approved',
      startDate: { gte: start, lte: end },
    },
  });

  const tripDays = records.reduce((sum, r) => sum + Number(r.totalDays), 0);
  return { tripDays: round1(tripDays) };
}

/**
 * 【B6 关键函数】调休余额计算（独立实现，不调 leave.service）
 */
export async function calculateCompBalance(
  employeeId: string,
  year: number,
  month: number,
): Promise<number> {
  const { start, end } = monthRange(year, month);

  const overtimeRecords = await prisma.overtimeRequest.findMany({
    where: {
      employeeId,
      status: 'approved',
      compensationType: 'comp',
      startTime: { gte: start, lte: end },
    },
  });

  const leaveRecords = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      status: 'approved',
      leaveType: 'compensatory',
      startDate: { gte: start, lte: end },
    },
  });

  const compEarned = overtimeRecords.reduce((sum, r) => {
    if (r.compDays != null) return sum + Number(r.compDays);
    return sum + Number(r.totalHours) / HOURS_PER_DAY;
  }, 0);

  const compUsed = leaveRecords.reduce((sum, r) => sum + Number(r.totalDays), 0);
  const balance = compEarned - compUsed;
  return balance < 0 ? 0 : round1(balance);
}

async function buildSummaryData(
  employeeId: string,
  year: number,
  month: number,
): Promise<SummaryMetricsData> {
  const [attendance, leave, overtime, trip, compBalance] = await Promise.all([
    aggregateAttendanceSummary(employeeId, year, month),
    aggregateLeaveSummary(employeeId, year, month),
    aggregateOvertimeSummary(employeeId, year, month),
    aggregateTripSummary(employeeId, year, month),
    calculateCompBalance(employeeId, year, month),
  ]);

  return {
    workDays: toDecimal(attendance.workDays),
    lateCount: attendance.lateCount,
    earlyLeaveCount: attendance.earlyLeaveCount,
    missingCount: attendance.missingCount,
    leaveDays: toDecimal(leave.leaveDays),
    leaveHours: toDecimal(leave.leaveHours),
    overtimeHours: toDecimal(overtime.overtimeHours),
    tripDays: toDecimal(trip.tripDays),
    compBalance: toDecimal(compBalance),
  };
}

async function notifyEmployeeSummaryGenerated(
  employee: Pick<Employee, 'id' | 'name' | 'userId'>,
  year: number,
  month: number,
  summaryId: string,
): Promise<void> {
  if (!employee.userId) return;

  await notificationService.sendNotification({
    templateKey: NOTIFY_GENERATED,
    userId: employee.userId,
    data: {
      employee_name: employee.name,
      employee_id: employee.id,
      year,
      month,
      summary_id: summaryId,
    },
    bypassTemplate: {
      channel: 'in_app',
      subject: '月度考勤报表已生成',
      content: `${employee.name}，${year}年${month}月考勤汇总已生成，请在截止日前确认。`,
    },
  }).catch(() => undefined);
}

/**
 * 生成指定月份的全员 / 单员工月度报表
 */
export async function generateMonthlySummary(
  input: GenerateMonthlySummaryInput,
  operatorId: string,
): Promise<{ generated: number; summaries: MonthlySummary[] }> {
  const { year, month, employeeId } = input;
  validateYearMonth(year, month);

  const employees = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      status: { in: ['probation', 'active'] },
      ...(employeeId ? { id: employeeId } : {}),
    },
  });

  if (employeeId && employees.length === 0) {
    throw new AppError('员工不存在', 404, 72301);
  }

  const summaries: MonthlySummary[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      const createdList = await Promise.all(
        employees.map(async (emp) => {
          if (!emp.departmentId) return null;

          const existing = await tx.monthlySummary.findFirst({
            where: { employeeId: emp.id, year, month },
          });

          if (existing) {
            if (existing.status === 'hr_locked') {
              throw new AppError('报表已锁定，不能修改', 409, 72310);
            }
            if (employeeId) {
              throw new AppError('该月报表已生成', 409, 72302);
            }
            return null;
          }

          const metrics = await buildSummaryData(emp.id, year, month);
          return tx.monthlySummary.create({
            data: {
              employeeId: emp.id,
              companyId: emp.companyId,
              departmentId: emp.departmentId,
              year,
              month,
              ...metrics,
              status: 'draft',
              createdBy: operatorId,
            },
          });
        }),
      );

      summaries.push(
        ...createdList.filter((item): item is MonthlySummary => item != null),
      );
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('报表生成失败', 500, 72309);
  }

  await Promise.all(
    summaries.map(async (summary) => {
      const emp = employees.find((e) => e.id === summary.employeeId);
      if (emp) {
        await notifyEmployeeSummaryGenerated(emp, year, month, summary.id);
      }
    }),
  );

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'GENERATE',
    resourceType: RESOURCE_TYPE,
    resourceId: `${year}-${month}`,
    description: `生成 ${year}-${month} 月度考勤汇总 ${summaries.length} 条`,
    newValue: {
      year,
      month,
      generated: summaries.length,
      employeeId: employeeId ?? null,
    },
  });

  return { generated: summaries.length, summaries };
}

/**
 * 查月度报表
 */
export async function getMonthlySummary(
  query: GetMonthlySummaryQuery,
): Promise<MonthlySummary | MonthlySummary[]> {
  const {
    employeeId, companyId, departmentId, year, month, status,
  } = query;
  validateYearMonth(year, month);

  if (employeeId) {
    const summary = await prisma.monthlySummary.findFirst({
      where: {
        employeeId, year, month, ...(status ? { status } : {}),
      },
    });
    if (!summary) {
      throw new AppError('月度报表不存在', 404, 72301);
    }
    return summary;
  }

  if (!companyId) {
    throw new AppError('请指定 employeeId 或 companyId', 400, 72303);
  }

  return prisma.monthlySummary.findMany({
    where: {
      companyId,
      year,
      month,
      ...(departmentId ? { departmentId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: [{ departmentId: 'asc' }, { employeeId: 'asc' }],
  });
}

/**
 * 员工确认（draft → employee_confirmed）
 */
export async function confirmMonthlySummary(
  id: string,
  operatorId: string,
): Promise<MonthlySummary> {
  const existing = await prisma.monthlySummary.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('月度报表不存在', 404, 72301);
  }
  if (existing.status === 'hr_locked') {
    throw new AppError('报表已锁定，不能修改', 409, 72310);
  }
  if (existing.status !== 'draft') {
    throw new AppError('报表已确认', 409, 72305);
  }

  const deadline = await getSummaryConfigNumber(
    'employee_confirm_deadline',
    DEFAULT_EMPLOYEE_CONFIRM_DEADLINE,
  );
  assertInConfirmWindow(deadline);

  const updated = await prisma.monthlySummary.update({
    where: { id },
    data: {
      status: 'employee_confirmed',
      employeeConfirmedAt: new Date(),
      employeeConfirmedBy: operatorId,
    },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'CONFIRM',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `员工确认月度考勤汇总 ${existing.year}-${existing.month}`,
    oldValue: { status: 'draft' },
    newValue: { status: 'employee_confirmed' },
  });

  return updated;
}

/**
 * HR 锁定（employee_confirmed → hr_locked）
 */
export async function lockMonthlySummary(
  id: string,
  operatorId: string,
): Promise<MonthlySummary> {
  const existing = await prisma.monthlySummary.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('月度报表不存在', 404, 72301);
  }
  if (existing.status === 'hr_locked') {
    throw new AppError('报表已锁定', 409, 72306);
  }
  if (existing.status !== 'employee_confirmed') {
    if (existing.status === 'draft') {
      throw new AppError('当前状态不允许此操作', 409, 72304);
    }
    throw new AppError('当前状态不允许此操作', 409, 72304);
  }

  const lockDay = await getSummaryConfigNumber('hr_lock_day', DEFAULT_HR_LOCK_DAY);
  assertInLockWindow(lockDay);

  const updated = await prisma.monthlySummary.update({
    where: { id },
    data: {
      status: 'hr_locked',
      hrLockedAt: new Date(),
      hrLockedBy: operatorId,
    },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'LOCK',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `HR 锁定月度考勤汇总 ${existing.year}-${existing.month}`,
    oldValue: { status: 'employee_confirmed' },
    newValue: { status: 'hr_locked' },
  });

  return updated;
}

/**
 * 给 BullMQ 调用的待生成月度报表员工列表（B6 不实现 BullMQ 调度）
 */
export async function listEmployeesForSummary(
  year: number,
  month: number,
): Promise<Employee[]> {
  validateYearMonth(year, month);

  const employees = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      status: { in: ['probation', 'active'] },
    },
  });

  const existing = await prisma.monthlySummary.findMany({
    where: { year, month },
    select: { employeeId: true },
  });
  const existingSet = new Set(existing.map((e) => e.employeeId));

  return employees.filter((e) => !existingSet.has(e.id));
}

/** 读取 summary 模块配置（供测试 / 文档） */
export async function getSummaryConfigs(): Promise<Record<string, unknown>> {
  const [
    autoGenerateDay,
    employeeConfirmDeadline,
    hrLockDay,
    defaultConfirmStrategy,
    workDaysPerMonth,
  ] = await Promise.all([
    getSummaryConfigNumber('auto_generate_day', DEFAULT_AUTO_GENERATE_DAY),
    getSummaryConfigNumber('employee_confirm_deadline', DEFAULT_EMPLOYEE_CONFIRM_DEADLINE),
    getSummaryConfigNumber('hr_lock_day', DEFAULT_HR_LOCK_DAY),
    getSummaryConfigString('default_confirm_strategy', DEFAULT_CONFIRM_STRATEGY),
    getSummaryConfigNumber('work_days_per_month', DEFAULT_WORK_DAYS_PER_MONTH),
  ]);

  return {
    auto_generate_day: autoGenerateDay,
    employee_confirm_deadline: employeeConfirmDeadline,
    hr_lock_day: hrLockDay,
    default_confirm_strategy: defaultConfirmStrategy,
    work_days_per_month: workDaysPerMonth,
  };
}

export type { MonthlySummary, Prisma };
