/**
 * 个税 API 单测（M5-2-C1）内联断言
 */
import { TAX_PATHS } from '@/api/tax';
import type { TaxYearEndBonusRequest } from '@/api/types/salary';

interface Case {
  name: string;
  fn: () => void;
}

const cases: Case[] = [];

function describe(_name: string, fn: () => void): void {
  fn();
}

function it(name: string, fn: () => void): void {
  cases.push({ name, fn });
}

function expectEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

describe('api/tax.ts', () => {
  it('4 计算路径', () => {
    expectEqual(TAX_PATHS.calculate, '/salary/tax/calculate', 'monthly');
    expectEqual(TAX_PATHS.calculateBatch, '/salary/tax/calculate-batch', 'batch');
    expectEqual(TAX_PATHS.yearEndBonus, '/salary/tax/year-end-bonus', 'bonus');
    expectEqual(TAX_PATHS.laborIncome, '/salary/tax/labor-income', 'labor');
  });

  it('history / annual-summary 为 GET query 形态', () => {
    expectEqual(TAX_PATHS.history, '/salary/tax/history', 'history');
    expectEqual(TAX_PATHS.annualSummary, '/salary/tax/annual-summary', 'annual');
  });

  it('year-end-bonus 请求体 isAnnual: true 字面量', () => {
    const body: TaxYearEndBonusRequest = {
      employeeId: 'e1',
      bonusAmount: 12000,
      isAnnual: true,
    };
    expectEqual(body.isAnnual, true, 'isAnnual');
  });
});

export function runTaxTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const taxTestCount = cases.length;
