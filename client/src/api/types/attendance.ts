/**
 * 考勤假勤 API 类型（M5-2-B）
 * @module api/types/attendance
 * @description 对齐 Prisma ShiftTemplate / AttendanceRecord / LeaveRequest /
 *   OvertimeRequest / BusinessTrip / MonthlySummary
 * 解包信封复用 organization.unwrapData / unwrapPage（不改 organization.ts）
 */

export type AttendanceTagType = 'success' | 'warning' | 'info' | 'danger';

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  active: '生效',
  archived: '已归档',
  approved: '已通过',
  pending: '待处理',
  rejected: '已驳回',
  submitted: '已提交',
  cancelled: '已取消',
  employee_confirmed: '员工已确认',
  hr_locked: 'HR 已锁定',
  late: '迟到',
  early: '早退',
  absent: '缺卡',
  leave: '请假',
  overtime: '加班',
  business_trip: '出差',
  scheduled: '已排班',
  unscheduled: '未排班',
  normal: '正常',
};

export function attendanceStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '—';
  }
  return ATTENDANCE_STATUS_LABELS[status] ?? status;
}

export function attendanceTagType(status: string | null | undefined): AttendanceTagType {
  if (
    status === 'approved' ||
    status === 'active' ||
    status === 'hr_locked' ||
    status === 'employee_confirmed'
  ) {
    return 'success';
  }
  if (status === 'rejected' || status === 'cancelled' || status === 'archived') {
    return 'danger';
  }
  if (status === 'submitted' || status === 'pending' || status === 'draft') {
    return 'warning';
  }
  return 'info';
}

export interface AttendanceNameRef {
  id: string;
  name: string;
  employeeNo?: string | null;
}

// ===== B1 班次 =====
export type ShiftType = 'standard' | 'comprehensive' | 'flexible';
export type ShiftStatus = 'draft' | 'active' | 'archived';
export type AssigneeType = 'employee' | 'department';

export interface ShiftAssignment {
  id: string;
  shiftId: string;
  assigneeType: AssigneeType | string;
  employeeId?: string | null;
  departmentId?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  remark?: string | null;
}

export interface Shift {
  id: string;
  code: string;
  name: string;
  shiftType: ShiftType | string;
  startTime: string;
  endTime: string;
  breakStart?: string | null;
  breakEnd?: string | null;
  workHours: string | number;
  flexMinutes?: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  companyId: string;
  description?: string | null;
  status: ShiftStatus;
  createdAt: string;
  updatedAt: string;
  assignments?: ShiftAssignment[];
  company?: AttendanceNameRef;
}

export interface CreateShiftRequest {
  code: string;
  name: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  workHours: number;
  companyId: string;
  effectiveFrom: string;
  breakStart?: string;
  breakEnd?: string;
  flexMinutes?: number;
  effectiveTo?: string;
  description?: string;
}

export type UpdateShiftRequest = Partial<CreateShiftRequest> & { status?: ShiftStatus };

export interface AssignShiftRequest {
  shiftId: string;
  assigneeType: AssigneeType;
  employeeIds?: string[];
  departmentIds?: string[];
  effectiveFrom: string;
  effectiveTo?: string;
  remark?: string;
}

export interface AssignShiftConflict {
  employeeId?: string;
  date?: string;
  message?: string;
}

/** POST /shifts/assignments 实际返回 */
export interface AssignShiftResult {
  created: number;
  conflicts: AssignShiftConflict[];
}

export interface ListShiftFilter {
  companyId?: string;
  shiftType?: ShiftType;
  status?: ShiftStatus;
  page?: number;
  pageSize?: number;
}

// ===== B2 打卡 =====
export type ClockType = 'wifi' | 'gps' | 'manual' | 'imported';
export type AttendanceStatus = 'approved' | 'pending' | 'rejected';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  companyId: string;
  departmentId: string;
  shiftAssignmentId?: string | null;
  clockInTime?: string | null;
  clockOutTime?: string | null;
  clockType: ClockType | string;
  source?: string;
  wifiSsid?: string | null;
  gpsAddress?: string | null;
  isLate: boolean;
  lateMinutes: number;
  isEarlyLeave: boolean;
  earlyLeaveMinutes: number;
  isMissing: boolean;
  status: AttendanceStatus;
  isManual: boolean;
  manualReason?: string | null;
  remark?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: AttendanceNameRef;
}

export interface ClockInRequest {
  employeeId: string;
  clockType: 'wifi' | 'gps';
  clockInTime: string;
  clockOutTime?: string;
  wifiSsid?: string;
  wifiMac?: string;
  gpsLat?: number;
  gpsLng?: number;
  gpsAccuracy?: number;
  gpsAddress?: string;
}

export interface ManualClockRequest {
  employeeId: string;
  clockInTime: string;
  clockOutTime?: string;
  clockType: 'manual';
  manualReason: string;
}

