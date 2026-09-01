/**
 * 打卡管理 API（M5-2-B）
 * @module api/attendance
 * @description 消费 /api/attendance 5 端点；列表路径是 /records 不是 /
 * @clockType wifi / gps / manual / imported
 */

import http from './http';
import type { PaginatedResponse } from './types';
import type {
  AttendanceRecord,
  ClockInRequest,
  ImportDataRequest,
  ImportDataResult,
  ListAttendanceFilter,
  ManualClockRequest,
} from './types/attendance';
import { unwrapData, unwrapPage } from './types/organization';

export const ATTENDANCE_PATHS = {
  clockIn: '/attendance/clock-in',
  records: '/attendance/records',
  record: (id: string) => `/attendance/records/${id}`,
  manual: '/attendance/manual',
  import: '/attendance/import',
} as const;

export async function clockIn(data: ClockInRequest): Promise<AttendanceRecord> {
  return unwrapData<AttendanceRecord>(await http.post(ATTENDANCE_PATHS.clockIn, data));
}

export async function listRecords(
  filter: ListAttendanceFilter = {},
): Promise<PaginatedResponse<AttendanceRecord>> {
  return unwrapPage<AttendanceRecord>(await http.get(ATTENDANCE_PATHS.records, { params: filter }));
}

export async function getRecord(id: string): Promise<AttendanceRecord> {
  return unwrapData<AttendanceRecord>(await http.get(ATTENDANCE_PATHS.record(id)));
}

export async function manualClock(data: ManualClockRequest): Promise<AttendanceRecord> {
  return unwrapData<AttendanceRecord>(await http.post(ATTENDANCE_PATHS.manual, data));
}

export async function importData(data: ImportDataRequest): Promise<ImportDataResult> {
  return unwrapData<ImportDataResult>(await http.post(ATTENDANCE_PATHS.import, data));
}
