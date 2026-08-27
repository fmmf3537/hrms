// M4-C3: 工资薪金个税（累计预扣简化版）| HRMS
// 仅 import audit/config + prisma；0 新表；计算结果不持久化（快照留 C5 payslips）

import type { Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'tax_calculation';

export interface TaxBracket {
  minIncome: number;
  maxIncome: number | null;
  rate: number;
  quickDeduction: number;
}

export interface CalculateMonthlyTaxInput {
  employeeId: string;
  period: string;
  baseAmount: number;
  cumulativePrepaid?: number;
}

export interface TaxCalculationResult {
  employeeId: string;
  period: string;
  baseAmount: number;
  taxableIncome: number;
  bracket: { rate: number; quickDeduction: number };
  taxAmount: number;
  cumulativePrepaid: number;
  taxType: 'monthly';
}

export interface CalculateBatchTaxInput {
  period: string;
  deptIds?: string[];
}

export interface BatchTaxResult {
  succeeded: TaxCalculationResult[];
  failed: Array<{ employeeId: string; error: string }>;
}

export interface CalculateCumulativeTaxInput {
  employeeId: string;
  year: number;
  month: number;
  currentIncome: number;
  cumulativePrepaid: number;
}

export interface CumulativeTaxResult {
  employeeId: string;
  year: number;
  month: number;
  cumulativeIncome: number;
  cumulativeTaxableIncome: number;
  cumulativeTax: number;
  currentTax: number;
  bracket: { rate: number; quickDeduction: number };
  taxType: 'cumulative';
}

export interface TaxHistoryItem {
  action: string;
  createdAt: Date;
  details: Record<string, unknown>;
}

export interface TaxAnnualSummary {
  employeeId: string;
  year: number;
  monthlyTaxTotal: number;
  yearEndBonusTaxTotal: number;
  laborIncomeTaxTotal: number;
  taxTotal: number;
  items: TaxHistoryItem[];
}

interface ActorScope {
  unrestricted: boolean;
  deptId?: string;
  selfEmployeeId?: string;
}

const FALLBACK_METHOD = 'cumulative_withholding';
const FALLBACK_DEDUCTION = 5000;
const FALLBACK_BATCH = 200;
const FALLBACK_SETTLEMENT = ['03-01', '06-30'];
const FALLBACK_MONTHLY_BRACKETS: TaxBracket[] = [
  {
    minIncome: 0, maxIncome: 36000, rate: 0.03, quickDeduction: 0,
  },
  {
    minIncome: 36000, maxIncome: 144000, rate: 0.10, quickDeduction: 2520,
  },
  {
    minIncome: 144000, maxIncome: 300000, rate: 0.20, quickDeduction: 16920,
  },
  {
    minIncome: 300000, maxIncome: 420000, rate: 0.25, quickDeduction: 31920,
  },
  {
    minIncome: 420000, maxIncome: 660000, rate: 0.30, quickDeduction: 52920,
  },
  {
    minIncome: 660000, maxIncome: 960000, rate: 0.35, quickDeduction: 85920,
  },
  {
    minIncome: 960000, maxIncome: null, rate: 0.45, quickDeduction: 181920,
  },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parsePeriod(period: string): { year: number; month: number } {
  const matched = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!matched) {
    throw new AppError('period 格式错误，应为 YYYY-MM', 400, 73201);
  }
  return { year: Number(matched[1]), month: Number(matched[2]) };
}

function parseBrackets(raw: unknown, expectedLen: number): TaxBracket[] {
  if (!Array.isArray(raw) || raw.length !== expectedLen) {
    throw new AppError('税率表配置错误', 400, 73203);
  }
  return raw.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new AppError('税率表配置错误', 400, 73203);
    }
    const row = item as Record<string, unknown>;
    const {
      minIncome, maxIncome, rate, quickDeduction,
    } = row;
    if (typeof minIncome !== 'number' || typeof rate !== 'number'
      || typeof quickDeduction !== 'number') {
      throw new AppError('税率表配置错误', 400, 73203);
    }
    if (maxIncome !== null && typeof maxIncome !== 'number') {
      throw new AppError('税率表配置错误', 400, 73203);
    }
    return {
      minIncome, maxIncome, rate, quickDeduction,
    };
  });
}

