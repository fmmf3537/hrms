/**
 * 考勤假勤子路由表（M5-2-B）
 * @module router/attendance
 * @description 路径前缀 /attendance；shifts/:id/assign 必须在 shifts/:id 之前
 */

import type { RouteRecordRaw } from 'vue-router';
import type { UserInfo } from '@/api/types';
import { hasPermission } from '@/utils/permission';

export interface AttendanceMenuItem {
  key: string;
  label: string;
  icon: string;
  to: string;
  permission: string;
  extraPermissions?: string[];
}

export const ATTENDANCE_MENU: AttendanceMenuItem[] = [
  {
    key: 'shifts',
    label: '班次管理',
    icon: 'Clock',
    to: '/attendance/shifts',
    permission: 'shift:read',
  },
  {
    key: 'attendance',
    label: '打卡管理',
    icon: 'Timer',
    to: '/attendance/attendance',
    permission: 'attendance:read',
    extraPermissions: ['attendance:read:self-dept', 'attendance:read:self', 'attendance:clock'],
  },
  {
    key: 'leaves',
    label: '请假管理',
    icon: 'Calendar',
    to: '/attendance/leaves',
    permission: 'leave:read',
    extraPermissions: ['leave:request', 'leave:apply'],
  },
  {
    key: 'overtime',
    label: '加班管理',
    icon: 'Sunny',
    to: '/attendance/overtime',
    permission: 'overtime:read',
    extraPermissions: ['overtime:request', 'overtime:apply'],
  },
  {
    key: 'business-trips',
    label: '出差管理',
    icon: 'Location',
    to: '/attendance/business-trips',
    permission: 'trip:read',
    extraPermissions: ['trip:request'],
  },
  {
    key: 'monthly-summaries',
    label: '月度汇总',
    icon: 'DataAnalysis',
    to: '/attendance/monthly-summaries',
    permission: 'summary:read',
  },
];

export function filterAttendanceMenu(user: UserInfo | null): AttendanceMenuItem[] {
  return ATTENDANCE_MENU.filter((item) => {
    if (hasPermission(user, item.permission)) {
      return true;
    }
    return (item.extraPermissions ?? []).some((perm) => hasPermission(user, perm));
  });
}

export function resolveAttendanceActiveKey(path: string): string {
  if (path.startsWith('/attendance/shifts')) {
    return 'shifts';
  }
  if (path.startsWith('/attendance/leaves')) {
    return 'leaves';
  }
  if (path.startsWith('/attendance/overtime')) {
    return 'overtime';
  }
  if (path.startsWith('/attendance/business-trips')) {
    return 'business-trips';
  }
  if (path.startsWith('/attendance/monthly-summaries')) {
    return 'monthly-summaries';
  }
  if (path.startsWith('/attendance/attendance')) {
    return 'attendance';
  }
  return '';
}

const attendanceRoutes: RouteRecordRaw[] = [
  {
    path: '/attendance',
    component: () => import('@/layouts/AttendanceLayout.vue'),
    meta: { requiresAuth: true, title: '考勤假勤' },
    children: [
      { path: '', redirect: '/attendance/shifts' },
      {
        path: 'shifts',
        name: 'ShiftList',
        component: () => import('@/views/attendance/shift/ShiftList.vue'),
        meta: { title: '班次管理' },
      },
      {
        path: 'shifts/:id/assign',
        name: 'ShiftAssignment',
        component: () => import('@/views/attendance/shift/ShiftAssignment.vue'),
        meta: { title: '班次排班' },
      },
      {
        path: 'shifts/:id',
        name: 'ShiftDetail',
        component: () => import('@/views/attendance/shift/ShiftDetail.vue'),
        meta: { title: '班次详情' },
      },
      {
        path: 'attendance/correction',
        name: 'AttendanceCorrection',
        component: () => import('@/views/attendance/attendance/AttendanceCorrection.vue'),
        meta: { title: '手动补卡' },
      },
      {
        path: 'attendance/records/:id',
        name: 'AttendanceDetail',
        component: () => import('@/views/attendance/attendance/AttendanceDetail.vue'),
        meta: { title: '打卡详情' },
      },
      {
        path: 'attendance',
        name: 'AttendanceList',
        component: () => import('@/views/attendance/attendance/AttendanceList.vue'),
        meta: { title: '打卡管理' },
      },
      {
        path: 'leaves/new',
        name: 'LeaveForm',
        component: () => import('@/views/attendance/leave/LeaveForm.vue'),
        meta: { title: '请假申请' },
      },
      {
        path: 'leaves/requests/:id',
        name: 'LeaveDetail',
        component: () => import('@/views/attendance/leave/LeaveDetail.vue'),
        meta: { title: '请假详情' },
      },
      {
        path: 'leaves',
        name: 'LeaveList',
        component: () => import('@/views/attendance/leave/LeaveList.vue'),
        meta: { title: '请假管理' },
      },
      {
        path: 'overtime/new',
        name: 'OvertimeForm',
        component: () => import('@/views/attendance/overtime/OvertimeForm.vue'),
        meta: { title: '加班申请' },
      },
      {
        path: 'overtime',
        name: 'OvertimeList',
        component: () => import('@/views/attendance/overtime/OvertimeList.vue'),
        meta: { title: '加班管理' },
      },
      {
        path: 'business-trips/new',
        name: 'BusinessTripForm',
        component: () => import('@/views/attendance/businessTrip/BusinessTripForm.vue'),
        meta: { title: '出差申请' },
      },
      {
        path: 'business-trips',
        name: 'BusinessTripList',
        component: () => import('@/views/attendance/businessTrip/BusinessTripList.vue'),
        meta: { title: '出差管理' },
      },
      {
        path: 'monthly-summaries/new',
        name: 'MonthlySummaryForm',
        component: () => import('@/views/attendance/monthlySummary/MonthlySummaryForm.vue'),
        meta: { title: '生成月报' },
      },
      {
        path: 'monthly-summaries',
        name: 'MonthlySummaryList',
        component: () => import('@/views/attendance/monthlySummary/MonthlySummaryList.vue'),
        meta: { title: '月度汇总' },
      },
    ],
  },
];

export default attendanceRoutes;