export interface ImportDataRequest {
  fileContent: string;
  format: string;
  effectiveDate?: string;
}

export interface ImportDataResult {
  successCount: number;
  failedCount: number;
}

export interface ListAttendanceFilter {
  employeeId?: string;
  companyId?: string;
  departmentId?: string;
  status?: AttendanceStatus;
  clockType?: ClockType;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

// ===== B3 请假 =====
export type LeaveType =
  | 'annual'
  | 'sick'
  | 'personal'
  | 'compensatory'
  | 'marriage'
  | 'maternity'
  | 'paternity'
  | 'bereavement';

export type LeaveStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveAttachment {
  name: string;
  url: string;
  type?: string;
  size?: number;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  companyId: string;
  departmentId: string;
  leaveType: LeaveType | string;
  startDate: string;
  endDate: string;
  totalDays: string | number;
  reason?: string | null;
  attachments?: LeaveAttachment[] | null;
  status: LeaveStatus;
  approvalInstanceId?: string | null;
  cancelledReason?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: AttendanceNameRef;
}

export interface LeaveBalance {
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  expiryDate?: string;
}

export interface CreateLeaveRequestBody {
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason?: string;
  attachments?: LeaveAttachment[];
}

export interface CancelReasonBody {
  reason: string;
}

export interface ListLeaveFilter {
  employeeId?: string;
  companyId?: string;
  departmentId?: string;
  leaveType?: LeaveType;
  status?: LeaveStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

// ===== B4 加班 =====
export type OvertimeType = 'weekday' | 'weekend' | 'holiday';
export type CompensationType = 'pay' | 'comp';
export type OvertimeStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';

export interface OvertimeRequest {
  id: string;
  employeeId: string;
  companyId: string;
  departmentId: string;
  startTime: string;
  endTime: string;
  totalHours: string | number;
  overtimeType: OvertimeType | string;
  compensationType: CompensationType | string;
  overtimePay?: string | number | null;
  compDays?: string | number | null;
  reason: string;
  attachments?: LeaveAttachment[] | null;
  status: OvertimeStatus;
  createdAt: string;
  updatedAt: string;
  employee?: AttendanceNameRef;
}

export interface CreateOvertimeRequestBody {
  employeeId: string;
  startTime: string;
  endTime: string;
  compensationType: CompensationType;
  reason: string;
  overtimeType?: OvertimeType;
  attachments?: LeaveAttachment[];
}

export interface ListOvertimeFilter {
  employeeId?: string;
  companyId?: string;
  departmentId?: string;
  compensationType?: CompensationType;
  status?: OvertimeStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

// ===== B5 出差 =====
export type BusinessTripStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';

export interface BusinessTrip {
  id: string;
  employeeId: string;
  companyId: string;
  departmentId: string;
  destination: string;
  startDate: string;
  endDate: string;
  totalDays: string | number;
  reason: string;
  projectCode?: string | null;
  allowanceAmount?: string | number | null;
  cityTier?: string | null;
  status: BusinessTripStatus;
  createdAt: string;
  updatedAt: string;
  employee?: AttendanceNameRef;
}

export interface CreateBusinessTripRequest {
  employeeId: string;
  destination: string;
  startDate: string;
  endDate: string;
  reason: string;
  projectCode?: string;
}

export interface ListBusinessTripFilter {
  employeeId?: string;
  companyId?: string;
  departmentId?: string;
  destination?: string;
  status?: BusinessTripStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

// ===== B6 月度汇总 =====
export type SummaryStatus = 'draft' | 'employee_confirmed' | 'hr_locked';

export interface MonthlySummary {
  id: string;
  employeeId: string;
  companyId: string;
  departmentId: string;
  year: number;
  month: number;
  workDays: string | number;
  lateCount: number;
  earlyLeaveCount: number;
  missingCount: number;
  leaveDays: string | number;
  leaveHours?: string | number;
  overtimeHours: string | number;
  tripDays: string | number;
  compBalance: string | number;
  status: SummaryStatus;
  employeeConfirmedAt?: string | null;
  hrLockedAt?: string | null;
  remark?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: AttendanceNameRef;
}

export interface GenerateSummaryRequest {
  year: number;
  month: number;
  employeeId?: string;
}

export interface ListMonthlySummaryFilter {
  year: number;
  month: number;
  employeeId?: string;
  companyId?: string;
  departmentId?: string;
  status?: SummaryStatus;
}

export type CalendarMode = 'attendance' | 'summary' | 'schedule';

export type CalendarCellStatus =
  | 'normal'
  | 'late'
  | 'early'
  | 'absent'
  | 'leave'
  | 'overtime'
  | 'business_trip'
  | 'scheduled'
  | 'unscheduled';

export interface CalendarCell {
  status?: CalendarCellStatus;
  summary?: string;
}

export type CalendarData = Record<string, CalendarCell>;