function findBracket(brackets: TaxBracket[], value: number): TaxBracket {
  const sorted = [...brackets].sort((a, b) => a.minIncome - b.minIncome);
  const hit = sorted.find((b) => (
    value >= b.minIncome && (b.maxIncome == null || value <= b.maxIncome)
  ));
  if (!hit) {
    throw new AppError('个税计算失败：税率表缺档', 400, 73210);
  }
  return hit;
}

async function getNumberConfig(key: string, fallback: number): Promise<number> {
  try {
    const v = await configService.getValue('salary', key);
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    // TODO: configs.salary.* 未配置时 fallback
    return fallback;
  }
}

async function getMonthlyBrackets(): Promise<TaxBracket[]> {
  try {
    const v = await configService.getValue('salary', 'tax.monthly_brackets');
    return parseBrackets(v, 7);
  } catch (err) {
    if (err instanceof AppError && err.code === 73203) throw err;
    // TODO: configs.salary.tax.monthly_brackets 未配置时 fallback
    return FALLBACK_MONTHLY_BRACKETS;
  }
}

async function getBatchSize(): Promise<number> {
  return getNumberConfig('tax.batch_size', FALLBACK_BATCH);
}

async function getBasicDeduction(): Promise<number> {
  return getNumberConfig('tax.basic_deduction', FALLBACK_DEDUCTION);
}

async function getSettlementPeriod(): Promise<string[]> {
  try {
    const v = await configService.getValue('salary', 'tax.annual_settlement_period');
    if (Array.isArray(v) && v.every((x): x is string => typeof x === 'string')) {
      return v;
    }
    return FALLBACK_SETTLEMENT;
  } catch {
    // TODO: configs.salary.tax.annual_settlement_period 未配置时 fallback
    return FALLBACK_SETTLEMENT;
  }
}

async function getCumulativeMethod(): Promise<string> {
  try {
    const v = await configService.getValue('salary', 'tax.cumulative_method');
    return typeof v === 'string' ? v : FALLBACK_METHOD;
  } catch {
    // TODO: configs.salary.tax.cumulative_method 未配置时 fallback
    return FALLBACK_METHOD;
  }
}

async function assertEmployee(employeeId: string): Promise<{
  id: string;
  departmentId: string | null;
}> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    select: { id: true, departmentId: true },
  });
  if (!employee) {
    throw new AppError('员工不存在', 400);
  }
  return employee;
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

async function assertTaxReadAccess(actorId: string, employeeId: string): Promise<void> {
  const scope = await resolveActorScope(actorId);
  if (scope.unrestricted) return;
  if (scope.selfEmployeeId && employeeId !== scope.selfEmployeeId) {
    throw new AppError('无权查看他人个税历史', 403);
  }
  if (scope.deptId) {
    const emp = await prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { departmentId: true },
    });
    if (emp?.departmentId !== scope.deptId) {
      throw new AppError('无权查看其他部门个税历史', 403);
    }
  }
}

function isInSettlementWindow(at: Date, range: string[]): boolean {
  const start = range[0] ?? '03-01';
  const end = range[1] ?? '06-30';
  const mm = String(at.getMonth() + 1).padStart(2, '0');
  const dd = String(at.getDate()).padStart(2, '0');
  const key = `${mm}-${dd}`;
  return key >= start && key <= end;
}

