/**
 * 绩效视图 + 状态映射单测（M5-2-D1 + D2）内联断言
 *
 * 覆盖要点：
 *  - 5 个视图组件可被导入
 *  - CYCLE_STATUS_MAP / SCHEME_STATUS_MAP / INDICATOR_STATUS_MAP 完整映射
 *  - filterPerformanceMenu 角色可见性（employee → 空；dept_head → 4 项无 grade-thresholds；executive → 5 项全有）
 *  - resolvePerformanceActiveKey 路径匹配
 *  - 5 角色 RBAC 无 finance
 *
 * **M5-2-D3 调整**：children 计数 8 → 12（追加 4 路由：grade-actions / payout-config / payouts / payouts/:id）
 * **M5-2-D4 调整**：children 计数 12 → 15（追加 3 路由：sales-products / sales-payments / sales-commissions）
 * **M5-2-D5 调整**：children 计数 15 → 18（追加 3 路由：applications-adjustments / applications-promotions / applications-pips）
 */
import performanceRoutes, {
  PERFORMANCE_MENU,
  filterPerformanceMenu,
  resolvePerformanceActiveKey,
} from '@/router/performance';
import {
  CYCLE_STATUS_MAP,
  INDICATOR_STATUS_MAP,
  SCHEME_STATUS_MAP,
} from '@/api/types/performance';
import type { UserInfo } from '@/api/types';
import CycleList from '@/views/performance/cycle/CycleList.vue';
import IndicatorList from '@/views/performance/indicator/IndicatorList.vue';
import SchemeList from '@/views/performance/scheme/SchemeList.vue';
import CoefficientPanel from '@/views/performance/coefficient/CoefficientPanel.vue';
import GradeThresholds from '@/views/performance/grade/GradeThresholds.vue';

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

describe('views/__tests__/performance.test.ts', () => {
  it('5 个 D1 绩效视图组件可被导入', () => {
    expectEqual(typeof CycleList, 'object', 'CycleList');
    expectEqual(typeof IndicatorList, 'object', 'IndicatorList');
    expectEqual(typeof SchemeList, 'object', 'SchemeList');
    expectEqual(typeof CoefficientPanel, 'object', 'CoefficientPanel');
    expectEqual(typeof GradeThresholds, 'object', 'GradeThresholds');
  });

  it('状态映射 CYCLE/SCHEME/INDICATOR 完整', () => {
    expectEqual(CYCLE_STATUS_MAP.draft.label, '草稿', 'cycle draft');
    expectEqual(CYCLE_STATUS_MAP.active.label, '生效', 'cycle active');
    expectEqual(CYCLE_STATUS_MAP.closed.label, '已关闭', 'cycle closed');
    expectEqual(SCHEME_STATUS_MAP.draft.label, '草稿', 'scheme draft');
    expectEqual(SCHEME_STATUS_MAP.active.label, '生效', 'scheme active');
    expectEqual(SCHEME_STATUS_MAP.archived.label, '已归档', 'scheme archived');
    expectEqual(INDICATOR_STATUS_MAP.active.label, '启用', 'indicator active');
    expectEqual(INDICATOR_STATUS_MAP.archived.label, '已归档', 'indicator archived');
  });

  it('D1 5 菜单 + 5 角色 RBAC 无 finance', () => {
    expectEqual(PERFORMANCE_MENU.length, 5, '5 menus');
    expectEqual(
      PERFORMANCE_MENU.map((m) => m.permission).join(',').includes('finance'),
      false,
      'no finance',
    );
    expectEqual(
      PERFORMANCE_MENU.map((m) => m.to).join(','),
      [
        '/performance/cycles',
        '/performance/indicators',
        '/performance/schemes',
        '/performance/coefficients',
        '/performance/grade-thresholds',
      ].join(','),
      '5 menu to paths',
    );
  });

  it('employee 菜单空；dept_head 4 项无 grade-thresholds；executive 5 项全有', () => {
    const employee = filterPerformanceMenu(mockUser(['employee'], []));
    expectEqual(employee.length, 0, 'employee 0');

    const deptHead = filterPerformanceMenu(
      mockUser(
        ['dept_head'],
        [
          'performance:cycle:read',
          'performance:indicator:read',
          'performance:scheme:read',
          'performance:coefficient:read',
        ],
      ),
    );
    expectEqual(deptHead.length, 4, 'dept_head 4 项');
    expectEqual(
      deptHead.some((m) => m.key === 'grade-thresholds'),
      false,
      'dept_head 无 grade-thresholds',
    );
    expectEqual(deptHead.map((m) => m.key).join(','), 'cycles,indicators,schemes,coefficients', 'head keys');

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
        ],
      ),
    );
    expectEqual(executive.length, 5, 'executive 5 项');
    expectEqual(
      executive.map((m) => m.key).join(','),
      'cycles,indicators,schemes,coefficients,grade-thresholds',
      'exec keys',
    );
  });

  it('路由表 children 计数 + resolveActiveKey 前缀匹配（D5 追加 3 路由 → 18 children）', () => {
    const children = performanceRoutes[0].children ?? [];
    // M5-2-D1：1 redirect + 5 D1 = 6
    // M5-2-D2 追加 2 路由（records + records/:id）→ 8 children
    // M5-2-D3 追加 4 路由（grade-actions + payout-config + payouts + payouts/:id）→ 12 children
    // M5-2-D4 追加 3 路由（sales-products + sales-payments + sales-commissions）→ 15 children
    // M5-2-D5 追加 3 路由（applications-adjustments + applications-promotions + applications-pips）→ **18 children**
    expectEqual(children.length, 18, '1 redirect + 5 D1 + 2 D2 + 4 D3 + 3 D4 + 3 D5 = 18 children');
    expectEqual(children[0].path ?? '', '', 'redirect path');
    expectEqual(resolvePerformanceActiveKey('/performance/cycles'), 'cycles', 'cycles active');
    expectEqual(resolvePerformanceActiveKey('/performance/indicators'), 'indicators', 'indicators active');
    expectEqual(resolvePerformanceActiveKey('/performance/schemes'), 'schemes', 'schemes active');
    expectEqual(
      resolvePerformanceActiveKey('/performance/coefficients'),
      'coefficients',
      'coefficients active',
    );
    expectEqual(
      resolvePerformanceActiveKey('/performance/grade-thresholds'),
      'grade-thresholds',
      'grade-thresholds active',
    );
  });
});

export async function runPerformanceViewTests(): Promise<number> {
  await Promise.all(cases.map((item) => Promise.resolve(item.fn())));
  return cases.length;
}

export const performanceViewTestCount = cases.length;
