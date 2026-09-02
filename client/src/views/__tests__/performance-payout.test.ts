/**
 * 绩效奖金视图 + 菜单（M5-2-D3）内联断言
 *
 * 覆盖要点：
 *  - 4 个新视图组件可被 import（Vite 默认导出 object）
 *  - PAYOUT_STATUS_MAP 5 态完整（与 D1 状态映射独立）
 *  - filterPerformanceMenu D3 菜单可见性：
 *      admin → 5 D1 + 1 D2 + 3 D3 = 9（含 grade-actions / payouts / payout-config）
 *      hr    → 同 admin（admin * 通配，hr 全开 payout:write）
 *      executive → 5 D1 + 0 D2 + 1 D3（grade-actions 因 grade:calculate + payouts 因 payout:read；但无 payout:write）
 *                  → mock 含 payout:read/calculate/settle → 实际见 grade-actions + payouts = 2 项
 *      dept_head → 4 D1 + 0 D2 + 0 D3（无 grade:calculate / payout:read）
 *      employee → 0（除非带 record:read + payout:read → D2 records + D3 payouts 共 2 项）
 *  - **M5-2-D4 调整**：路由总 children 12 → 15（children 计数断言已更新）
 *  - **M5-2-D5 调整**：D5 追加 3 个只读菜单，路由总 children 15 → 18
 */
import performanceRoutes, {
  PERFORMANCE_D3_MENU,
  filterPerformanceMenu,
  resolvePerformanceActiveKey,
} from '@/router/performance';
import { PAYOUT_STATUS_MAP } from '@/api/types/performancePayout';
import type { UserInfo } from '@/api/types';
import GradeActions from '@/views/performance/grade/GradeActions.vue';
import PayoutConfig from '@/views/performance/payout/PayoutConfig.vue';
import PayoutList from '@/views/performance/payout/PayoutList.vue';
import PayoutDetail from '@/views/performance/payout/PayoutDetail.vue';

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

