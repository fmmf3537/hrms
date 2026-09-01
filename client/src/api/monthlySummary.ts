/**
 * 月度考勤汇总 API（M5-2-B）
 * @module api/monthlySummary
 * @description 消费 4 端点；list 必传 year+month，返回 data 为单条或数组（无 total 分页）
 * @noDetail 没有 GET /:id
 */

import http from './http';
import type {
  GenerateSummaryRequest,
  ListMonthlySummaryFilter,
  MonthlySummary,
} from './types/attendance';
import { unwrapData } from './types/organization';

export const MONTHLY_SUMMARY_PATHS = {
  generate: '/monthly-summaries/generate',
  list: '/monthly-summaries',
  confirm: (id: string) => `/monthly-summaries/${id}/confirm`,
  lock: (id: string) => `/monthly-summaries/${id}/lock`,
} as const;

export async function generateMonthlySummary(
  data: GenerateSummaryRequest,
): Promise<MonthlySummary | MonthlySummary[]> {
  return unwrapData<MonthlySummary | MonthlySummary[]>(
    await http.post(MONTHLY_SUMMARY_PATHS.generate, data),
  );
}

export async function listMonthlySummaries(
  filter: ListMonthlySummaryFilter,
): Promise<MonthlySummary[]> {
  const raw = unwrapData<MonthlySummary | MonthlySummary[]>(
    await http.get(MONTHLY_SUMMARY_PATHS.list, { params: filter }),
  );
  return Array.isArray(raw) ? raw : [raw];
}

export async function confirmMonthlySummary(id: string): Promise<MonthlySummary> {
  return unwrapData<MonthlySummary>(await http.post(MONTHLY_SUMMARY_PATHS.confirm(id)));
}

export async function lockMonthlySummary(id: string): Promise<MonthlySummary> {
  return unwrapData<MonthlySummary>(await http.post(MONTHLY_SUMMARY_PATHS.lock(id)));
}