function asDetails(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * 单员工单月个税计算（V1.2 §二.4.4 累计预扣法 - 简化版）
 * @param actorId 操作人 ID（hr/admin/executive）
 * @param input { employeeId, period: 'YYYY-MM', baseAmount, cumulativePrepaid? }
 * @returns { employeeId, period, baseAmount, taxableIncome, bracket, taxAmount, taxType: 'monthly' }
 * @throws AppError(400) employeeId 不存在
 * @throws AppError(400, 73201) period 格式错
 * @throws AppError(400, 73202) baseAmount ≤0
 * @throws AppError(400, 73204) cumulativePrepaid < 0
 * @throws AppError(400, 73203) 税率表配置错误
 * 校验链：
 *  1. 校验 employee 存在 → 不存在抛 400
 *  2. 校验 period 格式（YYYY-MM，月 ∈ 1-12）→ 否则抛 73201
 *  3. 校验 baseAmount > 0 → 否则抛 73202
 *  4. 校验 cumulativePrepaid ≥ 0（默认 0）→ 否则抛 73204
 *  5. 查 monthly_brackets（configs.salary.tax.monthly_brackets，fallback 7 级表）
 *  6. 校验 brackets 长度 = 7 → 否则抛 73203
 *  7. 应纳税所得额 = max(0, baseAmount - basic_deduction)
 *  8. findBracket(brackets, taxableIncome)
 *  9. 本月个税 = max(0, taxableIncome × rate - quickDeduction)
 *  10. 实际预扣 = max(0, 本月个税 - cumulativePrepaid)
 *  11. 写 audit（TAX_CALCULATE，actorType='USER'）
 *  注：C3 简化版不含完整累计预扣（cumulativeWithholding 留 C4），仅单月计算 + audit 历史
 */
export async function calculateMonthlyTax(
  actorId: string,
  input: CalculateMonthlyTaxInput,
): Promise<TaxCalculationResult> {
  await assertEmployee(input.employeeId);
  parsePeriod(input.period);
  if (!(input.baseAmount > 0)) {
    throw new AppError('税基必须大于 0', 400, 73202);
  }
  const prepaid = input.cumulativePrepaid ?? 0;
  if (prepaid < 0) {
    throw new AppError('累计已预扣税额不能为负', 400, 73204);
  }

  await getCumulativeMethod();
  const basicDeduction = await getBasicDeduction();
  const brackets = await getMonthlyBrackets();
  const taxableIncome = round2(Math.max(0, input.baseAmount - basicDeduction));
  const bracket = findBracket(brackets, taxableIncome);
  const rawTax = round2(Math.max(0, taxableIncome * bracket.rate - bracket.quickDeduction));
  const taxAmount = round2(Math.max(0, rawTax - prepaid));

  await prisma.employeeInsuranceRegistration.findFirst({
    where: { employeeId: input.employeeId, status: 'active' },
    select: { id: true, city: true },
  });

  const result: TaxCalculationResult = {
    employeeId: input.employeeId,
    period: input.period,
    baseAmount: input.baseAmount,
    taxableIncome,
    bracket: { rate: bracket.rate, quickDeduction: bracket.quickDeduction },
    taxAmount,
    cumulativePrepaid: prepaid,
    taxType: 'monthly',
  };

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'TAX_CALCULATE',
    resourceType: RESOURCE_TYPE,
    resourceId: input.employeeId,
    description: `月度个税计算 ${input.period}`,
    newValue: result,
  });

  return result;
}

/**
 * 批量月度个税计算（按月 + 部门）
 * @param actorId 操作人 ID
 * @param input { period, deptIds?: string[] } - deptIds 不传则全公司
 * @returns { succeeded, failed }
 * @throws AppError(400, 73201) period 格式错
 * @throws AppError(400, 73207) 部门下无员工
 * @throws AppError(400, 73208) 超过 batch_size
 * 校验链：
 *  1. 校验 period 格式 → 否则抛 73201
 *  2. 查 employees where deptId IN deptIds AND status='active' → 0 条抛 73207
 *  3. 校验 employees.length ≤ configs.salary.tax.batch_size（默认 200）→ 否则抛 73208
 *  4. 每条 employee 调 calculateMonthlyTax；失败单条不影响其他条
 *  5. 每个 employee 单独审计（不在批量外层写 audit）
 */
