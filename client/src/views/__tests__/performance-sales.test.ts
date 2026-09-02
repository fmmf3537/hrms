/**
 * 销售提成视图 + 路由/菜单单测（M5-2-D4）内联断言
 *
 * 覆盖要点（≥5 用例）：
 *  - 3 个 D4 视图组件可被导入（Vite 默认导出 object）
 *  - PERFORMANCE_D4_MENU 3 项 + 权限点无 finance
 *  - 5 角色菜单可见性：employee 仅见 product；dept_head 见 3 项但无写；executive 见 3 项（commission:write 可触发计算）
 *  - resolvePerformanceActiveKey D4 3 分支（sales-products / sales-payments / sales-commissions 互不前缀）
 *  - 路由表 children 计数：1 redirect + 5 D1 + 2 D2 + 4 D3 + **3 D4 = 15**
 *  - 路由末尾断言：D4 三条在 idx 12-14
 */
import performanceRoutes, {
  PERFORMANCE_D4_MENU,
  filterPerformanceMenu,
  resolvePerformanceActiveKey,
} from '@/router/performance';
import type { UserInfo } from '@/api/types';
import ProductList from '@/views/performance/sales/ProductList.vue';
import PaymentList from '@/views/performance/sales/PaymentList.vue';
import CommissionList from '@/views/performance/sales/CommissionList.vue';

interface Case {
  name: string;
  fn: () => void | Promise<void>;
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

function expectTrue(cond: boolean, message: string): void {
  if (!cond) throw new Error(`${message}: expected true`);
}

function expectFalse(cond: boolean, message: string): void {
  if (cond) throw new Error(`${message}: expected false`);
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
    employee: null,
  };
}

