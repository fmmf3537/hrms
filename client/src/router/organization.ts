/**
 * 组织人事子路由表（M5-2-A1）
 * @module router/organization
 * @description 路径前缀 /org；org-chart 必须在 employees/:id 之前
 * @auth meta.requiresAuth + OrganizationLayout 菜单按真实权限点过滤
 */

import type { RouteRecordRaw } from 'vue-router';
import type { UserInfo } from '@/api/types';
import { hasPermission } from '@/utils/permission';

export interface OrgMenuItem {
  key: string;
  label: string;
  icon: string;
  to: string;
  permission: string;
}

export const ORG_MENU: OrgMenuItem[] = [
  {
    key: 'companies',
    label: '法人公司',
    icon: 'OfficeBuilding',
    to: '/org/companies',
    permission: 'company:read',
  },
  {
    key: 'departments',
    label: '部门管理',
    icon: 'Connection',
    to: '/org/departments',
    permission: 'department:read',
  },
  {
    key: 'employees',
    label: '员工档案',
    icon: 'User',
    to: '/org/employees',
    permission: 'employee:read',
  },
  {
    key: 'org-chart',
    label: '组织架构图',
    icon: 'Share',
    to: '/org/employees/org-chart',
    permission: 'employee:read',
  },
  {
    key: 'onboarding',
    label: '入职管理',
    icon: 'UserFilled',
    to: '/org/onboarding',
    permission: 'onboarding:read',
  },
  {
    key: 'regularizations',
    label: '转正管理',
    icon: 'Check',
    to: '/org/regularizations',
    permission: 'regularization:read',
  },
  {
    key: 'transfers',
    label: '调动管理',
    icon: 'Switch',
    to: '/org/transfers',
    permission: 'transfer:read',
  },
  {
    key: 'offboarding',
    label: '离职管理',
    icon: 'Back',
    to: '/org/offboarding',
    permission: 'offboarding:read',
  },
  {
    key: 'contracts',
    label: '合同管理',
    icon: 'Document',
    to: '/org/contracts',
    permission: 'contract:read',
  },
];

/**
 * 菜单过滤：dept_head 仅有 employee:read:self-dept，无 company:read
 */
export function filterOrgMenu(user: UserInfo | null): OrgMenuItem[] {
  return ORG_MENU.filter((item) => {
    if (item.permission === 'department:read') {
      return (
        hasPermission(user, 'department:read') || hasPermission(user, 'employee:read:self-dept')
      );
    }
    if (item.permission === 'employee:read') {
      return hasPermission(user, 'employee:read') || hasPermission(user, 'employee:read:self-dept');
    }
    return hasPermission(user, item.permission);
  });
}

export function resolveOrgActiveKey(path: string): string {
  if (path.startsWith('/org/companies')) {
    return 'companies';
  }
  if (path.startsWith('/org/departments')) {
    return 'departments';
  }
  if (path.startsWith('/org/employees/org-chart')) {
    return 'org-chart';
  }
  if (path.startsWith('/org/employees')) {
    return 'employees';
  }
  if (path.startsWith('/org/onboarding')) {
    return 'onboarding';
  }
  if (path.startsWith('/org/regularizations')) {
    return 'regularizations';
  }
  if (path.startsWith('/org/transfers')) {
    return 'transfers';
  }
  if (path.startsWith('/org/offboarding')) {
    return 'offboarding';
  }
  if (path.startsWith('/org/contracts')) {
    return 'contracts';
  }
  return '';
}

const organizationRoutes: RouteRecordRaw[] = [
  {
    path: '/org',
    component: () => import('@/layouts/OrganizationLayout.vue'),
    meta: { requiresAuth: true, title: '组织人事' },
    children: [
      { path: '', redirect: '/org/companies' },
      {
        path: 'companies',
        name: 'CompanyList',
        component: () => import('@/views/organization/companies/CompanyList.vue'),
        meta: { title: '法人公司' },
      },
      {
        path: 'companies/:id/tree',
        name: 'CompanyTree',
        component: () => import('@/views/organization/companies/CompanyTree.vue'),
        meta: { title: '公司组织树' },
      },
      {
        path: 'companies/:id',
        name: 'CompanyDetail',
        component: () => import('@/views/organization/companies/CompanyDetail.vue'),
        meta: { title: '公司详情' },
      },
      {
        path: 'departments',
        name: 'DepartmentTree',
        component: () => import('@/views/organization/departments/DepartmentTree.vue'),
        meta: { title: '部门管理' },
      },
      {
        path: 'departments/:id',
        name: 'DepartmentDetail',
        component: () => import('@/views/organization/departments/DepartmentDetail.vue'),
        meta: { title: '部门详情' },
      },
      {
        path: 'employees/org-chart',
        name: 'EmployeeOrgChart',
        component: () => import('@/views/organization/employees/EmployeeOrgChart.vue'),
        meta: { title: '组织架构图' },
      },
      {
        path: 'employees',
        name: 'EmployeeList',
        component: () => import('@/views/organization/employees/EmployeeList.vue'),
        meta: { title: '员工档案' },
      },
      {
        path: 'employees/:id',
        name: 'EmployeeDetail',
        component: () => import('@/views/organization/employees/EmployeeDetail.vue'),
        meta: { title: '员工详情' },
      },
      {
        path: 'onboarding',
        name: 'OnboardingList',
        component: () => import('@/views/organization/onboarding/OnboardingList.vue'),
        meta: { title: '入职管理' },
      },
      {
        path: 'onboarding/:id',
        name: 'OnboardingDetail',
        component: () => import('@/views/organization/onboarding/OnboardingDetail.vue'),
        meta: { title: '入职详情' },
      },
      {
        path: 'regularizations',
        name: 'RegularizationList',
        component: () => import('@/views/organization/regularization/RegularizationList.vue'),
        meta: { title: '转正管理' },
      },
      {
        path: 'regularizations/:id',
        name: 'RegularizationDetail',
        component: () => import('@/views/organization/regularization/RegularizationDetail.vue'),
        meta: { title: '转正详情' },
      },
      {
        path: 'transfers',
        name: 'TransferList',
        component: () => import('@/views/organization/transfer/TransferList.vue'),
        meta: { title: '调动管理' },
      },
      {
        path: 'transfers/:id',
        name: 'TransferDetail',
        component: () => import('@/views/organization/transfer/TransferDetail.vue'),
        meta: { title: '调动详情' },
      },
      {
        path: 'offboarding',
        name: 'OffboardingList',
        component: () => import('@/views/organization/offboarding/OffboardingList.vue'),
        meta: { title: '离职管理' },
      },
      {
        path: 'offboarding/:id/certificate',
        name: 'OffboardingCertificate',
        component: () => import('@/views/organization/offboarding/OffboardingCertificate.vue'),
        meta: { title: '离职证明' },
      },
      {
        path: 'offboarding/:id',
        name: 'OffboardingDetail',
        component: () => import('@/views/organization/offboarding/OffboardingDetail.vue'),
        meta: { title: '离职详情' },
      },
      {
        path: 'contracts',
        name: 'ContractList',
        component: () => import('@/views/organization/contract/ContractList.vue'),
        meta: { title: '合同管理' },
      },
      {
        path: 'contracts/:id',
        name: 'ContractDetail',
        component: () => import('@/views/organization/contract/ContractDetail.vue'),
        meta: { title: '合同详情' },
      },
    ],
  },
];

export default organizationRoutes;