export async function calculateBatchTax(
  actorId: string,
  input: CalculateBatchTaxInput,
): Promise<BatchTaxResult> {
  parsePeriod(input.period);
  const where: Prisma.EmployeeWhereInput = {
    deletedAt: null,
    status: 'active',
  };
  if (input.deptIds && input.deptIds.length > 0) {
    where.departmentId = { in: input.deptIds };
  }

  const employees = await prisma.employee.findMany({
    where,
    select: { id: true },
  });
  if (employees.length === 0) {
    throw new AppError('部门下无在职员工', 400, 73207);
  }
  const batchSize = await getBatchSize();
  if (employees.length > batchSize) {
    throw new AppError('批量计算超过上限，请分批', 400, 73208);
  }

  const settled = await Promise.allSettled(
    employees.map(async (emp) => {
      const plan = await prisma.employeeSalaryPlan.findFirst({
        where: { employeeId: emp.id, status: 'active' },
        select: { baseSalary: true },
      });
      if (!plan) {
        throw new AppError('无生效薪酬方案', 400, 73202);
      }
      return calculateMonthlyTax(actorId, {
        employeeId: emp.id,
        period: input.period,
        baseAmount: Number(plan.baseSalary),
      });
    }),
  );

  const succeeded: TaxCalculationResult[] = [];
  const failed: Array<{ employeeId: string; error: string }> = [];
  settled.forEach((item, idx) => {
    const employeeId = employees[idx].id;
    if (item.status === 'fulfilled') {
      succeeded.push(item.value);
    } else {
      const err = item.reason as { message?: string };
      failed.push({ employeeId, error: err?.message ?? '计算失败' });
    }
  });

  return { succeeded, failed };
}

/**
 * 累计预扣（按 employeeId + year + month + 累计已预扣）
 * @param actorId 操作人 ID
 * @param input { employeeId, year, month, currentIncome, cumulativePrepaid }
 * @returns cumulative + current
 * @throws AppError(400) employeeId 不存在
 * @throws AppError(400, 73204) 累计数据不完整 / prepaid < 0
 * 校验链：
 *  1. 校验 employee 存在
 *  2. 校验 year ∈ [current year - 1, current year]
 *  3. 校验 month ∈ [1, 12]
 *  4. 查 audit_logs 找当年 TAX_CALCULATE 记录 → 若不完整抛 73204
 *  5. 累计应纳税所得额 = 累计 baseAmount - basic_deduction × 月数
 *  6. 累计应预扣 = 累计应纳税所得额 × rate - quickDeduction
 *  7. 本月预扣 = 累计应预扣 - 累计已预扣
 *  注：V1.2 §二.4.4 累计预扣公式；专项附加扣除留 C4
 */
export async function calculateCumulativeTax(
  actorId: string,
  input: CalculateCumulativeTaxInput,
): Promise<CumulativeTaxResult> {
  await assertEmployee(input.employeeId);
  const nowYear = new Date().getFullYear();
  if (input.year < nowYear - 1 || input.year > nowYear) {
    throw new AppError('累计预扣年份超出允许范围', 400, 73204);
  }
  if (input.month < 1 || input.month > 12) {
    throw new AppError('month 必须在 1-12', 400, 73201);
  }
  if (!(input.currentIncome > 0)) {
    throw new AppError('税基必须大于 0', 400, 73202);
  }
  if (input.cumulativePrepaid < 0) {
    throw new AppError('累计已预扣税额不能为负', 400, 73204);
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      resourceType: RESOURCE_TYPE,
      resourceId: input.employeeId,
      action: 'TAX_CALCULATE',
    },
  });

  const priorByMonth = new Map<number, number>();
  logs.forEach((log) => {
    const details = asDetails(log.newValue);
    if (details.taxType && details.taxType !== 'monthly') return;
    if (typeof details.period !== 'string' || typeof details.baseAmount !== 'number') return;
    if (!details.period.startsWith(`${input.year}-`)) return;
    const month = Number(details.period.slice(5, 7));
    if (month >= 1 && month < input.month && !priorByMonth.has(month)) {
      priorByMonth.set(month, details.baseAmount);
    }
  });

  if (input.month > 1 && priorByMonth.size < input.month - 1) {
    throw new AppError('累计预扣缺少前期数据', 400, 73204);
  }

  let priorIncome = 0;
  priorByMonth.forEach((amt) => {
    priorIncome += amt;
  });
  const cumulativeIncome = round2(priorIncome + input.currentIncome);
  const basicDeduction = await getBasicDeduction();
  const cumulativeTaxableIncome = round2(
    Math.max(0, cumulativeIncome - basicDeduction * input.month),
  );
  const brackets = await getMonthlyBrackets();
  const bracket = findBracket(brackets, cumulativeTaxableIncome);
  const cumulativeTax = round2(Math.max(
    0,
    cumulativeTaxableIncome * bracket.rate - bracket.quickDeduction,
  ));
  const currentTax = round2(Math.max(0, cumulativeTax - input.cumulativePrepaid));

  const result: CumulativeTaxResult = {
    employeeId: input.employeeId,
    year: input.year,
    month: input.month,
    cumulativeIncome,
    cumulativeTaxableIncome,
    cumulativeTax,
    currentTax,
    bracket: { rate: bracket.rate, quickDeduction: bracket.quickDeduction },
    taxType: 'cumulative',
  };

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'TAX_CALCULATE',
    resourceType: RESOURCE_TYPE,
    resourceId: input.employeeId,
    description: `累计预扣 ${input.year}-${String(input.month).padStart(2, '0')}`,
    newValue: result,
  });

  return result;
}

