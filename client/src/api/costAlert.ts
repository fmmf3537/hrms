/**
 * 人力成本预警 API（M5-2-C3 / C7）
 * @module api/costAlert
 * @permission salary:cost-alert:read / scan / ack / close（5 角色无 finance）
 */

import http from './http';
import type { PaginatedResponse } from './types';
import { unwrapData } from './types/organization';
import { unwrapSalaryPage } from './types/salary';
import type {
  CostAlert,
  CostAlertListQuery,
  CostAlertSummary,
  ScanCostAlertsRequest,
  ScanCostAlertsResult,
} from './types/compensation';

export const COST_ALERT_PATHS = {
  scan: '/salary/cost-alerts/scan',
  summary: '/salary/cost-alerts/summary',
  list: '/salary/cost-alerts',
  detail: (id: string) => `/salary/cost-alerts/${id}`,
  acknowledge: (id: string) => `/salary/cost-alerts/${id}/acknowledge`,
  close: (id: string) => `/salary/cost-alerts/${id}/close`,
} as const;

/** POST /api/salary/cost-alerts/scan · salary:cost-alert:scan */
export async function scanCostAlerts(body: ScanCostAlertsRequest): Promise<ScanCostAlertsResult> {
  const raw = await http.post(COST_ALERT_PATHS.scan, body);
  return unwrapData<ScanCostAlertsResult>(raw);
}

/** GET /api/salary/cost-alerts/summary · salary:cost-alert:read */
export async function getCostAlertSummary(period: string): Promise<CostAlertSummary> {
  const raw = await http.get(COST_ALERT_PATHS.summary, { params: { period } });
  return unwrapData<CostAlertSummary>(raw);
}

/** GET /api/salary/cost-alerts · salary:cost-alert:read */
export async function listCostAlerts(
  query?: CostAlertListQuery,
): Promise<PaginatedResponse<CostAlert>> {
  const raw = await http.get(COST_ALERT_PATHS.list, { params: query });
  return unwrapSalaryPage<CostAlert>(raw);
}

/** GET /api/salary/cost-alerts/:id · salary:cost-alert:read */
export async function getCostAlert(id: string): Promise<CostAlert> {
  const raw = await http.get(COST_ALERT_PATHS.detail(id));
  return unwrapData<CostAlert>(raw);
}

/** POST /api/salary/cost-alerts/:id/acknowledge · salary:cost-alert:ack */
export async function acknowledgeCostAlert(
  id: string,
  body?: { note?: string },
): Promise<CostAlert> {
  const raw = await http.post(COST_ALERT_PATHS.acknowledge(id), body ?? {});
  return unwrapData<CostAlert>(raw);
}

/** POST /api/salary/cost-alerts/:id/close · salary:cost-alert:close */
export async function closeCostAlert(
  id: string,
  body: { reason: string; remark?: string },
): Promise<CostAlert> {
  const raw = await http.post(COST_ALERT_PATHS.close(id), body);
  return unwrapData<CostAlert>(raw);
}
