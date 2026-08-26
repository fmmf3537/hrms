// M3-D4: 绩效兑现 service | HRMS
// 仅 import audit/config + prisma
/* eslint-disable no-restricted-syntax, no-await-in-loop, no-continue */

import type { PerformancePayout, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'performance_payout';
const VALID_MODES = ['direct', 'pool'] as const;

export type PayoutMode = (typeof VALID_MODES)[number];

export interface ListPayoutFilter {
  cycleId?: string;
  employeeId?: string;
  mode?: PayoutMode;
  status?: string;
  period?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedPayouts {
  items: PerformancePayout[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SettleResult {
  settlements: PerformancePayout[];
  totalDifference: Decimal;
  totalPrepaid: Decimal;
  totalActual: Decimal;
}

interface ActorScope {
  unrestricted: boolean;
  deptId?: string;
  selfEmployeeId?: string;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatPeriod(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parsePeriod(period: string): Date {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new AppError('period 格式错误，应为 YYYY-MM', 400, 72703);
  }
  const [y, m] = period.split('-').map(Number);
  return startOfDay(new Date(y, m - 1, 1));
}

function parseMonthInput(month: Date | string): Date {
  if (month instanceof Date) return startOfDay(month);
  if (/^\d{4}-\d{2}$/.test(month)) return parsePeriod(month);
  return startOfDay(new Date(month));
}

async function getPerfConfigNumber(key: string, fallback: number): Promise<number> {
  try {
    const v = await configService.getValue('performance', key);
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

async function getPerfConfigArray(key: string, fallback: string[]): Promise<string[]> {
  try {
    const v = await configService.getValue('performance', key);
    if (Array.isArray(v)) return v.map(String);
    return fallback;
  } catch {
    return fallback;
  }
}

async function getActiveCoefficientsMap(): Promise<Record<string, number>> {
  const grades = await getPerfConfigArray('coefficient.grades', ['S', 'A', 'B', 'C', 'D']);
  const rows = await prisma.performanceCoefficient.findMany({
    where: { grade: { in: grades }, effectiveTo: null },
  });
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.grade] = Number(row.coefficient);
  }
  const defaults = await configService.getValue('performance', 'coefficient.default').catch(() => null);
  if (defaults && typeof defaults === 'object') {
    for (const g of grades) {
      if (map[g] == null && (defaults as Record<string, number>)[g] != null) {
        map[g] = Number((defaults as Record<string, number>)[g]);
      }
    }
  }
  return map;
}

async function getEmployeeBaseAmount(employeeId: string): Promise<Decimal> {
  const latest = await prisma.employeeSalaryHistory.findFirst({
    where: { employeeId },
    orderBy: { effectiveDate: 'desc' },
  });
  if (!latest) {
    throw new AppError('员工薪资历史不存在', 404);
  }
  const base = latest.performanceSalary ?? latest.totalSalary;
  if (base == null) {
    throw new AppError('绩效工资基数不存在', 404);
  }
  return new Decimal(base);
}

async function resolveActorScope(actorId: string): Promise<ActorScope> {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!user) return { unrestricted: true };

  const roleCodes = user.userRoles.map((r) => r.role.code);
  if (roleCodes.includes('admin') || roleCodes.includes('hr') || roleCodes.includes('executive')) {
    return { unrestricted: true };
  }

  const emp = await prisma.employee.findFirst({
    where: { userId: actorId, deletedAt: null },
    select: { id: true, departmentId: true },
  });

  if (roleCodes.includes('dept_head') && emp?.departmentId) {
    return { deptId: emp.departmentId, unrestricted: false };
  }
  if (roleCodes.includes('employee') && emp) {
    return { selfEmployeeId: emp.id, unrestricted: false };
  }
  return { unrestricted: true };
}

async function assertPayoutAccess(
  actorId: string,
  payout: { employeeId: string; employee?: { departmentId: string | null } },
): Promise<void> {
  const scope = await resolveActorScope(actorId);
  if (scope.unrestricted) return;

  if (scope.selfEmployeeId && payout.employeeId !== scope.selfEmployeeId) {
    throw new AppError('无权查看他人兑现记录', 403);
  }
  if (scope.deptId) {
    const deptId = payout.employee?.departmentId
      ?? (await prisma.employee.findUnique({
        where: { id: payout.employeeId },
        select: { departmentId: true },
      }))?.departmentId;
    if (deptId !== scope.deptId) {
      throw new AppError('无权查看其他部门兑现记录', 403);
    }
  }
}

function isPrepayMonth(month: Date): boolean {
  const m = month.getMonth() + 1;
  return m % 3 !== 0;
}

function quarterMonths(quarter: number): number[] {
  if (quarter < 1 || quarter > 4) {
    throw new AppError('季度参数不合法', 400, 72709);
  }
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

function isQuarterEndMonth(month: number): boolean {
  return month % 3 === 0;
}

/**
 * 直乘模式计算（V1.2 §二.5.3 模式一）
 * actualAmount = baseAmount × coefficient；D 档 excluded_grades → 0
 */
export async function calculateDirect(
  actorId: string,
  input: { employeeId: string; cycleId: string; month: Date | string },
): Promise<PerformancePayout> {
  const month = parseMonthInput(input.month);
  const period = formatPeriod(month);

  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, deletedAt: null },
  });
  if (!employee) throw new AppError('员工不存在', 404);

  const cycle = await prisma.performanceCycle.findUnique({ where: { id: input.cycleId } });
  if (!cycle) throw new AppError('考核周期不存在', 404);

  const record = await prisma.performanceRecord.findUnique({
    where: { employeeId_cycleId: { employeeId: input.employeeId, cycleId: input.cycleId } },
  });
  if (!record) throw new AppError('考核记录不存在', 404);
  if (record.status !== 'archived') {
    throw new AppError('考核记录未归档，无法兑现', 400, 72704);
  }

  const existing = await prisma.performancePayout.findUnique({
    where: {
      employeeId_cycleId_month_mode: {
        employeeId: input.employeeId,
        cycleId: input.cycleId,
        month,
        mode: 'direct',
      },
    },
  });
  if (existing) {
    throw new AppError('同员工同周期同月已存在兑现记录', 400, 72710);
  }

  const baseAmount = await getEmployeeBaseAmount(input.employeeId);
  const coefMap = await getActiveCoefficientsMap();
  const grade = record.finalGrade ?? 'B';
  const coefficient = new Decimal(coefMap[grade] ?? 1.0);

  const excluded = await getPerfConfigArray('payout.direct.excluded_grades', ['D']);
  const actualAmount = excluded.includes(grade)
    ? new Decimal(0)
    : baseAmount.mul(coefficient);

  const payout = await prisma.performancePayout.create({
    data: {
      employeeId: input.employeeId,
      cycleId: input.cycleId,
      month,
      period,
      mode: 'direct',
      baseAmount,
      coefficient,
      ratio: null,
      actualAmount,
      status: 'calculated',
      createdBy: actorId,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    action: 'PAYOUT_CALCULATE',
    resourceType: RESOURCE_TYPE,
    resourceId: payout.id,
    description: `直乘兑现 employee=${input.employeeId} period=${period} amount=${String(actualAmount)}`,
    newValue: { mode: 'direct', actualAmount: Number(actualAmount), grade },
  });

  return payout;
}

/**
 * 部门池模式批量计算（V1.2 §二.5.3 模式二）
 */
export async function calculatePool(
  actorId: string,
  input: { cycleId: string; month: Date | string; deptIds?: string[] },
): Promise<PerformancePayout[]> {
  const month = parseMonthInput(input.month);
  const period = formatPeriod(month);

  const cycle = await prisma.performanceCycle.findUnique({ where: { id: input.cycleId } });
  if (!cycle) throw new AppError('考核周期不存在', 404);

  let { deptIds } = input;
  if (!deptIds?.length) {
    const depts = await prisma.department.findMany({ select: { id: true } });
    deptIds = depts.map((d) => d.id);
  } else {
    const found = await prisma.department.findMany({
      where: { id: { in: deptIds } },
      select: { id: true },
    });
    if (found.length !== deptIds.length) {
      throw new AppError('部门不存在', 400, 72705);
    }
  }

  const minMembers = await getPerfConfigNumber('payout.pool.min_members', 5);
  const deptCoefDefault = await getPerfConfigNumber('payout.dept_coefficient_default', 1.0);
  const coefMap = await getActiveCoefficientsMap();
  const created: PerformancePayout[] = [];

  for (const deptId of deptIds) {
    const members = await prisma.employee.findMany({
      where: { departmentId: deptId, status: 'active', deletedAt: null },
    });
    if (members.length < minMembers) {
      throw new AppError('部门池成员数不足', 400, 72706);
    }

    const eligible: Array<{
      employeeId: string;
      baseAmount: Decimal;
      coefficient: Decimal;
    }> = [];

    for (const member of members) {
      const record = await prisma.performanceRecord.findUnique({
        where: { employeeId_cycleId: { employeeId: member.id, cycleId: input.cycleId } },
      });
      if (!record || record.status !== 'archived' || !record.finalGrade) continue;

      const dup = await prisma.performancePayout.findUnique({
        where: {
          employeeId_cycleId_month_mode: {
            employeeId: member.id,
            cycleId: input.cycleId,
            month,
            mode: 'pool',
          },
        },
      });
      if (dup) {
        throw new AppError('同员工同周期同月已存在兑现记录', 400, 72710);
      }

      const baseAmount = await getEmployeeBaseAmount(member.id);
      const coefficient = new Decimal(coefMap[record.finalGrade] ?? 1.0);
      eligible.push({ employeeId: member.id, baseAmount, coefficient });
    }

    if (eligible.length === 0) continue;

    const totalBase = eligible.reduce((s, e) => s.add(e.baseAmount), new Decimal(0));
    const deptPool = totalBase.mul(deptCoefDefault);
    const coefSum = eligible.reduce((s, e) => s.add(e.coefficient), new Decimal(0));

    for (const member of eligible) {
      const ratio = coefSum.gt(0)
        ? member.coefficient.div(coefSum)
        : new Decimal(0);
      const actualAmount = deptPool.mul(ratio);

      const payout = await prisma.performancePayout.create({
        data: {
          employeeId: member.employeeId,
          cycleId: input.cycleId,
          month,
          period,
          mode: 'pool',
          baseAmount: member.baseAmount,
          coefficient: member.coefficient,
          ratio,
          actualAmount,
          status: 'calculated',
          createdBy: actorId,
        },
      });
      created.push(payout);
    }
  }

  await auditService.auditLog({
    userId: actorId,
    action: 'PAYOUT_POOL_CALCULATE',
    resourceType: RESOURCE_TYPE,
    resourceId: input.cycleId,
    description: `部门池兑现 cycle=${input.cycleId} period=${period} count=${created.length}`,
    newValue: { count: created.length, deptIds },
  });

  return created;
}

/**
 * 单部门池计算（复用 calculatePool）
 */
export async function calculatePoolByDept(
  actorId: string,
  deptId: string,
  cycleId: string,
  month: Date | string,
): Promise<PerformancePayout[]> {
  return calculatePool(actorId, { cycleId, month, deptIds: [deptId] });
}

/**
 * 预支（季度前 2 月按 1.0 系数 × prepay_rate）
 */
export async function prepay(
  actorId: string,
  input: { cycleId: string; month: Date | string; employeeId?: string },
): Promise<PerformancePayout[]> {
  const month = parseMonthInput(input.month);
  const period = formatPeriod(month);

  if (!isPrepayMonth(month)) {
    throw new AppError('当前月份不允许预支', 400, 72707);
  }

  const cycle = await prisma.performanceCycle.findUnique({ where: { id: input.cycleId } });
  if (!cycle) throw new AppError('考核周期不存在', 404);
  if (!['active', 'closed'].includes(cycle.status)) {
    throw new AppError('考核周期状态不允许预支', 400, 72707);
  }

  const prepayRate = await getPerfConfigNumber('payout.prepay_rate', 0.5);

  let employees: Array<{ id: string }>;
  if (input.employeeId) {
    const emp = await prisma.employee.findFirst({
      where: { id: input.employeeId, deletedAt: null },
    });
    if (!emp) throw new AppError('员工不存在', 404);
    employees = [emp];
  } else {
    employees = await prisma.employee.findMany({
      where: { status: 'active', deletedAt: null },
      select: { id: true },
    });
  }

  const results: PerformancePayout[] = [];

  for (const emp of employees) {
    const existing = await prisma.performancePayout.findFirst({
      where: {
        employeeId: emp.id,
        cycleId: input.cycleId,
        month,
        status: 'prepaid',
      },
    });
    if (existing) {
      throw new AppError('当月已预支', 400, 72708);
    }

    const baseAmount = await getEmployeeBaseAmount(emp.id);
    const actualAmount = baseAmount.mul(1.0).mul(prepayRate);

    const payout = await prisma.performancePayout.create({
      data: {
        employeeId: emp.id,
        cycleId: input.cycleId,
        month,
        period,
        mode: 'direct',
        baseAmount,
        coefficient: new Decimal(1.0),
        ratio: null,
        actualAmount,
        status: 'prepaid',
        createdBy: actorId,
      },
    });
    results.push(payout);
  }

  await auditService.auditLog({
    userId: actorId,
    action: 'PAYOUT_PREPAY',
    resourceType: RESOURCE_TYPE,
    resourceId: input.cycleId,
    description: `绩效预支 cycle=${input.cycleId} period=${period} count=${results.length}`,
    newValue: { count: results.length, prepayRate },
  });

  return results;
}

/**
 * 季度末清算（多退少补，仅标记 + audit）
 */
export async function settle(
  actorId: string,
  input: { cycleId: string; quarter: number; employeeId?: string },
): Promise<SettleResult> {
  const cycle = await prisma.performanceCycle.findUnique({ where: { id: input.cycleId } });
  if (!cycle) throw new AppError('考核周期不存在', 404);

  const triggerStatuses = await getPerfConfigArray('payout.settle.trigger_cycle_status', ['closed', 'archived']);
  if (!triggerStatuses.includes(cycle.status)) {
    throw new AppError('考核周期状态不允许清算', 400, 72709);
  }

  const months = quarterMonths(input.quarter);
  const endMonth = months[2];
  if (!isQuarterEndMonth(endMonth)) {
    throw new AppError('非季度末，不允许清算', 400, 72709);
  }

  let employees: Array<{ id: string }>;
  if (input.employeeId) {
    const emp = await prisma.employee.findFirst({
      where: { id: input.employeeId, deletedAt: null },
    });
    if (!emp) throw new AppError('员工不存在', 404);
    employees = [emp];
  } else {
    employees = await prisma.employee.findMany({
      where: { status: 'active', deletedAt: null },
      select: { id: true },
    });
  }

  const settlements: PerformancePayout[] = [];
  let totalDifference = new Decimal(0);
  let totalPrepaid = new Decimal(0);
  let totalActual = new Decimal(0);

  for (const emp of employees) {
    const record = await prisma.performanceRecord.findUnique({
      where: { employeeId_cycleId: { employeeId: emp.id, cycleId: input.cycleId } },
    });
    if (!record || record.status !== 'archived') {
      throw new AppError('考核记录未归档，无法清算', 400, 72709);
    }

    const coefMap = await getActiveCoefficientsMap();
    const grade = record.finalGrade ?? 'B';
    const baseAmount = await getEmployeeBaseAmount(emp.id);
    const coefficient = new Decimal(coefMap[grade] ?? 1.0);
    const excluded = await getPerfConfigArray('payout.direct.excluded_grades', ['D']);
    const monthlyFull = excluded.includes(grade)
      ? new Decimal(0)
      : baseAmount.mul(coefficient);

    const year = cycle.startDate.getFullYear();
    const periods = months.map((m) => `${year}-${String(m).padStart(2, '0')}`);

    const calculated = await prisma.performancePayout.findMany({
      where: {
        employeeId: emp.id,
        cycleId: input.cycleId,
        period: { in: periods },
        status: 'calculated',
      },
    });

    const prepaid = await prisma.performancePayout.findMany({
      where: {
        employeeId: emp.id,
        cycleId: input.cycleId,
        period: { in: periods.slice(0, 2) },
        status: 'prepaid',
      },
    });

    let actualQuarterAmount = new Decimal(0);
    for (const p of periods) {
      const calc = calculated.find((c) => c.period === p);
      if (calc) {
        actualQuarterAmount = actualQuarterAmount.add(calc.actualAmount);
      } else {
        actualQuarterAmount = actualQuarterAmount.add(monthlyFull);
      }
    }

    const alreadyPaid = prepaid.reduce((s, p) => s.add(p.actualAmount), new Decimal(0));
    const difference = actualQuarterAmount.sub(alreadyPaid);

    totalActual = totalActual.add(actualQuarterAmount);
    totalPrepaid = totalPrepaid.add(alreadyPaid);
    totalDifference = totalDifference.add(difference);

    if (prepaid.length > 0) {
      await prisma.performancePayout.updateMany({
        where: { id: { in: prepaid.map((p) => p.id) } },
        data: { status: 'settled' },
      });
    }

    if (!difference.eq(0)) {
      const settleMonth = startOfDay(new Date(year, endMonth - 1, 1));
      const settlePeriod = formatPeriod(settleMonth);
      const existingEnd = await prisma.performancePayout.findUnique({
        where: {
          employeeId_cycleId_month_mode: {
            employeeId: emp.id,
            cycleId: input.cycleId,
            month: settleMonth,
            mode: 'direct',
          },
        },
      });

      if (existingEnd) {
        const updated = await prisma.performancePayout.update({
          where: { id: existingEnd.id },
          data: {
            actualAmount: existingEnd.actualAmount.add(difference),
            status: 'settled',
          },
        });
        settlements.push(updated);
      } else {
        const settlement = await prisma.performancePayout.create({
          data: {
            employeeId: emp.id,
            cycleId: input.cycleId,
            month: settleMonth,
            period: settlePeriod,
            mode: 'direct',
            baseAmount: new Decimal(0),
            coefficient: new Decimal(1.0),
            ratio: null,
            actualAmount: difference,
            status: 'settled',
            createdBy: actorId,
          },
        });
        settlements.push(settlement);
      }
    }
  }

  await auditService.auditLog({
    userId: actorId,
    action: 'PAYOUT_SETTLE',
    resourceType: RESOURCE_TYPE,
    resourceId: input.cycleId,
    description: `绩效清算 Q${input.quarter} difference=${String(totalDifference)}`,
    newValue: {
      totalActual: Number(totalActual),
      totalPrepaid: Number(totalPrepaid),
      totalDifference: Number(totalDifference),
    },
  });

  return {
    settlements,
    totalDifference,
    totalPrepaid,
    totalActual,
  };
}

/**
 * 列出兑现记录（分页 + 权限过滤）
 */
export async function listPayouts(
  actorId: string,
  filter: ListPayoutFilter,
): Promise<PaginatedPayouts> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  if (page < 1 || pageSize < 1 || pageSize > 100) {
    throw new AppError('分页参数不合法', 400);
  }

  if (filter.period && !/^\d{4}-\d{2}$/.test(filter.period)) {
    throw new AppError('period 格式错误', 400, 72703);
  }

  const scope = await resolveActorScope(actorId);
  const where: Prisma.PerformancePayoutWhereInput = {};

  if (filter.cycleId) where.cycleId = filter.cycleId;
  if (filter.employeeId) where.employeeId = filter.employeeId;
  if (filter.mode) where.mode = filter.mode;
  if (filter.status) where.status = filter.status;
  if (filter.period) where.period = filter.period;

  if (!scope.unrestricted) {
    if (scope.selfEmployeeId) {
      where.employeeId = scope.selfEmployeeId;
    } else if (scope.deptId) {
      where.employee = { departmentId: scope.deptId };
    }
  }

  const [items, total] = await Promise.all([
    prisma.performancePayout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        employee: { select: { id: true, name: true, departmentId: true } },
        cycle: true,
      },
    }),
    prisma.performancePayout.count({ where }),
  ]);

  await auditService.auditLog({
    userId: actorId,
    action: 'PAYOUT_LIST',
    resourceType: RESOURCE_TYPE,
    description: `查询兑现列表 total=${total}`,
    newValue: { filter, total },
  });

  return {
    items, total, page, pageSize,
  };
}

/**
 * 获取兑现记录详情
 */
export async function getPayout(actorId: string, id: string): Promise<PerformancePayout> {
  const payout = await prisma.performancePayout.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, name: true, departmentId: true } },
      cycle: true,
    },
  });
  if (!payout) throw new AppError('兑现记录不存在', 404);

  await assertPayoutAccess(actorId, payout);
  return payout;
}
