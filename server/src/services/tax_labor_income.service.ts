// M4-C3: 劳务报酬个税（3 级超额累进）| HRMS
// 仅 import audit/config + prisma；0 新表；减除规则走 configs

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

export interface CalculateLaborIncomeTaxInput {
  employeeId: string;
  incomeAmount: number;
}

export interface LaborIncomeResult {
  employeeId: string;
  incomeAmount: number;
  deduction: number;
  taxableIncome: number;
  bracket: { rate: number; quickDeduction: number };
  taxAmount: number;
  taxType: 'labor_income';
  year: number;
}

const FALLBACK_BRACKETS: TaxBracket[] = [
  {
    minIncome: 0, maxIncome: 20000, rate: 0.20, quickDeduction: 0,
  },
  {
    minIncome: 20000, maxIncome: 50000, rate: 0.30, quickDeduction: 2000,
  },
  {
    minIncome: 50000, maxIncome: null, rate: 0.40, quickDeduction: 7000,
  },
];
const FALLBACK_THRESHOLD = 4000;
const FALLBACK_DED_LOW = 800;
const FALLBACK_DED_HIGH = 0.2;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseBrackets(raw: unknown): TaxBracket[] {
  if (!Array.isArray(raw) || raw.length !== 3) {
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
    // TODO: configs.salary.tax.labor_income.* 未配置时 fallback
    return fallback;
  }
}

async function getBrackets(): Promise<TaxBracket[]> {
  try {
    const v = await configService.getValue('salary', 'tax.labor_income_brackets');
    return parseBrackets(v);
  } catch (err) {
    if (err instanceof AppError && err.code === 73203) throw err;
    // TODO: configs.salary.tax.labor_income_brackets 未配置时 fallback
    return FALLBACK_BRACKETS;
  }
}

/**
 * 劳务报酬个税计算（V1.2 §二.4.5 3 级超额累进）
 * @param actorId 操作人 ID
 * @param input { employeeId, incomeAmount }
 * @returns { employeeId, incomeAmount, deduction, taxableIncome, bracket, taxAmount, taxType: 'labor_income' }
 * @throws AppError(400) employeeId 不存在
 * @throws AppError(400, 73206) incomeAmount ≤0
 * 校验链：
 *  1. 校验 employee 存在
 *  2. 校验 incomeAmount > 0 → 否则抛 73206
 *  3. 减除：≤ threshold_low 减 deduction_low；否则减 incomeAmount × deduction_high_rate
 *  4. 应纳税所得额 = max(0, incomeAmount - deduction)
 *  5. 查 labor_income_brackets，找档后 tax = max(0, taxable × rate - quickDeduction)
 *  6. 写 audit（TAX_LABOR_INCOME_CALCULATE）
 */
export async function calculateLaborIncomeTax(
  actorId: string,
  input: CalculateLaborIncomeTaxInput,
): Promise<LaborIncomeResult> {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, deletedAt: null },
    select: { id: true },
  });
  if (!employee) {
    throw new AppError('员工不存在', 400);
  }
  if (!(input.incomeAmount > 0)) {
    throw new AppError('劳务费必须大于 0', 400, 73206);
  }

  const threshold = await getNumberConfig('tax.labor_income.threshold_low', FALLBACK_THRESHOLD);
  const dedLow = await getNumberConfig('tax.labor_income.deduction_low', FALLBACK_DED_LOW);
  const dedHighRate = await getNumberConfig(
    'tax.labor_income.deduction_high_rate',
    FALLBACK_DED_HIGH,
  );
  const deduction = input.incomeAmount <= threshold
    ? dedLow
    : round2(input.incomeAmount * dedHighRate);
  const taxableIncome = round2(Math.max(0, input.incomeAmount - deduction));
  const brackets = await getBrackets();
  const bracket = findBracket(brackets, taxableIncome);
  const taxAmount = round2(Math.max(0, taxableIncome * bracket.rate - bracket.quickDeduction));
  const year = new Date().getFullYear();

  const result: LaborIncomeResult = {
    employeeId: input.employeeId,
    incomeAmount: input.incomeAmount,
    deduction,
    taxableIncome,
    bracket: { rate: bracket.rate, quickDeduction: bracket.quickDeduction },
    taxAmount,
    taxType: 'labor_income',
    year,
  };

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'TAX_LABOR_INCOME_CALCULATE',
    resourceType: RESOURCE_TYPE,
    resourceId: input.employeeId,
    description: '劳务报酬个税计算',
    newValue: result,
  });

  return result;
}
