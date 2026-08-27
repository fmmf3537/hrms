// M4-C3: 年终奖单独计税（按月换算）| HRMS
// 仅 import audit/config + prisma；0 新表；不并入综合所得

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

export interface CalculateYearEndBonusInput {
  employeeId: string;
  bonusAmount: number;
  isAnnual: boolean;
}

export interface YearEndBonusResult {
  employeeId: string;
  bonusAmount: number;
  monthlyEquivalent: number;
  bracket: { rate: number; quickDeduction: number };
  taxAmount: number;
  taxType: 'year_end_bonus';
  year: number;
}

const FALLBACK_BRACKETS: TaxBracket[] = [
  {
    minIncome: 0, maxIncome: 3000, rate: 0.03, quickDeduction: 0,
  },
  {
    minIncome: 3000, maxIncome: 12000, rate: 0.10, quickDeduction: 210,
  },
  {
    minIncome: 12000, maxIncome: 25000, rate: 0.20, quickDeduction: 1410,
  },
  {
    minIncome: 25000, maxIncome: 35000, rate: 0.25, quickDeduction: 2660,
  },
  {
    minIncome: 35000, maxIncome: 55000, rate: 0.30, quickDeduction: 4410,
  },
  {
    minIncome: 55000, maxIncome: 80000, rate: 0.35, quickDeduction: 7160,
  },
  {
    minIncome: 80000, maxIncome: null, rate: 0.45, quickDeduction: 15160,
  },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseBrackets(raw: unknown): TaxBracket[] {
  if (!Array.isArray(raw) || raw.length !== 7) {
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

async function getBrackets(): Promise<TaxBracket[]> {
  try {
    const v = await configService.getValue('salary', 'tax.year_end_bonus_brackets');
    return parseBrackets(v);
  } catch (err) {
    if (err instanceof AppError && err.code === 73203) throw err;
    // TODO: configs.salary.tax.year_end_bonus_brackets 未配置时 fallback
    return FALLBACK_BRACKETS;
  }
}

async function getBonusMax(): Promise<number> {
  try {
    const v = await configService.getValue('salary', 'tax.year_end_bonus.max');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
  } catch {
    // TODO: 未配置年终奖上限时默认无上限（限额校验留 C4）
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * 年终奖单独计算（V1.2 §二.4.4 按月换算）
 * @param actorId 操作人 ID
 * @param input { employeeId, bonusAmount, isAnnual: true } - isAnnual 必须为 true（C3 仅年终奖）
 * @returns { employeeId, bonusAmount, monthlyEquivalent, bracket, taxAmount, taxType: 'year_end_bonus' }
 * @throws AppError(400) employeeId 不存在 / isAnnual !== true
 * @throws AppError(400, 73202) bonusAmount ≤0
 * @throws AppError(400, 73205) bonusAmount > 限额
 * 校验链：
 *  1. 校验 employee 存在
 *  2. 校验 isAnnual === true（非年终奖留 C4）
 *  3. 校验 bonusAmount > 0 → 否则抛 73202
 *  4. 校验 bonusAmount ≤ year_end_bonus.max（默认无上限）→ 否则抛 73205
 *  5. 月等价 = bonusAmount / 12，按年终奖税率表找档
 *  6. 年终奖个税 = max(0, bonusAmount × rate - quickDeduction)
 *  7. 写 audit（TAX_YEAR_END_BONUS_CALCULATE）
 *  注：居民个人取得全年一次性奖金，可以选择不并入当年综合所得
 */
export async function calculateYearEndBonus(
  actorId: string,
  input: CalculateYearEndBonusInput,
): Promise<YearEndBonusResult> {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, deletedAt: null },
    select: { id: true },
  });
  if (!employee) {
    throw new AppError('员工不存在', 400);
  }
  if (input.isAnnual !== true) {
    throw new AppError('C3 仅支持年终奖单独计税', 400);
  }
  if (!(input.bonusAmount > 0)) {
    throw new AppError('税基必须大于 0', 400, 73202);
  }
  const maxBonus = await getBonusMax();
  if (input.bonusAmount > maxBonus) {
    throw new AppError('年终奖超过限额', 400, 73205);
  }

  const brackets = await getBrackets();
  const monthlyEquivalent = round2(input.bonusAmount / 12);
  const bracket = findBracket(brackets, monthlyEquivalent);
  const taxAmount = round2(Math.max(
    0,
    input.bonusAmount * bracket.rate - bracket.quickDeduction,
  ));
  const year = new Date().getFullYear();

  const result: YearEndBonusResult = {
    employeeId: input.employeeId,
    bonusAmount: input.bonusAmount,
    monthlyEquivalent,
    bracket: { rate: bracket.rate, quickDeduction: bracket.quickDeduction },
    taxAmount,
    taxType: 'year_end_bonus',
    year,
  };

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'TAX_YEAR_END_BONUS_CALCULATE',
    resourceType: RESOURCE_TYPE,
    resourceId: input.employeeId,
    description: '年终奖单独计税',
    newValue: result,
  });

  return result;
}
