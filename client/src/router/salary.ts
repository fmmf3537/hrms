/**
 * 薪酬核算子路由表（M5-2-C1）
 * @module router/salary
 * @description 路径前缀 /salary；grades/:id 必须在 grades 列表之后、其它静态路径之前无冲突
 */

import type { RouteRecordRaw } from 'vue-router';
import type { UserInfo } from '@/api/types';
import { hasPermission } from '@/utils/permission';

export interface SalaryMenuItem {
  key: string;
  label: string;
  employeeLabel?: string;
  icon: string;
  to: string;
  permission: string;
  hideForEmployee?: boolean;
}

export const SALARY_MENU: SalaryMenuItem[] = [
  {
    key: 'grade',
    label: '薪级薪档',
    icon: 'Money',
    to: '/salary/grades',
    permission: 'salary:grade:read',
    hideForEmployee: true,
  },
  {
    key: 'plan',
    label: '薪酬方案',
    employeeLabel: '我的薪酬方案',
    icon: 'Coin',
    to: '/salary/plans',
    permission: 'salary:plan:read',
  },
  {
    key: 'social',
    label: '社保方案',
    icon: 'Tickets',
    to: '/salary/insurances/social',
    permission: 'salary:insurance:read',
    hideForEmployee: true,
  },
  {
    key: 'fund',
    label: '公积金方案',
    icon: 'Wallet',
    to: '/salary/insurances/housing-fund',
    permission: 'salary:housing-fund:read',
    hideForEmployee: true,
  },
  {
    key: 'registration',
    label: '参保登记',
    employeeLabel: '我的参保',
    icon: 'Postcard',
    to: '/salary/insurances/employees',
    permission: 'salary:insurance:read',
  },
  {
    key: 'tax-calc',
    label: '个税工具',
    icon: 'Operation',
    to: '/salary/tax/calculator',
    permission: 'salary:tax:calculate',
    hideForEmployee: true,
  },
  {
    key: 'tax-history',
    label: '个税查询',
    employeeLabel: '我的个税',
    icon: 'DataLine',
    to: '/salary/tax/history',
    permission: 'salary:tax:read',
  },
];

/** M5-2-C2 追加菜单；不写入 SALARY_MENU，以免破坏 C1 `length === 7` 旧测 */
export const SALARY_C2_MENU: SalaryMenuItem[] = [
  {
    key: 'my-payslips',
    label: '我的工资条',
    icon: 'Tickets',
    to: '/salary/my-payslips',
    permission: 'salary:payslip:generate',
  },
  {
    key: 'payroll-runs',
    label: '算薪管理',
    icon: 'Operation',
    to: '/salary/payroll-runs',
    permission: 'salary:payroll-run:read',
    hideForEmployee: true,
  },
  {
    key: 'payslips',
    label: '工资单管理',
    icon: 'Money',
    to: '/salary/payslips',
    permission: 'salary:payslip:read',
    hideForEmployee: true,
  },
];

/** M5-2-C3 追加菜单；不写入 SALARY_MENU，以免破坏 C1 `length === 7` 旧测 */
export const SALARY_C3_MENU: SalaryMenuItem[] = [
  {
    key: 'commission',
    label: '提成查询',
    employeeLabel: '我的提成',
    icon: 'Coin',
    to: '/salary/commissions',
    permission: 'salary:commission:read',
  },
  {
    key: 'settlements',
    label: '提成结算',
    icon: 'Tickets',
    to: '/salary/commission-settlements',
    permission: 'salary:commission:read',
    hideForEmployee: true,
  },
  {
    key: 'cost-alerts',
    label: '成本预警',
    icon: 'Operation',
    to: '/salary/cost-alerts',
    permission: 'salary:cost-alert:read',
    hideForEmployee: true,
  },
  {
    key: 'adjustments',
    label: '调薪管理',
    employeeLabel: '我的调薪',
    icon: 'Money',
    to: '/salary/adjustments',
    permission: 'salary:adjustment:read',
  },
];

export function filterSalaryMenu(user: UserInfo | null): SalaryMenuItem[] {
  const elevated = ['admin', 'hr', 'dept_head', 'executive'];
  const isEmployee =
    Boolean(user?.roles.includes('employee')) &&
    !user?.roles.some((r) => elevated.includes(r));
  const head = SALARY_C2_MENU.filter((item) => item.key === 'my-payslips');
  const tail = SALARY_C2_MENU.filter((item) => item.key !== 'my-payslips');
  return [...head, ...SALARY_MENU, ...tail, ...SALARY_C3_MENU].filter((item) => {
    if (isEmployee && item.hideForEmployee) {
      return false;
    }
    if (item.key === 'adjustments') {
      return (
        hasPermission(user, 'salary:adjustment:read') ||
        hasPermission(user, 'salary:adjustment:read-self')
      );
    }
    return hasPermission(user, item.permission);
  }).map((item) => ({
    ...item,
    label: isEmployee && item.employeeLabel ? item.employeeLabel : item.label,
  }));
}

