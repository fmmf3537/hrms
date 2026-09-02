/**
 * 绩效管理子路由表（M5-2-D1 + M5-2-D2 + M5-2-D3）
 * @module router/performance
 * @description 路径前缀 /performance；D1 5 菜单（cycles / indicators / schemes / coefficients / grade-thresholds）
 *              + D2 1 菜单（records 考核记录 / 我的考核）
 *              + **D3 3 菜单（grade-actions / payouts / payout-config）**
 * - D1 权限矩阵（与 server/src/constants/permissions.ts 一致）：
 *   - performance:cycle:read | write        admin / hr / dept_head(read only)
 *   - performance:indicator:read | write    admin / hr / dept_head(read only)
 *   - performance:scheme:read | write       admin / hr / dept_head(read only)
 *   - performance:coefficient:read          admin / hr / dept_head / executive
 *   - performance:coefficient:write         admin / hr / executive（*executive 也能改*）
 *   - performance:grade:threshold:read      admin / hr / executive
 *   - performance:grade:threshold:write     admin / hr（*executive 不能改*）
 *   - employee 全部无权除了 → 菜单空（filter 函数天然处理）
 * - D2 新增：performance:record:read    admin/hr/dept_head/executive/employee（*employee 也有*）
 *         performance:record:write   admin/hr（创建 / 归档 / 驳回）
 * - **D3 新增（M5-2-D3）**：
 *   - performance:grade:calculate    admin/hr/executive（calibrate-ratios 用 record:read）
 *   - performance:payout:read        5 角色全开
 *   - performance:payout:write       admin/hr（payout-config 菜单以此为权限）
 *   - performance:payout:calculate   admin/hr/executive
 *   - performance:payout:settle      admin/hr/executive（prepay + settle 共用）
 * - **D4 新增（M5-2-D4）**销售提成 3 菜单：
 *   - performance:sales:product:read       admin/hr/dept_head/executive/employee（**5 角色全开**）
 *   - performance:sales:payment:read       admin/hr/dept_head/executive（**employee 不可读**）
 *   - performance:sales:commission:read    admin/hr/dept_head/executive（**employee 不可读**）
 *
 * @auth meta.requiresAuth + PerformanceLayout 菜单按实际权限点过滤
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
  /** 仅 employee 角色显示的标签（如「我的奖金」） */
  employeeLabel?: string;
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

// ============ M5-2-D3 等级计算 + 奖金兑现 + 兑现配置 ============
// 图标复用 PerformanceLayout 已注册 5 图标（Calendar/Aim/Files/SetUp/Medal）
// 菜单权限点选择：
//   - grade-actions: grade:calculate（admin/hr/executive，**dept_head/employee 不可达 calibrate-ratios 区块**，可接受取舍）
//   - payouts:       payout:read（5 角色全开，ESS 「我的奖金」）
//   - payout-config: payout:write（admin/hr，菜单语义更干净；非写角色页面仅读但菜单隐藏）

export const PERFORMANCE_D3_MENU: PerformanceMenuItem[] = [
  {
    key: 'grade-actions',
    label: '等级计算',
    icon: 'Aim',
    to: '/performance/grade-actions',
    permission: 'performance:grade:calculate',
  },
  {
    key: 'payouts',
    label: '奖金兑现',
    employeeLabel: '我的奖金',
    icon: 'SetUp',
    to: '/performance/payouts',
    permission: 'performance:payout:read',
  },
  {
    key: 'payout-config',
    label: '兑现配置',
    icon: 'Medal',
    to: '/performance/payout-config',
    permission: 'performance:payout:write',
  },
];

// ============ M5-2-D4 销售提成 3 菜单 ============
// product:read 5 角色全开（含 employee 可看产品字典只读），payment:read / commission:read employee 不可见
// 图标复用 PerformanceLayout 已注册 5 图标（Calendar/Aim/Files/SetUp/Medal）