describe('views/__tests__/performance-sales.test.ts', () => {
  it('3 个 D4 视图组件可被导入（Vite 默认导出对象）', () => {
    expectEqual(typeof ProductList, 'object', 'ProductList');
    expectEqual(typeof PaymentList, 'object', 'PaymentList');
    expectEqual(typeof CommissionList, 'object', 'CommissionList');
  });

  it('PERFORMANCE_D4_MENU 3 项 + 权限点无 finance', () => {
    expectEqual(PERFORMANCE_D4_MENU.length, 3, '3 D4 菜单');
    expectEqual(
      PERFORMANCE_D4_MENU.map((m) => m.permission).join(',').includes('finance'),
      false,
      'no finance',
    );
    expectEqual(
      PERFORMANCE_D4_MENU.map((m) => m.key).join(','),
      'sales-products,sales-payments,sales-commissions',
      '3 menu keys',
    );
    expectEqual(
      PERFORMANCE_D4_MENU.map((m) => m.to).join(','),
      '/performance/sales-products,/performance/sales-payments,/performance/sales-commissions',
      '3 menu to paths',
    );

    // 权限点拼写与后端 PERMISSIONS 常量一致
    expectEqual(
      PERFORMANCE_D4_MENU.find((m) => m.key === 'sales-products')?.permission,
      'performance:sales:product:read',
      'sales-products perm',
    );
    expectEqual(
      PERFORMANCE_D4_MENU.find((m) => m.key === 'sales-payments')?.permission,
      'performance:sales:payment:read',
      'sales-payments perm',
    );
    expectEqual(
      PERFORMANCE_D4_MENU.find((m) => m.key === 'sales-commissions')?.permission,
      'performance:sales:commission:read',
      'sales-commissions perm',
    );
  });

  it('5 角色菜单可见性：admin/hr 5+1+3+3=12 / executive +D4=11 / dept_head 4+3=7 / employee 仅 1（product）', () => {
    // admin 通配，全开（5 D1 + 1 D2 + 3 D3 + 3 D4 = 12）
    const admin = filterPerformanceMenu(mockUser(['admin'], ['*']));
    expectEqual(admin.length, 12, 'admin 12 菜单');
    const adminKeys = admin.map((m) => m.key);
    expectTrue(adminKeys.includes('sales-products'), 'admin 含 sales-products');
    expectTrue(adminKeys.includes('sales-payments'), 'admin 含 sales-payments');
    expectTrue(adminKeys.includes('sales-commissions'), 'admin 含 sales-commissions');

    // hr: D1 5 + D2 records + D3 三件套 + D4 三件套 = 12（mock 含全部权限点）
    const hr = filterPerformanceMenu(
      mockUser(['hr'], [
        'performance:cycle:read',
        'performance:indicator:read',
        'performance:scheme:read',
        'performance:coefficient:read',
        'performance:coefficient:write',
        'performance:grade:threshold:read',
        'performance:grade:threshold:write',
        'performance:record:read',
        'performance:grade:calculate',
        'performance:payout:read',
        'performance:payout:write',
        'performance:payout:calculate',
        'performance:payout:settle',
        'performance:sales:product:read',
        'performance:sales:payment:read',
        'performance:sales:commission:read',
      ]),
    );
    expectEqual(hr.length, 12, 'hr 12 菜单');
    expectTrue(hr.map((m) => m.key).includes('sales-products'), 'hr 含 sales-products');
    expectTrue(hr.map((m) => m.key).includes('sales-payments'), 'hr 含 sales-payments');
    expectTrue(hr.map((m) => m.key).includes('sales-commissions'), 'hr 含 sales-commissions');

    // executive: D1 5 + D2 records + D3 grade/payouts（无 payout-config）+ D4 3 项 = 11
    // （commission:read 是 executive 权限 → 可见 sales-commissions 菜单）
    const executive = filterPerformanceMenu(
      mockUser(
        ['executive'],
        [
          'performance:cycle:read',
          'performance:indicator:read',
          'performance:scheme:read',
          'performance:coefficient:read',
          'performance:coefficient:write',
          'performance:grade:threshold:read',
          'performance:record:read',
          'performance:grade:calculate',
          'performance:payout:read',
          'performance:payout:calculate',
          'performance:payout:settle',
          'performance:sales:product:read',
          'performance:sales:payment:read',
          'performance:sales:commission:read',
          'performance:sales:commission:write',
        ],
      ),
    );
    expectEqual(executive.length, 11, 'executive 11 菜单');
    const execKeys = executive.map((m) => m.key);
    expectTrue(execKeys.includes('sales-products'), 'exec 含 sales-products');
    expectTrue(execKeys.includes('sales-payments'), 'exec 含 sales-payments');
    expectTrue(execKeys.includes('sales-commissions'), 'exec 含 sales-commissions');
    expectFalse(execKeys.includes('payout-config'), 'exec 不含 payout-config（D3 已知）');

    // dept_head: D1 4 + D4 3 项 = 7（无 D2 records → 因为 mock 不含 record:read，无 D3）
    const deptHead = filterPerformanceMenu(
      mockUser(
        ['dept_head'],
        [
          'performance:cycle:read',
          'performance:indicator:read',
          'performance:scheme:read',
          'performance:coefficient:read',
          'performance:sales:product:read',
          'performance:sales:payment:read',
          'performance:sales:commission:read',
        ],
      ),
    );
    expectEqual(deptHead.length, 7, 'dept_head 4 + 3 D4 = 7');
    const headKeys = deptHead.map((m) => m.key).join(',');
    expectTrue(headKeys.includes('sales-products'), 'dept_head 含 sales-products');
    expectTrue(headKeys.includes('sales-payments'), 'dept_head 含 sales-payments');
    expectTrue(headKeys.includes('sales-commissions'), 'dept_head 含 sales-commissions');

    // employee: 仅 sales-products（1 项）；无 sales-payments/commissions（无 read 权限）
    const employee = filterPerformanceMenu(
      mockUser(['employee'], ['performance:sales:product:read']),
    );
    expectEqual(employee.length, 1, 'employee 仅 1 项（sales-products）');
    expectEqual(employee[0].key, 'sales-products', 'employee 仅 sales-products');

    // employee 无权限 → 0 项
    const employeeNone = filterPerformanceMenu(mockUser(['employee'], []));
    expectEqual(employeeNone.length, 0, 'employee 无权限 → 0 项');
  });

  it('resolvePerformanceActiveKey D4 3 分支：sales-products / sales-payments / sales-commissions 互不前缀', () => {
    expectEqual(
      resolvePerformanceActiveKey('/performance/sales-products'),
      'sales-products',
      'sales-products',
    );
    expectEqual(
      resolvePerformanceActiveKey('/performance/sales-payments'),
      'sales-payments',
      'sales-payments',
    );
    expectEqual(
      resolvePerformanceActiveKey('/performance/sales-commissions'),
      'sales-commissions',
      'sales-commissions',
    );
    // 顺序安全：sales-payments 不会误匹配 sales-products
    expectEqual(
      resolvePerformanceActiveKey('/performance/sales-products/x'),
      'sales-products',
      'sales-products/* 前缀仍 OK',
    );
    expectEqual(
      resolvePerformanceActiveKey('/performance/sales-payments/x'),
      'sales-payments',
      'sales-payments/* 前缀仍 OK',
    );
    // 不变区回归
    expectEqual(resolvePerformanceActiveKey('/performance/cycles'), 'cycles', 'cycles 不变');
    expectEqual(resolvePerformanceActiveKey('/performance/payouts'), 'payouts', 'payouts 不变');
    expectEqual(resolvePerformanceActiveKey('/performance/records'), 'records', 'records 不变');
  });

  it('路由表 children 15 = 1 redirect + 5 D1 + 2 D2 + 4 D3 + 3 D4；D4 末 3 条 idx 12-14', () => {
    const children = performanceRoutes[0].children ?? [];
    expectEqual(children.length, 15, '1 redirect + 5 D1 + 2 D2 + 4 D3 + 3 D4 = 15 children');

    // D4 三条路由位置：idx 12 / 13 / 14（末尾 3 条）
    const last3 = children.slice(-3);
    expectEqual(last3[0].path, 'sales-products', 'idx 12 path=sales-products');
    expectEqual(last3[1].path, 'sales-payments', 'idx 13 path=sales-payments');
    expectEqual(last3[2].path, 'sales-commissions', 'idx 14 path=sales-commissions');

    // 与 D3 路由边界对比：D3 仍占 idx 8-11，D4 追加在末尾
    const d3Last = children.slice(8, 12);
    expectEqual(d3Last[0].path, 'grade-actions', 'idx 8 path=grade-actions');
    expectEqual(d3Last[1].path, 'payout-config', 'idx 9 path=payout-config');
    expectEqual(d3Last[2].path, 'payouts', 'idx 10 path=payouts');
    expectEqual(d3Last[3].path, 'payouts/:id', 'idx 11 path=payouts/:id');

    // 6 D4 菜单 to（admin mock 全开）：包含 3 D4 路径
    const adminItems = filterPerformanceMenu(mockUser(['admin'], ['*']));
    const tos = adminItems.map((m) => m.to).join(',');
    expectTrue(tos.includes('/performance/sales-products'), 'admin tos 含 sales-products');
    expectTrue(tos.includes('/performance/sales-payments'), 'admin tos 含 sales-payments');
    expectTrue(tos.includes('/performance/sales-commissions'), 'admin tos 含 sales-commissions');
  });
});

export async function runPerformanceSalesViewTests(): Promise<number> {
  await Promise.all(cases.map((item) => Promise.resolve(item.fn())));
  return cases.length;
}

export const performanceSalesViewTestCount = cases.length;
