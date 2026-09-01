/**
 * 加班管理 API（M5-2-B）
 * @module api/overtime
 * @description 消费 /api/overtime 3 端点；**没有 GET /:id**
 */

import http from './http';
import type { PaginatedResponse } from './types';
import type {
  CancelReasonBody,
  CreateOvertimeRequestBody,
  ListOvertimeFilter,
  OvertimeRequest,
} from './types/attendance';
import { unwrapData, unwrapPage } from './types/organization';

export const OVERTIME_PATHS = {
  requests: '/overtime/requests',
  cancel: (id: string) => `/overtime/requests/${id}/cancel`,
} as const;

export async function createOvertimeRequest(
  data: CreateOvertimeRequestBody,
): Promise<OvertimeRequest> {
  return unwrapData<OvertimeRequest>(await http.post(OVERTIME_PATHS.requests, data));
}

export async function listOvertimeRequests(
  filter: ListOvertimeFilter = {},
): Promise<PaginatedResponse<OvertimeRequest>> {
  return unwrapPage<OvertimeRequest>(await http.get(OVERTIME_PATHS.requests, { params: filter }));
}

export async function cancelOvertimeRequest(
  id: string,
  data: CancelReasonBody,
): Promise<OvertimeRequest> {
  return unwrapData<OvertimeRequest>(await http.post(OVERTIME_PATHS.cancel(id), data));
}