describe('views/__tests__/performance-payout.test.ts', () => {
  it('4 个 D3 视图组件可被导入（Vite 默认导出对象）', () => {
    expectEqual(typeof GradeActions, 'object', 'GradeActions');
    expectEqual(typeof PayoutConfig, 'object', 'PayoutConfig');
    expectEqual(typeof PayoutList, 'object', 'PayoutList');
    expectEqual(typeof PayoutDetail, 'object', 'PayoutDetail');
  });

  it('PAYOUT_STATUS_MAP 五态完整', () => {
    expectEqual(PAYOUT_STATUS_MAP.draft.label, '草稿', 'draft');
    expectEqual(PAYOUT_STATUS_MAP.calculated.label, '已计算', 'calculated');
    expectEqual(PAYOUT_STATUS_MAP.prepaid.label, '已预发', 'prepaid');
    expectEqual(PAYOUT_STATUS_MAP.settled.label, '已结算', 'settled');
    expectEqual(PAYOUT_STATUS_MAP.cancelled.label, '已取消', 'cancelled');
    expectEqual(Object.keys(PAYOUT_STATUS_MAP).length, 5, '5 status');
  });

  it('PERFORMANCE_D3_MENU 3 项 + 权限点无 finance', () => {
    expectEqual(PERFORMANCE_D3_MENU.length, 3, '3 D3 菜单');
    expectEqual(
      PERFORMANCE_D3_MENU.map((m) => m.permission).join(',').includes('finance'),
      false,
      'no finance',
    );
    expectEqual(
      PERFORMANCE_D3_MENU.map((m) => m.key).join(','),
      'grade-actions,payouts,payout-config',
      '3 menu keys',
    );
    expectEqual(
      PERFORMANCE_D3_MENU.map((m) => m.to).join(','),
      '/performance/grade-actions,/performance/payouts,/performance/payout-config',
      '3 menu to paths',
    );
    // payouts 有 employeeLabel
    expectEqual(
      PERFORMANCE_D3_MENU.find((m) => m.key === 'payouts')?.employeeLabel,
      '我的奖金',
      'payouts.employeeLabel',
    );
  });

  it('filterPerformanceMenu 5 角色 RBAC：admin/hr 15 项 / executive 13 / dept_head 10 / employee 5（M5-2-D5 追加 3 菜单）', () => {
    const admin = filterPerformanceMenu(mockUser(['admin'], ['*']));
    expectEqual(admin.length, 15, 'admin 15 项（含 D5 三件套）');
    const adminKeys = admin.map((m) => m.key).join(',');
    expectTrue(adminKeys.includes('grade-actions'), 'admin 含 grade-actions');
    expectTrue(adminKeys.includes('payouts'), 'admin 含 payouts');
    expectTrue(adminKeys.includes('payout-config'), 'admin 含 payout-config');
    expectTrue(adminKeys.includes('applications-adjustments'), 'admin 含调薪联动');
    expectTrue(adminKeys.includes('applications-promotions'), 'admin 含晋升提名');
    expectTrue(adminKeys.includes('applications-pips'), 'admin 含 PIP 管理');

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
        // M5-2-D4 追加 3 菜单权限点
        'performance:sales:product:read',
        'performance:sales:payment:read',
        'performance:sales:commission:read',
        'performance:salary-adjustment:read',
        'performance:promotion:read',
        'performance:pip:read',
      ]),
    );
    expectEqual(hr.length, 15, 'hr 15 项（含 D3 + D4 + D5 三件套）');
    expectTrue(hr.map((m) => m.key).includes('payout-config'), 'hr 含 payout-config');
    expectTrue(hr.map((m) => m.key).includes('applications-adjustments'), 'hr 含调薪联动');
    expectTrue(hr.map((m) => m.key).includes('applications-promotions'), 'hr 含晋升提名');
    expectTrue(hr.map((m) => m.key).includes('applications-pips'), 'hr 含 PIP 管理');

    // executive：mock 含 D1（5） + 0 D2（无 record:read）+ D3 两项（无 payout:write）+ D4 三件套 + D5 三件套 = 13
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
          'performance:grade:calculate',
          'performance:payout:read',
          'performance:payout:calculate',
          'performance:payout:settle',
          // M5-2-D4 追加 3 菜单权限点
          'performance:sales:product:read',
          'performance:sales:payment:read',
          'performance:sales:commission:read',
          'performance:salary-adjustment:read',
          'performance:promotion:read',
          'performance:pip:read',
        ],
      ),
    );
    expectEqual(executive.length, 13, 'executive 13 项（含 D4 + D5 三件套，**不含 records / payout-config**）');
    const execKeys = executive.map((m) => m.key);
    expectTrue(execKeys.includes('grade-actions'), 'exec 含 grade-actions');
    expectTrue(execKeys.includes('payouts'), 'exec 含 payouts');
    expectTrue(execKeys.includes('applications-adjustments'), 'exec 含调薪联动');
    expectTrue(execKeys.includes('applications-promotions'), 'exec 含晋升提名');
    expectTrue(execKeys.includes('applications-pips'), 'exec 含 PIP 管理');
    expectTrue(!execKeys.includes('payout-config'), 'exec **不含** payout-config（payout:write 仅 admin/hr）');

    const deptHead = filterPerformanceMenu(
      mockUser(
        ['dept_head'],
        [
          'performance:cycle:read',
          'performance:indicator:read',
          'performance:scheme:read',
          'performance:coefficient:read',
          // M5-2-D4 追加 3 菜单权限点
          'performance:sales:product:read',
          'performance:sales:payment:read',
          'performance:sales:commission:read',
          'performance:salary-adjustment:read',
          'performance:promotion:read',
          'performance:pip:read',
        ],
      ),
    );
    expectEqual(deptHead.length, 10, 'dept_head 10 项（含 D4 + D5 三件套，无 D2/D3）');
    const headKeys = deptHead.map((m) => m.key).join(',');
    expectTrue(headKeys.includes('applications-adjustments'), 'dept_head 含调薪联动');
    expectTrue(headKeys.includes('applications-promotions'), 'dept_head 含晋升提名');
    expectTrue(headKeys.includes('applications-pips'), 'dept_head 含 PIP 管理');
    expectTrue(!headKeys.includes('grade-actions'), 'dept_head 不含 grade-actions');
    expectTrue(!headKeys.includes('payouts'), 'dept_head 不含 payouts');

    // employee 带 payout:read + sales:product:read + D5 三件套 → 见 payouts（我的奖金）+ sales-products + D5
    const employee = filterPerformanceMenu(
      mockUser(
        ['employee'],
        [
          'performance:payout:read',
          'performance:sales:product:read',
          'performance:salary-adjustment:read',
          'performance:promotion:read',
          'performance:pip:read',
        ],
      ),
    );
    expectEqual(employee.length, 5, 'employee 5 项（payouts「我的奖金」+ sales-products + D5 三件套）');
    expectEqual(employee[0].label, '我的奖金', 'employee 显示「我的奖金」');
    expectEqual(employee[0].key, 'payouts', 'payouts');
    expectTrue(employee.some((item) => item.key === 'applications-adjustments'), 'employee 含调薪联动');
    expectTrue(employee.some((item) => item.key === 'applications-promotions'), 'employee 含晋升提名');
    expectTrue(employee.some((item) => item.key === 'applications-pips'), 'employee 含 PIP 管理');

    const employeeNone = filterPerformanceMenu(mockUser(['employee'], []));
    expectEqual(employeeNone.length, 0, 'employee 无权限 → 0 项');
  });

  it('resolvePerformanceActiveKey D3 3 分支：grade-actions / payouts / payout-config', () => {
    expectEqual(
      resolvePerformanceActiveKey('/performance/grade-actions'),
      'grade-actions',
      'grade-actions',
    );
    expectEqual(
      resolvePerformanceActiveKey('/performance/payout-config'),
      'payout-config',
      'payout-config',
    );
    expectEqual(
      resolvePerformanceActiveKey('/performance/payouts'),
      'payouts',
      'payouts',
    );
    expectEqual(
      resolvePerformanceActiveKey('/performance/payouts/p123'),
      'payouts',
      'payouts/:id (前缀匹配)',
    );
    expectEqual(resolvePerformanceActiveKey('/performance/cycles'), 'cycles', 'cycles 不变');
    expectEqual(resolvePerformanceActiveKey('/performance/records'), 'records', 'records 不变');
  });

  it('路由表 children 计数：1 redirect + 5 D1 + 2 D2 + 4 D3 + 3 D4 + 3 D5 = 18', () => {
    const children = performanceRoutes[0].children ?? [];
    expectEqual(children.length, 18, '1 redirect + 5 D1 + 2 D2 + 4 D3 + 3 D4 + 3 D5 = 18 children');
    const paths = children.map((c) => c.path ?? '').join(',');
    expectTrue(paths.includes('grade-actions'), 'children 含 grade-actions');
    expectTrue(paths.includes('payout-config'), 'children 含 payout-config');
    expectTrue(paths.includes('payouts'), 'children 含 payouts');
    expectTrue(paths.includes('payouts/:id' as string) || children.some((c) => String(c.path) === 'payouts/:id'), 'children 含 payouts/:id');
    // M5-2-D4 新增 3 路由
    expectTrue(paths.includes('sales-products'), 'children 含 sales-products');
    expectTrue(paths.includes('sales-payments'), 'children 含 sales-payments');
    expectTrue(paths.includes('sales-commissions'), 'children 含 sales-commissions');
    // M5-2-D5 新增 3 路由
    expectTrue(paths.includes('applications-adjustments'), 'children 含 applications-adjustments');
    expectTrue(paths.includes('applications-promotions'), 'children 含 applications-promotions');
    expectTrue(paths.includes('applications-pips'), 'children 含 applications-pips');
  });
});

export async function runPerformancePayoutViewTests(): Promise<number> {
  await Promise.all(cases.map((item) => Promise.resolve(item.fn())));
  return cases.length;
}