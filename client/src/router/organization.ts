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
    ],
  },
];

export default organizationRoutes;