export const PERFORMANCE_D4_MENU: PerformanceMenuItem[] = [
  {
    key: 'sales-products',
    label: '产品字典',
    icon: 'Calendar',
    to: '/performance/sales-products',
    permission: 'performance:sales:product:read',
  },
  {
    key: 'sales-payments',
    label: '回款管理',
    icon: 'Files',
    to: '/performance/sales-payments',
    permission: 'performance:sales:payment:read',
  },
  {
    key: 'sales-commissions',
    label: '销售提成',
    icon: 'Medal',
    to: '/performance/sales-commissions',
    permission: 'performance:sales:commission:read',
  },
];

/**
 * 5 角色 RBAC，? + 1 菜单按权限点过滤
 * 反直觉点：
 *  - executive 能改 coefficient 但不能改 threshold → threshold 菜单可看但保存按钮仅 admin/hr
 *  - dept_head 有 cycle/indicator/scheme/coefficient read，无 grade threshold read → 阈值菜单不可见
 *  - employee 全切片只?record:read（无 cycle/indicator/scheme/coefficient/threshold read）
 *    → 菜单只剩「考核记录」（employeeLabel 为空时用 label）；D3 后多「我的奖金」
 *  - D3 等级计算菜单 dept_head/employee 不可见 → calibrate-ratios 区块随之不可达（可接受取舍）
 */
export function filterPerformanceMenu(user: UserInfo | null): PerformanceMenuItem[] {
  const all = [
    ...PERFORMANCE_MENU,
    ...PERFORMANCE_D2_MENU,
    ...PERFORMANCE_D3_MENU,
    ...PERFORMANCE_D4_MENU,
  ].filter((item) => hasPermission(user, item.permission));
  // employee 角色展示 employeeLabel（仅当存在时）
  const isEmployee = (user?.roles ?? []).includes('employee');
  if (isEmployee) {
    return all.map((m) =>
      m.employeeLabel ? { ...m, label: m.employeeLabel } : m,
    );
  }
  return all;
}

/**
 * 路径 → 菜单 key；前缀分支；D1 + 1 D2 + **3 D3**
 * 注意：/performance/payouts 与 /performance/payout-config 互不前缀
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
  // D3：grade-actions / payouts / payout-config（顺序安全，互不前缀）
  if (path.startsWith('/performance/grade-actions')) {
    return 'grade-actions';
  }
  if (path.startsWith('/performance/payout-config')) {
    return 'payout-config';
  }
  if (path.startsWith('/performance/payouts')) {
    return 'payouts';
  }
  // D4：sales-products / sales-payments / sales-commissions（顺序安全，互不前缀）
  if (path.startsWith('/performance/sales-products')) {
    return 'sales-products';
  }
  if (path.startsWith('/performance/sales-payments')) {
    return 'sales-payments';
  }
  if (path.startsWith('/performance/sales-commissions')) {
    return 'sales-commissions';
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
      // ============ M5-2-D3 等级计算 + 奖金兑现 4 路由追加 ============
      {
        path: 'grade-actions',
        name: 'GradeActions',
        component: () => import('@/views/performance/grade/GradeActions.vue'),
        meta: { title: '等级计算' },
      },
      {
        path: 'payout-config',
        name: 'PayoutConfig',
        component: () => import('@/views/performance/payout/PayoutConfig.vue'),
        meta: { title: '兑现配置' },
      },
      {
        path: 'payouts',
        name: 'PayoutList',
        component: () => import('@/views/performance/payout/PayoutList.vue'),
        meta: { title: '奖金兑现' },
      },
      {
        path: 'payouts/:id',
        name: 'PayoutDetail',
        component: () => import('@/views/performance/payout/PayoutDetail.vue'),
        meta: { title: '奖金单详情' },
      },
      // ============ M5-2-D4 销售提成 3 路由追加 ============
      {
        path: 'sales-products',
        name: 'SalesProductList',
        component: () => import('@/views/performance/sales/ProductList.vue'),
        meta: { title: '产品字典' },
      },
      {
        path: 'sales-payments',
        name: 'SalesPaymentList',
        component: () => import('@/views/performance/sales/PaymentList.vue'),
        meta: { title: '回款管理' },
      },
      {
        path: 'sales-commissions',
        name: 'SalesCommissionList',
        component: () => import('@/views/performance/sales/CommissionList.vue'),
        meta: { title: '销售提成' },
      },
    ],
  },
];

export default performanceRoutes;