export function resolveSalaryActiveKey(path: string): string {
  if (path.startsWith('/salary/grades')) {
    return 'grade';
  }
  if (path.startsWith('/salary/plans')) {
    return 'plan';
  }
  if (path.startsWith('/salary/insurances/housing-fund')) {
    return 'fund';
  }
  if (path.startsWith('/salary/insurances/employees')) {
    return 'registration';
  }
  if (path.startsWith('/salary/insurances/social')) {
    return 'social';
  }
  if (path.startsWith('/salary/tax/calculator')) {
    return 'tax-calc';
  }
  if (path.startsWith('/salary/tax/history')) {
    return 'tax-history';
  }
  if (path.startsWith('/salary/my-payslips')) {
    return 'my-payslips';
  }
  if (path.startsWith('/salary/payroll-runs')) {
    return 'payroll-runs';
  }
  if (path.startsWith('/salary/payslips')) {
    return 'payslips';
  }
  if (path.startsWith('/salary/commissions')) {
    return 'commission';
  }
  if (path.startsWith('/salary/commission-settlements')) {
    return 'settlements';
  }
  if (path.startsWith('/salary/cost-alerts')) {
    return 'cost-alerts';
  }
  if (path.startsWith('/salary/adjustments')) {
    return 'adjustments';
  }
  return '';
}

const salaryRoutes: RouteRecordRaw[] = [
  {
    path: '/salary',
    component: () => import('@/layouts/SalaryLayout.vue'),
    meta: { requiresAuth: true, title: '薪酬核算' },
    children: [
      { path: '', redirect: '/salary/grades' },
      {
        path: 'grades',
        name: 'GradeList',
        component: () => import('@/views/salary/grade/GradeList.vue'),
        meta: { title: '薪级薪档' },
      },
      {
        path: 'grades/:id',
        name: 'GradeDetail',
        component: () => import('@/views/salary/grade/GradeDetail.vue'),
        meta: { title: '薪档管理' },
      },
      {
        path: 'plans',
        name: 'SalaryPlanList',
        component: () => import('@/views/salary/plan/SalaryPlanList.vue'),
        meta: { title: '薪酬方案' },
      },
      {
        path: 'insurances/social',
        name: 'SocialSchemeList',
        component: () => import('@/views/salary/insurance/SocialSchemeList.vue'),
        meta: { title: '社保方案' },
      },
      {
        path: 'insurances/housing-fund',
        name: 'HousingFundList',
        component: () => import('@/views/salary/insurance/HousingFundList.vue'),
        meta: { title: '公积金方案' },
      },
      {
        path: 'insurances/employees',
        name: 'EmployeeInsuranceList',
        component: () => import('@/views/salary/insurance/EmployeeInsuranceList.vue'),
        meta: { title: '参保登记' },
      },
      {
        path: 'tax/calculator',
        name: 'TaxCalculator',
        component: () => import('@/views/salary/tax/TaxCalculator.vue'),
        meta: { title: '个税工具' },
      },
      {
        path: 'tax/history',
        name: 'TaxHistory',
        component: () => import('@/views/salary/tax/TaxHistory.vue'),
        meta: { title: '个税查询' },
      },
      {
        path: 'payroll-runs',
        name: 'PayrollRunList',
        component: () => import('@/views/salary/payroll/PayrollRunList.vue'),
        meta: { title: '算薪管理' },
      },
      {
        path: 'payroll-runs/:id',
        name: 'PayrollRunDetail',
        component: () => import('@/views/salary/payroll/PayrollRunDetail.vue'),
        meta: { title: '算薪详情' },
      },
      {
        path: 'payslips',
        name: 'PayslipList',
        component: () => import('@/views/salary/payroll/PayslipList.vue'),
        meta: { title: '工资单管理' },
      },
      {
        path: 'payslips/:id',
        name: 'PayslipDetail',
        component: () => import('@/views/salary/payroll/PayslipDetail.vue'),
        meta: { title: '工资单详情' },
      },
      {
        path: 'my-payslips',
        name: 'MyPayslipList',
        component: () => import('@/views/salary/ess/MyPayslipList.vue'),
        meta: { title: '我的工资条' },
      },
      {
        path: 'my-payslips/:id',
        name: 'MyPayslipDetail',
        component: () => import('@/views/salary/ess/MyPayslipDetail.vue'),
        meta: { title: '工资条详情' },
      },
      {
        path: 'commissions',
        name: 'CommissionSummary',
        component: () => import('@/views/salary/commission/CommissionSummary.vue'),
        meta: { title: '提成查询' },
      },
      {
        path: 'commission-settlements',
        name: 'SettlementList',
        component: () => import('@/views/salary/commission/SettlementList.vue'),
        meta: { title: '提成结算' },
      },
      {
        path: 'commission-settlements/:id',
        name: 'SettlementDetail',
        component: () => import('@/views/salary/commission/SettlementDetail.vue'),
        meta: { title: '结算单详情' },
      },
      {
        path: 'cost-alerts',
        name: 'CostAlertList',
        component: () => import('@/views/salary/cost-alert/CostAlertList.vue'),
        meta: { title: '成本预警' },
      },
      {
        path: 'cost-alerts/:id',
        name: 'CostAlertDetail',
        component: () => import('@/views/salary/cost-alert/CostAlertDetail.vue'),
        meta: { title: '预警详情' },
      },
      {
        path: 'adjustments',
        name: 'AdjustmentList',
        component: () => import('@/views/salary/adjustment/AdjustmentList.vue'),
        meta: { title: '调薪管理' },
      },
      {
        path: 'adjustments/:id',
        name: 'AdjustmentDetail',
        component: () => import('@/views/salary/adjustment/AdjustmentDetail.vue'),
        meta: { title: '调薪详情' },
      },
    ],
  },
];

export default salaryRoutes;
