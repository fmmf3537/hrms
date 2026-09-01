/**
 * 调薪申请 / 审批 / 执行 API（M5-2-C3 / C8）
 * @module api/adjustment
 * @permission salary:adjustment:read | read-self / write / approve / execute / cancel
 */

import http from './http';
import type { PaginatedResponse } from './types';
import { unwrapData } from './types/organization';
import { unwrapSalaryPage } from './types/salary';
import type {
  Adjustment,
  AdjustmentListQuery,
  ApproveAdjustmentRequest,
  BatchExecuteResult,
  CreateAdjustmentRequest,
} from './types/compensation';

export const ADJUSTMENT_PATHS = {
  executePending: '/salary/adjustments/execute-pending',
  list: '/salary/adjustments',
  create: '/salary/adjustments',
  detail: (id: string) => `/salary/adjustments/${id}`,
  submit: (id: string) => `/salary/adjustments/${id}/submit`,
  approve: (id: string) => `/salary/adjustments/${id}/approve`,
  execute: (id: string) => `/salary/adjustments/${id}/execute`,
  cancel: (id: string) => `/salary/adjustments/${id}/cancel`,
} as const;

/** POST /api/salary/adjustments/execute-pending · salary:adjustment:execute */
export async function executePendingAdjustments(asOfDate: string): Promise<BatchExecuteResult> {
  const raw = await http.post(ADJUSTMENT_PATHS.executePending, { asOfDate });
  return unwrapData<BatchExecuteResult>(raw);
}

/** POST /api/salary/adjustments · salary:adjustment:write · 201 */
export async function createAdjustment(body: CreateAdjustmentRequest): Promise<Adjustment> {
  const raw = await http.post(ADJUSTMENT_PATHS.create, body);
  return unwrapData<Adjustment>(raw);
}

/** GET /api/salary/adjustments · salary:adjustment:read | read-self */
export async function listAdjustments(
  query?: AdjustmentListQuery,
): Promise<PaginatedResponse<Adjustment>> {
  const raw = await http.get(ADJUSTMENT_PATHS.list, { params: query });
  return unwrapSalaryPage<Adjustment>(raw);
}

/** GET /api/salary/adjustments/:id · salary:adjustment:read | read-self */
export async function getAdjustment(id: string): Promise<Adjustment> {
  const raw = await http.get(ADJUSTMENT_PATHS.detail(id));
  return unwrapData<Adjustment>(raw);
}

/** POST /api/salary/adjustments/:id/submit · salary:adjustment:write */
export async function submitAdjustment(
  id: string,
  body?: { comment?: string },
): Promise<Adjustment> {
  const raw = await http.post(ADJUSTMENT_PATHS.submit(id), body ?? {});
  return unwrapData<Adjustment>(raw);
}

/** POST /api/salary/adjustments/:id/approve · salary:adjustment:approve（驳回 action=reject） */
export async function approveAdjustment(
  id: string,
  body: ApproveAdjustmentRequest,
): Promise<Adjustment> {
  const raw = await http.post(ADJUSTMENT_PATHS.approve(id), body);
  return unwrapData<Adjustment>(raw);
}

/** POST /api/salary/adjustments/:id/execute · salary:adjustment:execute */
export async function executeAdjustment(id: string): Promise<Adjustment> {
  const raw = await http.post(ADJUSTMENT_PATHS.execute(id));
  return unwrapData<Adjustment>(raw);
}

/** POST /api/salary/adjustments/:id/cancel · salary:adjustment:cancel */
export async function cancelAdjustment(
  id: string,
  body: { reason: string },
): Promise<Adjustment> {
  const raw = await http.post(ADJUSTMENT_PATHS.cancel(id), body);
  return unwrapData<Adjustment>(raw);
}