/**
 * 按 employeeId 查个税历史（复用 audit_logs，0 新表）
 * @param actorId 操作人 ID
 * @param employeeId 员工 ID
 * @param year 自然年
 * @throws AppError(400) employeeId 不存在
 */
export async function getTaxHistory(
  actorId: string,
  employeeId: string,
  year: number,
): Promise<TaxHistoryItem[]> {
  await assertEmployee(employeeId);
  await assertTaxReadAccess(actorId, employeeId);

  const logs = await prisma.auditLog.findMany({
    where: {
      resourceType: RESOURCE_TYPE,
      resourceId: employeeId,
      action: {
        in: ['TAX_CALCULATE', 'TAX_YEAR_END_BONUS_CALCULATE', 'TAX_LABOR_INCOME_CALCULATE'],
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const items = logs
    .map((log) => {
      const details = asDetails(log.newValue);
      return {
        action: log.action,
        createdAt: log.createdAt,
        details,
      };
    })
    .filter((item) => {
      const { details } = item;
      if (typeof details.period === 'string') return details.period.startsWith(`${year}-`);
      if (details.year === year) return true;
      return item.createdAt.getFullYear() === year;
    });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'TAX_HISTORY_READ',
    resourceType: RESOURCE_TYPE,
    resourceId: employeeId,
    description: `查询 ${year} 年个税历史`,
    newValue: { employeeId, year, count: items.length },
  });

  return items;
}

/**
 * 年度个税汇总（12 个月 + 年终奖 + 劳务费）；settle=true 时校验汇算清缴窗口
 * @param actorId 操作人 ID
 * @param employeeId 员工 ID
 * @param year 自然年
 * @param opts.settle 是否走年度汇算窗口校验（实际申报留 C5）
 * @throws AppError(400, 73209) 不在 3-6 月汇算期
 */
export async function getTaxAnnualSummary(
  actorId: string,
  employeeId: string,
  year: number,
  opts?: { settle?: boolean },
): Promise<TaxAnnualSummary> {
  if (opts?.settle) {
    const range = await getSettlementPeriod();
    if (!isInSettlementWindow(new Date(), range)) {
      throw new AppError('年度汇算清缴不在 3-6 月窗口', 400, 73209);
    }
  }

  const items = await getTaxHistory(actorId, employeeId, year);
  let monthlyTaxTotal = 0;
  let yearEndBonusTaxTotal = 0;
  let laborIncomeTaxTotal = 0;
  items.forEach((item) => {
    let tax = 0;
    if (typeof item.details.taxAmount === 'number') {
      tax = item.details.taxAmount;
    } else if (typeof item.details.currentTax === 'number') {
      tax = item.details.currentTax;
    }
    if (item.action === 'TAX_YEAR_END_BONUS_CALCULATE') {
      yearEndBonusTaxTotal += tax;
    } else if (item.action === 'TAX_LABOR_INCOME_CALCULATE') {
      laborIncomeTaxTotal += tax;
    } else {
      monthlyTaxTotal += tax;
    }
  });

  return {
    employeeId,
    year,
    monthlyTaxTotal: round2(monthlyTaxTotal),
    yearEndBonusTaxTotal: round2(yearEndBonusTaxTotal),
    laborIncomeTaxTotal: round2(laborIncomeTaxTotal),
    taxTotal: round2(monthlyTaxTotal + yearEndBonusTaxTotal + laborIncomeTaxTotal),
    items,
  };
}
