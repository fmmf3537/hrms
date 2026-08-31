/**
 * 组织人事路由 + 5 角色菜单单测（M5-2-A1）
 */
import organizationRoutes, {
  filterOrgMenu,
  ORG_MENU,
  resolveOrgActiveKey,
} from '@/router/organization';
import type { UserInfo } from '@/api/types';

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

describe('views/organization + router/organization.ts', () => {
  it('默认重定向 /org/companies，且含公司/部门/员工路由', () => {
    const children = organizationRoutes[0].children ?? [];
    expectEqual(children[0]?.redirect, '/org/companies', 'redirect');
    const names = children.map((c) => c.name).filter(Boolean);
    expectEqual(names.includes('CompanyList'), true, 'CompanyList');
    expectEqual(names.includes('DepartmentTree'), true, 'DepartmentTree');
    expectEqual(names.includes('EmployeeList'), true, 'EmployeeList');
    expectEqual(names.includes('EmployeeOrgChart'), true, 'OrgChart');
  });

  it('org-chart 注册在 employees/:id 之前', () => {
    const children = organizationRoutes[0].children ?? [];
    const chartIdx = children.findIndex((c) => c.path === 'employees/org-chart');
    const detailIdx = children.findIndex((c) => c.path === 'employees/:id');
    expectEqual(chartIdx >= 0 && chartIdx < detailIdx, true, 'order');
  });

  it('5 角色菜单：admin 全开 / employee 无 / 无 finance', () => {
    const admin = filterOrgMenu(mockUser(['admin'], ['*']));
    expectEqual(admin.length, ORG_MENU.length, 'admin all');
    const employee = filterOrgMenu(mockUser(['employee'], ['profile:read:self']));
    expectEqual(employee.length, 0, 'employee none');
    const deptHead = filterOrgMenu(mockUser(['dept_head'], ['employee:read:self-dept']));
    expectEqual(
      deptHead.some((m) => m.key === 'companies'),
      false,
      'dept_head no company:read',
    );
    expectEqual(
      deptHead.some((m) => m.key === 'employees'),
      true,
      'dept_head employees',
    );
    const allPerms = ORG_MENU.map((m) => m.permission).join(',');
    expectEqual(allPerms.includes('finance'), false, 'no finance perm');
  });

  it('activeKey：列表页渲染路径映射正确', () => {
    expectEqual(resolveOrgActiveKey('/org/companies/x'), 'companies', 'company');
    expectEqual(resolveOrgActiveKey('/org/departments'), 'departments', 'dept');
    expectEqual(resolveOrgActiveKey('/org/employees/org-chart'), 'org-chart', 'chart');
    expectEqual(resolveOrgActiveKey('/org/employees/e1'), 'employees', 'emp');
  });
});

export function runOrganizationTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const organizationTestCount = cases.length;
