import type { UserInfo } from '@/api/types';
import { getApplicationScope } from '@/api/types/performanceApplication';
import performanceRoutes, {
  PERFORMANCE_D5_MENU,
  filterPerformanceMenu,
  resolvePerformanceActiveKey,
} from '@/router/performance';
import AdjustmentList from '@/views/performance/application/AdjustmentList.vue';
import PromotionList from '@/views/performance/application/PromotionList.vue';
import PipList from '@/views/performance/application/PipList.vue';

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

function expectTrue(condition: boolean, message: string): void {
  if (!condition) throw new Error(`${message}: expected true`);
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
    employee: roles.includes('employee')
      ? { id: 'employee-self', employeeNo: 'E001', name: '本人' }
      : null,
  };
}

const d5ReadPermissions = [
  'performance:salary-adjustment:read',
  'performance:promotion:read',
  'performance:pip:read',
];

describe('views/performance/application', () => {
  it('3 个结果应用视图组件可被导入', () => {
    expectEqual(typeof AdjustmentList, 'object', 'AdjustmentList');
    expectEqual(typeof PromotionList, 'object', 'PromotionList');
    expectEqual(typeof PipList, 'object', 'PipList');
  });

  it('PERFORMANCE_D5_MENU 3 项权限点与路径正确且无 finance', () => {
    expectEqual(PERFORMANCE_D5_MENU.length, 3, '3 D5 菜单');
    expectEqual(
      PERFORMANCE_D5_MENU.map((item) => item.key).join(','),
      'applications-adjustments,applications-promotions,applications-pips',
      '3 menu keys',
    );
    expectEqual(
      PERFORMANCE_D5_MENU.map((item) => item.to).join(','),
      '/performance/applications-adjustments,/performance/applications-promotions,/performance/applications-pips',
      '3 menu paths',
    );
    expectEqual(
      PERFORMANCE_D5_MENU[0].permission,
      'performance:salary-adjustment:read',
      '调薪权限',
    );
    expectEqual(PERFORMANCE_D5_MENU[1].permission, 'performance:promotion:read', '晋升权限');
    expectEqual(PERFORMANCE_D5_MENU[2].permission, 'performance:pip:read', 'PIP 权限');
    expectTrue(
      !PERFORMANCE_D5_MENU.map((item) => item.permission)
        .join(',')
        .includes('finance'),
      '无 finance',
    );
  });

  it('5 角色均有 3 个 D5 菜单，employee 使用本人范围', () => {
    const roles = ['admin', 'hr', 'dept_head', 'executive', 'employee'];
    roles.forEach((role) => {
      const items = filterPerformanceMenu(
        mockUser([role], role === 'admin' ? ['*'] : d5ReadPermissions),
      );
      const keys = items.map((item) => item.key);
      expectTrue(keys.includes('applications-adjustments'), `${role} 包含调薪联动`);
      expectTrue(keys.includes('applications-promotions'), `${role} 包含晋升提名`);
      expectTrue(keys.includes('applications-pips'), `${role} 包含 PIP 管理`);
    });

    const employee = mockUser(['employee'], d5ReadPermissions);
    const scope = getApplicationScope(employee);
    expectTrue(scope.isEmployee, 'employee 是 ESS 范围');
    expectEqual(scope.selfEmployeeId, 'employee-self', 'employee 使用本人 employeeId');
  });

  it('resolvePerformanceActiveKey 3 分支与 children 15→18', () => {
    expectEqual(
      resolvePerformanceActiveKey('/performance/applications-adjustments'),
      'applications-adjustments',
      '调薪 active key',
    );
    expectEqual(
      resolvePerformanceActiveKey('/performance/applications-promotions'),
      'applications-promotions',
      '晋升 active key',
    );
    expectEqual(
      resolvePerformanceActiveKey('/performance/applications-pips'),
      'applications-pips',
      'PIP active key',
    );
    const children = performanceRoutes[0].children ?? [];
    expectEqual(children.length, 18, '1 redirect + 5 D1 + 2 D2 + 4 D3 + 3 D4 + 3 D5 = 18');
    const lastThree = children.slice(-3);
    expectEqual(lastThree[0].path, 'applications-adjustments', 'D5 调薪路由');
    expectEqual(lastThree[1].path, 'applications-promotions', 'D5 晋升路由');
    expectEqual(lastThree[2].path, 'applications-pips', 'D5 PIP 路由');
  });

  it('D5 追加在 D4 之后且不改变既有菜单顺序', () => {
    const children = performanceRoutes[0].children ?? [];
    const d4LastThree = children.slice(12, 15);
    expectEqual(
      d4LastThree.map((child) => child.path).join(','),
      'sales-products,sales-payments,sales-commissions',
      'D4 保持末尾',
    );
    expectEqual(
      resolvePerformanceActiveKey('/performance/sales-commissions'),
      'sales-commissions',
      'D4 active 不变',
    );
  });
});

export function runPerformanceApplicationViewTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}
