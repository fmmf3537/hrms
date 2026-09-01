/**
 * 请假管理 API（M5-2-B）
 * @module api/leave
 * @description 消费 /api/leaves 5 端点；列表是 /requests 不是 /leaves
 * @leaveType 8 类假期
 */

import http from './http';
import type { PaginatedResponse } from './types';
import type {
  CancelReasonBody,
  CreateLeaveRequestBody,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  ListLeaveFilter,
} from './types/attendance';
import { unwrapData, unwrapPage } from './types/organization';

export const LEAVE_PATHS = {
  balance: '/leaves/balance',
  requests: '/leaves/requests',
  item: (id: string) => `/leaves/requests/${id}`,
  cancel: (id: string) => `/leaves/requests/${id}/cancel`,
} as const;

export async function getLeaveBalance(
  employeeId: string,
  leaveType: LeaveType | string,
  year?: number,
): Promise<LeaveBalance> {
  return unwrapData<LeaveBalance>(
    await http.get(LEAVE_PATHS.balance, { params: { employeeId, leaveType, year } }),
  );
}

export async function createLeaveRequest(data: CreateLeaveRequestBody): Promise<LeaveRequest> {
  return unwrapData<LeaveRequest>(await http.post(LEAVE_PATHS.requests, data));
}

export async function listLeaveRequests(
  filter: ListLeaveFilter = {},
): Promise<PaginatedResponse<LeaveRequest>> {
  return unwrapPage<LeaveRequest>(await http.get(LEAVE_PATHS.requests, { params: filter }));
}

export async function getLeaveRequest(id: string): Promise<LeaveRequest> {
  return unwrapData<LeaveRequest>(await http.get(LEAVE_PATHS.item(id)));
}

export async function cancelLeaveRequest(
  id: string,
  data: CancelReasonBody,
): Promise<LeaveRequest> {
  return unwrapData<LeaveRequest>(await http.post(LEAVE_PATHS.cancel(id), data));
}
