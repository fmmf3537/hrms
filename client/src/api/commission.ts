/**
 * 销售提成汇总 / 结算单 API（M5-2-C3 / C6）
 * @module api/commission
 * @permission salary:commission:read / settle / confirm / cancel（5 角色无 finance）
 */

import http from './http';
import type { PaginatedResponse } from './types';
import { unwrapData } from './types/organization';
import { unwrapSalaryPage } from './types/salary';
import type {
  CommissionDepartmentSummary,
  CommissionEmployeeSummary,
  CommissionQuery,
  CommissionSummaryResult,
  CreateSettlementRequest,
  Settlement,
  SettlementListQuery,
} from './types/compensation';

export const COMMISSION_PATHS = {
  summary: '/salary/commissions/summary',
  employee: (id: string) => `/salary/commissions/employees/${id}`,
  department: (id: string) => `/salary/commissions/departments/${id}`,
  settlements: '/salary/commissions/settlements',
  settlement: (id: string) => `/salary/commissions/settlements/${id}`,
  confirm: (id: string) => `/salary/commissions/settlements/${id}/confirm`,
  cancel: (id: string) => `/salary/commissions/settlements/${id}/cancel`,
} as const;

/** GET /api/salary/commissions/summary · salary:commission:read */
export async function getCommissionSummary(
  query?: CommissionQuery,
): Promise<CommissionSummaryResult> {
  const raw = await http.get(COMMISSION_PATHS.summary, { params: query });
  return unwrapData<CommissionSummaryResult>(raw);
}

/** GET /api/salary/commissions/employees/:employeeId · salary:commission:read */
export async function getEmployeeCommission(
  employeeId: string,
  query?: Omit<CommissionQuery, 'groupBy'>,
): Promise<CommissionEmployeeSummary> {
  const raw = await http.get(COMMISSION_PATHS.employee(employeeId), { params: query });
  return unwrapData<CommissionEmployeeSummary>(raw);
}

/** GET /api/salary/commissions/departments/:departmentId · salary:commission:read */
export async function getDepartmentCommission(
  departmentId: string,
  query?: Omit<CommissionQuery, 'groupBy'>,
): Promise<CommissionDepartmentSummary> {
  const raw = await http.get(COMMISSION_PATHS.department(departmentId), { params: query });
  return unwrapData<CommissionDepartmentSummary>(raw);
}

/** POST /api/salary/commissions/settlements · salary:commission:settle */
export async function createSettlement(body: CreateSettlementRequest): Promise<Settlement> {
  const raw = await http.post(COMMISSION_PATHS.settlements, body);
  return unwrapData<Settlement>(raw);
}

/** GET /api/salary/commissions/settlements · salary:commission:read */
export async function listSettlements(
  query?: SettlementListQuery,
): Promise<PaginatedResponse<Settlement>> {
  const raw = await http.get(COMMISSION_PATHS.settlements, { params: query });
  return unwrapSalaryPage<Settlement>(raw);
}

/** GET /api/salary/commissions/settlements/:id · salary:commission:read */
export async function getSettlement(id: string): Promise<Settlement> {
  const raw = await http.get(COMMISSION_PATHS.settlement(id));
  return unwrapData<Settlement>(raw);
}

/** POST /api/salary/commissions/settlements/:id/confirm · salary:commission:confirm */
export async function confirmSettlement(
  id: string,
  body?: { remark?: string },
): Promise<Settlement> {
  const raw = await http.post(COMMISSION_PATHS.confirm(id), body ?? {});
  return unwrapData<Settlement>(raw);
}

/** POST /api/salary/commissions/settlements/:id/cancel · salary:commission:cancel */
export async function cancelSettlement(
  id: string,
  body: { reason: string },
): Promise<Settlement> {
  const raw = await http.post(COMMISSION_PATHS.cancel(id), body);
  return unwrapData<Settlement>(raw);
}
