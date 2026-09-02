/**
 * 销售提成视图 + 路由/菜单单测（M5-2-D4）内联断言
 *
 * 覆盖要点（≥5 用例）：
 *  - 3 个 D4 视图组件可被导入（Vite 默认导出 object）
 *  - PERFORMANCE_D4_MENU 3 项 + 权限点无 finance
 *  - 5 角色菜单可见性：employee 仅见 product；dept_head 见 3 项但无写；executive 见 3 项（commission:write 可触发计算）
 *  - resolvePerformanceActiveKey D4 3 分支（sales-products / sales-payments / sales-commissions 互不前缀）
 *  - 路由表 children 计数：1 redirect + 5 D1 + 2 D2 + 4 D3 + 3 D4 + **3 D5 = 18**
 *  - 路由末尾断言：D5 三条在 idx 15-17
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

  it('5 角色菜单可见性：admin/hr 15 项 / executive 14 / dept_head 10 / employee 4（M5-2-D5 追加 3 菜单）', () => {
    // admin 通配，全开（5 D1 + 1 D2 + 3 D3 + 3 D4 + 3 D5 = 15）
    const admin = filterPerformanceMenu(mockUser(['admin'], ['*']));
    expectEqual(admin.length, 15, 'admin 15 菜单');
    const adminKeys = admin.map((m) => m.key);
    expectTrue(adminKeys.includes('sales-products'), 'admin 含 sales-products');
    expectTrue(adminKeys.includes('sales-payments'), 'admin 含 sales-payments');
    expectTrue(adminKeys.includes('sales-commissions'), 'admin 含 sales-commissions');
    expectTrue(adminKeys.includes('applications-adjustments'), 'admin 含调薪联动');
    expectTrue(adminKeys.includes('applications-promotions'), 'admin 含晋升提名');
    expectTrue(adminKeys.includes('applications-pips'), 'admin 含 PIP 管理');

    // hr: D1 5 + D2 records + D3 三件套 + D4 三件套 + D5 三件套 = 15（mock 含全部权限点）
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
        'performance:salary-adjustment:read',
        'performance:promotion:read',
        'performance:pip:read',
      ]),
    );
    expectEqual(hr.length, 15, 'hr 15 菜单');
    expectTrue(hr.map((m) => m.key).includes('sales-products'), 'hr 含 sales-products');
    expectTrue(hr.map((m) => m.key).includes('sales-payments'), 'hr 含 sales-payments');
    expectTrue(hr.map((m) => m.key).includes('sales-commissions'), 'hr 含 sales-commissions');
    expectTrue(hr.map((m) => m.key).includes('applications-adjustments'), 'hr 含调薪联动');
    expectTrue(hr.map((m) => m.key).includes('applications-promotions'), 'hr 含晋升提名');
    expectTrue(hr.map((m) => m.key).includes('applications-pips'), 'hr 含 PIP 管理');

    // executive: D1 5 + D2 records + D3 grade/payouts（无 payout-config）+ D4 3 项 + D5 3 项 = 14
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
          'performance:salary-adjustment:read',
          'performance:promotion:read',
          'performance:pip:read',
        ],
      ),
    );
    expectEqual(executive.length, 14, 'executive 14 菜单');
    const execKeys = executive.map((m) => m.key);
    expectTrue(execKeys.includes('sales-products'), 'exec 含 sales-products');
    expectTrue(execKeys.includes('sales-payments'), 'exec 含 sales-payments');
    expectTrue(execKeys.includes('sales-commissions'), 'exec 含 sales-commissions');
    expectTrue(execKeys.includes('applications-adjustments'), 'exec 含调薪联动');
    expectTrue(execKeys.includes('applications-promotions'), 'exec 含晋升提名');
    expectTrue(execKeys.includes('applications-pips'), 'exec 含 PIP 管理');
    expectFalse(execKeys.includes('payout-config'), 'exec 不含 payout-config（D3 已知）');

    // dept_head: D1 4 + D4 3 项 + D5 3 项 = 10（无 D2 records、无 D3）
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
          'performance:salary-adjustment:read',
          'performance:promotion:read',
          'performance:pip:read',
        ],
      ),
    );
    expectEqual(deptHead.length, 10, 'dept_head 4 + 3 D4 + 3 D5 = 10');
    const headKeys = deptHead.map((m) => m.key).join(',');
    expectTrue(headKeys.includes('sales-products'), 'dept_head 含 sales-products');
    expectTrue(headKeys.includes('sales-payments'), 'dept_head 含 sales-payments');
    expectTrue(headKeys.includes('sales-commissions'), 'dept_head 含 sales-commissions');
    expectTrue(headKeys.includes('applications-adjustments'), 'dept_head 含调薪联动');
    expectTrue(headKeys.includes('applications-promotions'), 'dept_head 含晋升提名');
    expectTrue(headKeys.includes('applications-pips'), 'dept_head 含 PIP 管理');

    // employee: sales-products + D5 三件套 = 4 项；无 sales-payments/commissions（无 read 权限）
    const employee = filterPerformanceMenu(
      mockUser(
        ['employee'],
        [
          'performance:sales:product:read',
          'performance:salary-adjustment:read',
          'performance:promotion:read',
          'performance:pip:read',
        ],
      ),
    );
    expectEqual(employee.length, 4, 'employee 4 项（sales-products + D5 三件套）');
    expectEqual(employee[0].key, 'sales-products', 'employee 仅 sales-products');
    expectTrue(employee.some((item) => item.key === 'applications-adjustments'), 'employee 含调薪联动');
    expectTrue(employee.some((item) => item.key === 'applications-promotions'), 'employee 含晋升提名');
    expectTrue(employee.some((item) => item.key === 'applications-pips'), 'employee 含 PIP 管理');

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

  it('路由表 children 18 = 1 redirect + 5 D1 + 2 D2 + 4 D3 + 3 D4 + 3 D5；D5 末 3 条 idx 15-17', () => {
    const children = performanceRoutes[0].children ?? [];
    expectEqual(children.length, 18, '1 redirect + 5 D1 + 2 D2 + 4 D3 + 3 D4 + 3 D5 = 18 children');

    // D5 三条路由位置：idx 15 / 16 / 17（末尾 3 条）
    const last3 = children.slice(-3);
    expectEqual(last3[0].path, 'applications-adjustments', 'idx 15 path=applications-adjustments');
    expectEqual(last3[1].path, 'applications-promotions', 'idx 16 path=applications-promotions');
    expectEqual(last3[2].path, 'applications-pips', 'idx 17 path=applications-pips');

    // 与 D3 路由边界对比：D3 仍占 idx 8-11，D4 占 idx 12-14
    const d3Last = children.slice(8, 12);
    expectEqual(d3Last[0].path, 'grade-actions', 'idx 8 path=grade-actions');
    expectEqual(d3Last[1].path, 'payout-config', 'idx 9 path=payout-config');
    expectEqual(d3Last[2].path, 'payouts', 'idx 10 path=payouts');
    expectEqual(d3Last[3].path, 'payouts/:id', 'idx 11 path=payouts/:id');

    // D5 菜单 to（admin mock 全开）
    const adminItems = filterPerformanceMenu(mockUser(['admin'], ['*']));
    const tos = adminItems.map((m) => m.to).join(',');
    expectTrue(tos.includes('/performance/sales-products'), 'admin tos 含 sales-products');
    expectTrue(tos.includes('/performance/sales-payments'), 'admin tos 含 sales-payments');
    expectTrue(tos.includes('/performance/sales-commissions'), 'admin tos 含 sales-commissions');
    expectTrue(tos.includes('/performance/applications-adjustments'), 'admin tos 含 applications-adjustments');
    expectTrue(tos.includes('/performance/applications-promotions'), 'admin tos 含 applications-promotions');
    expectTrue(tos.includes('/performance/applications-pips'), 'admin tos 含 applications-pips');
  });
});

export async function runPerformanceSalesViewTests(): Promise<number> {
  await Promise.all(cases.map((item) => Promise.resolve(item.fn())));
  return cases.length;
}

export const performanceSalesViewTestCount = cases.length;
