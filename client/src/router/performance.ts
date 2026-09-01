/**
 * 绩效管理子路由表（M5-2-D1）
 * @module router/performance
 * @description 路径前缀 /performance；本切片仅 5 菜单（cycles / indicators / schemes / coefficients / grade-thresholds）
 * - D1 权限矩阵（与 server/src/constants/permissions.ts 一致）：
 *   - performance:cycle:read | write        admin / hr / dept_head(read only)
 *   - performance:indicator:read | write    admin / hr / dept_head(read only)
 *   - performance:scheme:read | write       admin / hr / dept_head(read only)
 *   - performance:coefficient:read          admin / hr / dept_head / executive
 *   - performance:coefficient:write         admin / hr / executive（**executive 也能改**）
 *   - performance:grade:threshold:read      admin / hr / executive
 *   - performance:grade:threshold:write     admin / hr（**executive 不能改**）
 *   - employee 全部无权限 → 菜单空（filter 函数天然处理）
 * @auth meta.requiresAuth + PerformanceLayout 菜单按真实权限点过滤
 */

import type { RouteRecordRaw } from 'vue-router';
import type { UserInfo } from '@/api/types';
import { hasPermission } from '@/utils/permission';

export interface PerformanceMenuItem {
  key: string;
  label: string;
  icon: string;
  to: string;
  permission: string;
}

export const PERFORMANCE_MENU: PerformanceMenuItem[] = [
  {
    key: 'cycles',
    label: '考核周期',
    icon: 'Calendar',
    to: '/performance/cycles',
    permission: 'performance:cycle:read',
  },
  {
    key: 'indicators',
    label: '指标库',
    icon: 'Aim',
    to: '/performance/indicators',
    permission: 'performance:indicator:read',
  },
  {
    key: 'schemes',
    label: '考核方案',
    icon: 'Files',
    to: '/performance/schemes',
    permission: 'performance:scheme:read',
  },
  {
    key: 'coefficients',
    label: '绩效系数',
    icon: 'SetUp',
    to: '/performance/coefficients',
    permission: 'performance:coefficient:read',
  },
  {
    key: 'grade-thresholds',
    label: '等级阈值',
    icon: 'Medal',
    to: '/performance/grade-thresholds',
    permission: 'performance:grade:threshold:read',
  },
];

/**
 * 5 角色 RBAC：5 菜单按权限点过滤
 * 反直觉点：
 *  - executive 能改 coefficient 但不能改 threshold → threshold 菜单可看但保存按钮仅 admin/hr
 *  - dept_head 有 cycle/indicator/scheme/coefficient read，无 grade threshold read → 阈值菜单不可见
 *  - employee 本切片全无权限 → 菜单整体为空
 */
export function filterPerformanceMenu(user: UserInfo | null): PerformanceMenuItem[] {
  return PERFORMANCE_MENU.filter((item) => hasPermission(user, item.permission));
}

/**
 * 路径 → 菜单 key（5 前缀分支）
 */
export function resolvePerformanceActiveKey(path: string): string {
  if (path.startsWith('/performance/cycles')) {
    return 'cycles';
  }
  if (path.startsWith('/performance/indicators')) {
    return 'indicators';
  }
  if (path.startsWith('/performance/schemes')) {
    return 'schemes';
  }
  if (path.startsWith('/performance/coefficients')) {
    return 'coefficients';
  }
  if (path.startsWith('/performance/grade-thresholds')) {
    return 'grade-thresholds';
  }
  return '';
}

const performanceRoutes: RouteRecordRaw[] = [
  {
    path: '/performance',
    component: () => import('@/layouts/PerformanceLayout.vue'),
    meta: { requiresAuth: true, title: '绩效管理' },
    children: [
      { path: '', redirect: '/performance/cycles' },
      {
        path: 'cycles',
        name: 'CycleList',
        component: () => import('@/views/performance/cycle/CycleList.vue'),
        meta: { title: '考核周期' },
      },
      {
        path: 'indicators',
        name: 'IndicatorList',
        component: () => import('@/views/performance/indicator/IndicatorList.vue'),
        meta: { title: '指标库' },
      },
      {
        path: 'schemes',
        name: 'SchemeList',
        component: () => import('@/views/performance/scheme/SchemeList.vue'),
        meta: { title: '考核方案' },
      },
      {
        path: 'coefficients',
        name: 'CoefficientPanel',
        component: () => import('@/views/performance/coefficient/CoefficientPanel.vue'),
        meta: { title: '绩效系数' },
      },
      {
        path: 'grade-thresholds',
        name: 'GradeThresholds',
        component: () => import('@/views/performance/grade/GradeThresholds.vue'),
        meta: { title: '等级阈值' },
      },
    ],
  },
];

export default performanceRoutes;
