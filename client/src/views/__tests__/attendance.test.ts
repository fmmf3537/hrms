/**
 * 考勤假勤视图 + 状态机单测（M5-2-B）内联断言
 */
import attendanceRoutes, {
  ATTENDANCE_MENU,
  filterAttendanceMenu,
  resolveAttendanceActiveKey,
} from '@/router/attendance';
import { OVERTIME_PATHS } from '@/api/overtime';
import { BUSINESS_TRIP_PATHS } from '@/api/businessTrip';
import { MONTHLY_SUMMARY_PATHS } from '@/api/monthlySummary';
import { ATTENDANCE_STATUS_LABELS } from '@/api/types/attendance';
import type { UserInfo } from '@/api/types';
import ShiftList from '@/views/attendance/shift/ShiftList.vue';
import AttendanceList from '@/views/attendance/attendance/AttendanceList.vue';
import LeaveList from '@/views/attendance/leave/LeaveList.vue';
import OvertimeList from '@/views/attendance/overtime/OvertimeList.vue';
import BusinessTripList from '@/views/attendance/businessTrip/BusinessTripList.vue';
import MonthlySummaryList from '@/views/attendance/monthlySummary/MonthlySummaryList.vue';

interface Case {
  name: string;
  fn: () => void;
}

const cases: Case[] = [];

function describe(_name: string, fn: () => void): void {
  fn();
}

function it(name: string, fn: () => void): void {
  cases.push({ name, fn });
}

function expectEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function mockUser(roles: string[], permissions: string[]): UserInfo {
  return {
    id: 'u1',
    username: 'tester',
    email: null,
    phone: null,
    status: 'active',
    mustChangePassword: false,
    roles,
    permissions,
    companyId: null,
    departmentId: null,
  };
}

describe('views/__tests__/attendance.test.ts', () => {
  it('6 模块列表页组件可导入', () => {
    expectEqual(typeof ShiftList, 'object', 'ShiftList');
    expectEqual(typeof AttendanceList, 'object', 'AttendanceList');
    expectEqual(typeof LeaveList, 'object', 'LeaveList');
    expectEqual(typeof OvertimeList, 'object', 'OvertimeList');
    expectEqual(typeof BusinessTripList, 'object', 'BusinessTripList');
    expectEqual(typeof MonthlySummaryList, 'object', 'MonthlySummaryList');
  });

  it('状态标签覆盖 B1-B6（draft/active/submitted/employee_confirmed 等）', () => {
    expectEqual(ATTENDANCE_STATUS_LABELS.draft, '草稿', 'draft');
    expectEqual(ATTENDANCE_STATUS_LABELS.active, '生效', 'active');
    expectEqual(ATTENDANCE_STATUS_LABELS.archived, '已归档', 'B1');
    expectEqual(ATTENDANCE_STATUS_LABELS.pending, '待处理', 'B2');
    expectEqual(ATTENDANCE_STATUS_LABELS.submitted, '已提交', 'B3-B5');
    expectEqual(ATTENDANCE_STATUS_LABELS.employee_confirmed, '员工已确认', 'B6');
    expectEqual(ATTENDANCE_STATUS_LABELS.hr_locked, 'HR 已锁定', 'B6 lock');
  });

  it('B4/B5/B6 没有 GET /:id；shifts/:id/assign 在 shifts/:id 之前', () => {
    expectEqual('item' in OVERTIME_PATHS, false, 'no ot get');
    expectEqual('item' in BUSINESS_TRIP_PATHS, false, 'no trip get');
    expectEqual('item' in MONTHLY_SUMMARY_PATHS, false, 'no summary get');
    const children = attendanceRoutes[0].children ?? [];
    const assignIdx = children.findIndex((c) => c.path === 'shifts/:id/assign');
    const detailIdx = children.findIndex((c) => c.path === 'shifts/:id');
    expectEqual(assignIdx >= 0 && assignIdx < detailIdx, true, 'assign before :id');
  });

  it('employee 可见打卡/请假/加班/出差；菜单无 finance', () => {
    const employee = filterAttendanceMenu(
      mockUser(['employee'], ['attendance:clock', 'leave:request', 'overtime:request', 'trip:request', 'summary:read']),
    );
    expectEqual(employee.some((m) => m.key === 'attendance'), true, 'clock menu');
    expectEqual(employee.some((m) => m.key === 'leaves'), true, 'leave menu');
    expectEqual(employee.some((m) => m.key === 'shifts'), false, 'no shift');
    expectEqual(ATTENDANCE_MENU.map((m) => m.permission).join(',').includes('finance'), false, 'no finance');
    expectEqual(resolveAttendanceActiveKey('/attendance/leaves/new'), 'leaves', 'active leave');
  });
});

export function runAttendanceViewTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const attendanceViewTestCount = cases.length;
