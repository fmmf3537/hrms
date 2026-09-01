/**
 * 绩效管理子路由表（M5-2-D1 + M5-2-D2）
 * @module router/performance
 * @description 路径前缀 /performance；D1 5 菜单（cycles / indicators / schemes / coefficients / grade-thresholds）
 *              + D2 1 菜单（records 考核记录 / 我的考核）
 * - D1 权限矩阵（与 server/src/constants/permissions.ts 一致）：
 *   - performance:cycle:read | write        admin / hr / dept_head(read only)
 *   - performance:indicator:read | write    admin / hr / dept_head(read only)
 *   - performance:scheme:read | write       admin / hr / dept_head(read only)
 *   - performance:coefficient:read          admin / hr / dept_head / executive
 *   - performance:coefficient:write         admin / hr / executive（**executive 也能改**）
 *   - performance:grade:threshold:read      admin / hr / executive
 *   - performance:grade:threshold:write     admin / hr（**executive 不能改**）
 *   - employee 全部无权限 → 菜单空（filter 函数天然处理）
 * - D2 新增：performance:record:read    admin/hr/dept_head/executive/employee（**employee 也有**）
 *         performance:record:write   admin/hr（创建/归档/驳回）
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

// ============ M5-2-D2 考核记录独立菜单 ============

export const PERFORMANCE_D2_MENU: PerformanceMenuItem[] = [
  {
    key: 'records',
    label: '考核记录',
    icon: 'Files', // 复用 PerformanceLayout 已注册图标（不修改 layout 文件）
    to: '/performance/records',
    permission: 'performance:record:read',
  },
];

/**
 * 5 角色 RBAC：5 + 1 菜单按权限点过滤
 * 反直觉点：
 *  - executive 能改 coefficient 但不能改 threshold → threshold 菜单可看但保存按钮仅 admin/hr
 *  - dept_head 有 cycle/indicator/scheme/coefficient read，无 grade threshold read → 阈值菜单不可见
 *  - employee 全切片只有 record:read（无 cycle/indicator/scheme/coefficient/threshold read）
 *    → 菜单只剩「我的考核」（employeeLabel 在模板侧处理）
 */
export function filterPerformanceMenu(user: UserInfo | null): PerformanceMenuItem[] {
  return [...PERFORMANCE_MENU, ...PERFORMANCE_D2_MENU].filter((item) =>
    hasPermission(user, item.permission),
  );
}

/**
 * 路径 → 菜单 key（6 前缀分支：5 D1 + 1 D2）
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
  if (path.startsWith('/performance/records')) {
    return 'records';
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
      // ============ M5-2-D2 考核记录 2 路由追加 ============
      {
        path: 'records',
        name: 'RecordList',
        component: () => import('@/views/performance/record/RecordList.vue'),
        meta: { title: '考核记录' },
      },
      {
        path: 'records/:id',
        name: 'RecordDetail',
        component: () => import('@/views/performance/record/RecordDetail.vue'),
        meta: { title: '考核详情' },
      },
    ],
  },
];

export default performanceRoutes;
