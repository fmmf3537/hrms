// M4-C4: 算薪引擎（应发/应扣/实发 + 异常检测）| HRMS
// 仅 prisma 读 C1/C2/M2/D2 表；调 C3 calculateMonthlyTax；不写 employee_salary_history

import type { PayslipItemType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';
import * as taxService from './tax_calculation.service';

const RESOURCE_TYPE = 'payslip';
const FALLBACK_WORK_DAYS = 21.75;
const FALLBACK_OT_RATE = 1.5;
const FALLBACK_SICK_RATE = 0.2;
const FALLBACK_LATE_PENALTY = 50;
const FALLBACK_THRESHOLD = { absolute_diff: 1000, percentage_diff: 0.1 };

export interface CalculateSinglePayrollInput {
  employeeId: string;
  period: string;
}

export interface AnomalyInfo {
  isAnomaly: boolean;
  diff: number;
  percentage: number;
}

export interface PayrollCalculationResult {
  employeeId: string;
  period: string;
  baseAmount: number;
  performanceAmount: number;
  overtimeAmount: number;
  allowanceAmount: number;
  salesCommissionAmount: number;
  yearEndBonusAmount: number;
  grossAmount: number;
  socialInsuranceAmount: number;
  housingFundAmount: number;
  taxAmount: number;
  absenceAmount: number;
  deductionAmount: number;
  netAmount: number;
  anomaly: AnomalyInfo;
}

export interface CalculatePayrollInput {
  period: string;
  deptIds?: string[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toNum(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v);
}

function parsePeriod(period: string): { year: number; month: number } {
  const matched = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!matched) {
    throw new AppError('period 格式错误，应为 YYYY-MM', 400, 73404);
  }
  return { year: Number(matched[1]), month: Number(matched[2]) };
}

function monthBounds(period: string): { start: Date; end: Date } {
  const { year, month } = parsePeriod(period);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

function prevPeriod(period: string): string {
  const { year, month } = parsePeriod(period);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

async function getAnomalyThreshold(): Promise<{ absolute_diff: number; percentage_diff: number }> {
  try {
    const v = await configService.getValue('salary', 'payroll.anomaly_threshold');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const row = v as Record<string, unknown>;
      const abs = Number(row.absolute_diff);
      const pct = Number(row.percentage_diff);
      return {
        absolute_diff: Number.isFinite(abs) ? abs : FALLBACK_THRESHOLD.absolute_diff,
        percentage_diff: Number.isFinite(pct) ? pct : FALLBACK_THRESHOLD.percentage_diff,
      };
    }
    return FALLBACK_THRESHOLD;
  } catch {
    // TODO: configs.salary.payroll.anomaly_threshold 未配置时 fallback
    return FALLBACK_THRESHOLD;
  }
}

/**
 * 对比本月 vs 上月实发，绝对差 > 1000 或 比例 > 10% 视为异常（V1.2 §二.4.2）
 */
export function detectAnomaly(
  currentNet: number,
  lastNet: number | null,
  threshold: { absolute_diff: number; percentage_diff: number },
): AnomalyInfo {
  if (lastNet == null) {
    return { isAnomaly: false, diff: 0, percentage: 0 };
  }
  const diff = round2(Math.abs(currentNet - lastNet));
  let percentage = 0;
  if (lastNet === 0) {
    percentage = diff > 0 ? 1 : 0;
  } else {
    percentage = round2(diff / Math.abs(lastNet));
  }
  const isAnomaly = diff > threshold.absolute_diff || percentage > threshold.percentage_diff;
  return { isAnomaly, diff, percentage };
}

function clampBase(base: number, min: number, max: number): number {
  return Math.min(Math.max(base, min), max);
}

/**
 * 单员工算薪（V1.2 §二.4.2 月度核算公式）
 * @param actorId 操作人 ID
 * @param input { employeeId, period }
 * @returns 应发/应扣/实发 + 异常标记
 * @throws AppError(400) 员工不存在
 * @throws AppError(400, 73408) 无生效方案 / 保险登记 / 绩效等级
 * 校验链：
 *  1. employee 存在
 *  2. C1 employee_salary_plans active
 *  3. C2 employee_insurance_registrations active
 *  4. D2 performance_records.finalGrade + D3 coefficient
 *  5. prisma 汇总加班/请假/出差/迟到（不 import M2 service）
 *  6. 应发 = base + performance + overtime + allowance（不含销售提成/项目奖金）
 *  7. 应扣 = social + housing + C3 个税 + absence
 *  8. 实发 = 应发 - 应扣；对比上月 payslip 做异常检测
 */
export async function calculateSinglePayroll(
  actorId: string,
  input: CalculateSinglePayrollInput,
): Promise<PayrollCalculationResult> {
  parsePeriod(input.period);
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, deletedAt: null },
    select: { id: true },
  });
  if (!employee) {
    throw new AppError('员工不存在', 400);
  }

  const plan = await prisma.employeeSalaryPlan.findFirst({
    where: { employeeId: input.employeeId, status: 'active' },
  });
  if (!plan) {
    throw new AppError('无生效薪酬方案', 400, 73408);
  }

  const registration = await prisma.employeeInsuranceRegistration.findFirst({
    where: { employeeId: input.employeeId, status: 'active' },
    include: { housingFundScheme: true },
  });
  if (!registration) {
    throw new AppError('无生效社保公积金登记', 400, 73408);
  }

  const perfRecord = await prisma.performanceRecord.findFirst({
    where: {
      employeeId: input.employeeId,
      finalGrade: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (!perfRecord?.finalGrade) {
    throw new AppError('绩效等级缺失', 400, 73408);
  }

  const coeffRow = await prisma.performanceCoefficient.findFirst({
    where: { grade: perfRecord.finalGrade, effectiveTo: null },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!coeffRow) {
    throw new AppError('绩效系数缺失', 400, 73408);
  }

  const baseAmount = toNum(plan.baseSalary);
  const performanceAmount = round2(toNum(plan.performanceBase) * toNum(coeffRow.coefficient));
  const { start, end } = monthBounds(input.period);

  const overtimeRows = await prisma.overtimeRequest.findMany({
    where: {
      employeeId: input.employeeId,
      status: 'approved',
      compensationType: 'pay',
      startTime: { gte: start, lte: end },
    },
    select: { totalHours: true },
  });
  const otHours = overtimeRows.reduce((sum, r) => sum + toNum(r.totalHours), 0);
  const overtimeAmount = round2(
    ((baseAmount * otHours) / FALLBACK_WORK_DAYS / 8) * FALLBACK_OT_RATE,
  );

  const leaveRows = await prisma.leaveRequest.findMany({
    where: {
      employeeId: input.employeeId,
      status: 'approved',
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: { leaveType: true, totalDays: true },
  });
  let personalDays = 0;
  let sickDays = 0;
  leaveRows.forEach((row) => {
    const days = toNum(row.totalDays);
    if (row.leaveType === 'personal') personalDays += days;
    if (row.leaveType === 'sick') sickDays += days;
  });
  const dayWage = baseAmount / FALLBACK_WORK_DAYS;
  const attendanceRows = await prisma.attendanceRecord.findMany({
    where: {
      employeeId: input.employeeId,
      clockInTime: { gte: start, lte: end },
      OR: [{ isLate: true }, { isEarlyLeave: true }],
    },
    select: { isLate: true, isEarlyLeave: true },
  });
  const lateCount = attendanceRows.filter((r) => r.isLate || r.isEarlyLeave).length;
  const absenceAmount = round2(
    (personalDays * dayWage)
    + (sickDays * dayWage * FALLBACK_SICK_RATE)
    + (lateCount * FALLBACK_LATE_PENALTY),
  );

  const trips = await prisma.businessTrip.findMany({
    where: {
      employeeId: input.employeeId,
      status: 'approved',
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: { allowanceAmount: true },
  });
  const tripAllowance = trips.reduce((sum, t) => sum + toNum(t.allowanceAmount), 0);
  const allowanceAmount = round2(toNum(plan.allowance) + tripAllowance);

  const socialSchemes = await prisma.socialInsuranceScheme.findMany({
    where: { city: registration.city, status: 'active' },
  });
  if (socialSchemes.length === 0) {
    throw new AppError('社保方案未配置', 400, 73408);
  }
  const insBase = toNum(registration.baseSalary);
  const socialInsuranceAmount = round2(socialSchemes.reduce((sum, s) => {
    const base = clampBase(insBase, toNum(s.baseMin), toNum(s.baseMax));
    return sum + base * toNum(s.personalRate);
  }, 0));

  let housingFundAmount = 0;
  const fund = registration.housingFundScheme
    ?? await prisma.housingFundScheme.findFirst({
      where: { city: registration.city, status: 'active' },
    });
  if (!fund) {
    throw new AppError('公积金方案未配置', 400, 73408);
  }
  const fundBase = clampBase(insBase, toNum(fund.baseMin), toNum(fund.baseMax));
  housingFundAmount = round2(fundBase * toNum(fund.personalRate));

  const salesCommissionAmount = 0;
  const yearEndBonusAmount = 0;
  const grossAmount = round2(
    baseAmount + performanceAmount + overtimeAmount + allowanceAmount
    + salesCommissionAmount + yearEndBonusAmount,
  );

  const taxBase = round2(Math.max(0, grossAmount - socialInsuranceAmount - housingFundAmount));
  let taxAmount = 0;
  try {
    if (taxBase > 0) {
      const tax = await taxService.calculateMonthlyTax(actorId, {
        employeeId: input.employeeId,
        period: input.period,
        baseAmount: taxBase,
      });
      taxAmount = tax.taxAmount;
    }
  } catch (err) {
    if (!(err instanceof AppError && err.code === 73202)) throw err;
  }

  const deductionAmount = round2(
    socialInsuranceAmount + housingFundAmount + taxAmount + absenceAmount,
  );
  const netAmount = round2(grossAmount - deductionAmount);

  const last = await prisma.payslip.findFirst({
    where: {
      employeeId: input.employeeId,
      period: prevPeriod(input.period),
      status: { in: ['approved', 'locked'] },
    },
    select: { netAmount: true },
  });
  const threshold = await getAnomalyThreshold();
  const anomaly = detectAnomaly(netAmount, last ? toNum(last.netAmount) : null, threshold);

  const result: PayrollCalculationResult = {
    employeeId: input.employeeId,
    period: input.period,
    baseAmount,
    performanceAmount,
    overtimeAmount,
    allowanceAmount,
    salesCommissionAmount,
    yearEndBonusAmount,
    grossAmount,
    socialInsuranceAmount,
    housingFundAmount,
    taxAmount,
    absenceAmount,
    deductionAmount,
    netAmount,
    anomaly,
  };

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PAYSLIP_CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: input.employeeId,
    description: `算薪 ${input.period}`,
    newValue: result,
  });

  return result;
}

export interface PayslipItemRow {
  itemType: PayslipItemType;
  itemName: string;
  amount: number;
  description?: string;
}

export function toPayslipItemRows(calc: PayrollCalculationResult): PayslipItemRow[] {
  return [
    {
      itemType: 'earning_base', itemName: '基本工资', amount: calc.baseAmount,
    },
    {
      itemType: 'earning_performance', itemName: '绩效工资', amount: calc.performanceAmount,
    },
    {
      itemType: 'earning_overtime', itemName: '加班费', amount: calc.overtimeAmount,
    },
    {
      itemType: 'earning_allowance', itemName: '津贴补助', amount: calc.allowanceAmount,
    },
    {
      itemType: 'earning_commission', itemName: '销售提成', amount: calc.salesCommissionAmount,
    },
    {
      itemType: 'earning_bonus', itemName: '年终奖', amount: calc.yearEndBonusAmount,
    },
    {
      itemType: 'deduction_social', itemName: '社保个人', amount: -calc.socialInsuranceAmount,
    },
    {
      itemType: 'deduction_housing', itemName: '公积金个人', amount: -calc.housingFundAmount,
    },
    {
      itemType: 'deduction_tax', itemName: '个人所得税', amount: -calc.taxAmount,
    },
    {
      itemType: 'deduction_absence', itemName: '考勤扣款', amount: -calc.absenceAmount,
    },
  ];
}

/**
 * 批量算薪（按 period + 可选部门）
 * @throws AppError(400, 73404) period 非法
 * @throws AppError(400) 无在职员工
 */
export async function calculatePayroll(
  actorId: string,
  input: CalculatePayrollInput,
): Promise<PayrollCalculationResult[]> {
  parsePeriod(input.period);
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
  const settled = await Promise.allSettled(
    employees.map((emp) => calculateSinglePayroll(actorId, {
      employeeId: emp.id,
      period: input.period,
    })),
  );
  return settled
    .filter((s): s is PromiseFulfilledResult<PayrollCalculationResult> => s.status === 'fulfilled')
    .map((s) => s.value);
}
