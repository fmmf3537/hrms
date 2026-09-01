/**
 * 个税工具 API（M5-2-C1）
 * @module api/tax
 * @description 消费 /api/salary/tax 4 计算 + 2 查询；年终奖 isAnnual 字面量 true
 * @permission salary:tax:calculate / salary:tax:read（5 角色无 finance）
 */

import http from './http';
import { unwrapData } from './types/organization';
import type {
  TaxAnnualQuery,
  TaxAnnualSummary,
  TaxBatchRequest,
  TaxBatchResult,
  TaxCalculateRequest,
  TaxHistoryItem,
  TaxHistoryQuery,
  TaxLaborIncomeRequest,
  TaxLaborIncomeResult,
  TaxMonthlyResult,
  TaxYearEndBonusRequest,
  TaxYearEndBonusResult,
} from './types/salary';

export const TAX_PATHS = {
  calculate: '/salary/tax/calculate',
  calculateBatch: '/salary/tax/calculate-batch',
  yearEndBonus: '/salary/tax/year-end-bonus',
  laborIncome: '/salary/tax/labor-income',
  history: '/salary/tax/history',
  annualSummary: '/salary/tax/annual-summary',
} as const;

/** POST /salary/tax/calculate · salary:tax:calculate */
export async function calculateMonthlyTax(
  data: TaxCalculateRequest,
): Promise<TaxMonthlyResult> {
  return unwrapData<TaxMonthlyResult>(await http.post(TAX_PATHS.calculate, data));
}

/** POST /salary/tax/calculate-batch · salary:tax:calculate */
export async function calculateBatchTax(data: TaxBatchRequest): Promise<TaxBatchResult> {
  return unwrapData<TaxBatchResult>(await http.post(TAX_PATHS.calculateBatch, data));
}

/** POST /salary/tax/year-end-bonus · salary:tax:calculate */
export async function calculateYearEndBonus(
  data: TaxYearEndBonusRequest,
): Promise<TaxYearEndBonusResult> {
  return unwrapData<TaxYearEndBonusResult>(await http.post(TAX_PATHS.yearEndBonus, data));
}

/** POST /salary/tax/labor-income · salary:tax:calculate */
export async function calculateLaborIncomeTax(
  data: TaxLaborIncomeRequest,
): Promise<TaxLaborIncomeResult> {
  return unwrapData<TaxLaborIncomeResult>(await http.post(TAX_PATHS.laborIncome, data));
}

/** GET /salary/tax/history · salary:tax:read */
export async function getTaxHistory(query: TaxHistoryQuery): Promise<TaxHistoryItem[]> {
  return unwrapData<TaxHistoryItem[]>(
    await http.get(TAX_PATHS.history, { params: query }),
  );
}

/** GET /salary/tax/annual-summary · salary:tax:read */
export async function getTaxAnnualSummary(query: TaxAnnualQuery): Promise<TaxAnnualSummary> {
  const params: TaxAnnualQuery = {
    employeeId: query.employeeId,
    year: query.year,
  };
  if (query.settle) {
    params.settle = true;
  }
  return unwrapData<TaxAnnualSummary>(
    await http.get(TAX_PATHS.annualSummary, { params }),
  );
}
