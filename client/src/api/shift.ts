/**
 * 班次管理 API（M5-2-B）
 * @module api/shift
 * @description 消费 /api/shifts 5 端点；assignments 必须在 /:id 之前（后端已如此）
 * @type standard / comprehensive / flexible
 * @status draft / active / archived
 */

import http from './http';
import type { PaginatedResponse } from './types';
import type {
  AssignShiftRequest,
  AssignShiftResult,
  CreateShiftRequest,
  ListShiftFilter,
  Shift,
  UpdateShiftRequest,
} from './types/attendance';
import { unwrapData, unwrapPage } from './types/organization';

export const SHIFT_PATHS = {
  list: '/shifts',
  assignments: '/shifts/assignments',
  item: (id: string) => `/shifts/${id}`,
} as const;

export async function listShifts(filter: ListShiftFilter = {}): Promise<PaginatedResponse<Shift>> {
  return unwrapPage<Shift>(await http.get(SHIFT_PATHS.list, { params: filter }));
}

export async function getShift(id: string): Promise<Shift> {
  return unwrapData<Shift>(await http.get(SHIFT_PATHS.item(id)));
}

export async function createShift(data: CreateShiftRequest): Promise<Shift> {
  return unwrapData<Shift>(await http.post(SHIFT_PATHS.list, data));
}

export async function updateShift(id: string, data: UpdateShiftRequest): Promise<Shift> {
  return unwrapData<Shift>(await http.put(SHIFT_PATHS.item(id), data));
}

export async function assignShift(data: AssignShiftRequest): Promise<AssignShiftResult> {
  return unwrapData<AssignShiftResult>(await http.post(SHIFT_PATHS.assignments, data));
}
