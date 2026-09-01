/**
 * 绩效奖金 / 等级计算 API 单测（M5-2-D3）内联断言
 *
 * 覆盖要点：
 *  - GRADE_PATHS / PAYOUT_PATHS 拼接
 *  - calculatePayout 模式路由的 body 构造（direct 必须 employeeId；pool 必须 deptIds）
 *  - canPayoutAction 权限矩阵（5 角色 + 4 动作）
 *  - PAYOUT_STATUS_MAP 5 态完整
 */
import { GRADE_PATHS } from '@/api/performanceGrade';
import { PAYOUT_PATHS } from '@/api/performancePayout';
import {
  PAYOUT_MODE_LABELS,
  PAYOUT_STATUS_MAP,
  type CalculatePayoutRequest,
  type PayoutAction,
  canPayoutAction,
} from '@/api/types/performancePayout';
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

describe('api/__tests__/performancePayout.test.ts', () => {
  it('GRADE_PATHS 拼接 + 11 端点路径前缀一致', () => {
    expectEqual(
      GRADE_PATHS.calculate,
      '/performance/grade/calculate',
      'calculate',
    );
    expectEqual(
      GRADE_PATHS.calculateBatch,
      '/performance/grade/calculate-batch',
      'calculateBatch',
    );
    expectEqual(
      GRADE_PATHS.calibrateRatios,
      '/performance/grade/calibrate-ratios',
      'calibrateRatios',
    );
    expectEqual(
      PAYOUT_PATHS.config,
      '/performance/payouts/config',
      'payouts/config',
    );
    expectEqual(
      PAYOUT_PATHS.calculate,
      '/performance/payouts/calculate',
      'payouts/calculate',
    );
    expectEqual(
      PAYOUT_PATHS.calculatePool,
      '/performance/payouts/calculate-pool',
      'payouts/calculate-pool',
    );
    expectEqual(PAYOUT_PATHS.prepay, '/performance/payouts/prepay', 'payouts/prepay');
    expectEqual(PAYOUT_PATHS.settle, '/performance/payouts/settle', 'payouts/settle');
    expectEqual(PAYOUT_PATHS.list, '/performance/payouts', 'payouts');
    expectEqual(PAYOUT_PATHS.detail('p1'), '/performance/payouts/p1', 'payouts/:id');
  });

  it('CalculatePayoutRequest 类型：direct 必传 employeeId，pool 必传 deptIds（前端校验先行拦截）', () => {
    const directReq: CalculatePayoutRequest = {
      mode: 'direct',
      employeeId: 'emp-1',
      cycleId: 'c1',
      month: '2026-08',
    };
    expectTrue(directReq.mode === 'direct', 'direct mode');
    expectTrue(!!directReq.employeeId, 'direct 必传 employeeId');
    expectTrue(!directReq.deptIds || directReq.deptIds.length === 0, 'direct 不传 deptIds');

    const poolReq: CalculatePayoutRequest = {
      mode: 'pool',
      deptIds: ['d1', 'd2'],
      cycleId: 'c1',
      month: '2026-08',
    };
    expectTrue(poolReq.mode === 'pool', 'pool mode');
    expectTrue(!!poolReq.deptIds && poolReq.deptIds.length >= 1, 'pool 必传 deptIds');
    expectTrue(!poolReq.employeeId, 'pool 不传 employeeId');

    // mode 字段可选（默认 direct）
    const defaultReq: CalculatePayoutRequest = {
      cycleId: 'c1',
      month: '2026-08',
      employeeId: 'emp-1',
    };
    expectTrue(defaultReq.mode === undefined, 'mode 缺省');
  });

  it('canPayoutAction 矩阵：admin 全开 / hr 全开 / executive 算+结算但不改配置 / dept_head+employee 只读', () => {
    const admin = mockUser(['admin'], ['*']);
    const hr = mockUser(['hr'], [
      'performance:payout:read',
      'performance:payout:write',
      'performance:payout:calculate',
      'performance:payout:settle',
    ]);
    const executive = mockUser(['executive'], [
      'performance:payout:read',
      'performance:payout:calculate',
      'performance:payout:settle',
    ]);
    const deptHead = mockUser(['dept_head'], ['performance:payout:read']);
    const employee = mockUser(['employee'], ['performance:payout:read']);

    const actions: PayoutAction[] = ['calculate', 'prepay', 'settle', 'config'];
    actions.forEach((a) => expectTrue(canPayoutAction(a, admin), `admin + ${a}`));
    actions.forEach((a) => expectTrue(canPayoutAction(a, hr), `hr + ${a}`));

    expectTrue(canPayoutAction('calculate', executive), 'executive + calculate');
    expectTrue(canPayoutAction('prepay', executive), 'executive + prepay');
    expectTrue(canPayoutAction('settle', executive), 'executive + settle');
    expectFalse(canPayoutAction('config', executive), 'executive + config → false');

    expectFalse(canPayoutAction('calculate', deptHead), 'dept_head + calculate → false');
    expectFalse(canPayoutAction('prepay', deptHead), 'dept_head + prepay → false');
    expectFalse(canPayoutAction('settle', deptHead), 'dept_head + settle → false');
    expectFalse(canPayoutAction('config', deptHead), 'dept_head + config → false');

    expectFalse(canPayoutAction('calculate', employee), 'employee + calculate → false');
    expectFalse(canPayoutAction('prepay', employee), 'employee + prepay → false');
    expectFalse(canPayoutAction('settle', employee), 'employee + settle → false');
    expectFalse(canPayoutAction('config', employee), 'employee + config → false');
  });

  it('PAYOUT_STATUS_MAP 5 态完整 + PAYOUT_MODE_LABELS 双语', () => {
    expectEqual(PAYOUT_STATUS_MAP.draft.label, '草稿', 'draft');
    expectEqual(PAYOUT_STATUS_MAP.calculated.label, '已计算', 'calculated');
    expectEqual(PAYOUT_STATUS_MAP.prepaid.label, '已预发', 'prepaid');
    expectEqual(PAYOUT_STATUS_MAP.settled.label, '已结算', 'settled');
    expectEqual(PAYOUT_STATUS_MAP.cancelled.label, '已取消', 'cancelled');
    expectEqual(Object.keys(PAYOUT_STATUS_MAP).length, 5, '5 status');
    expectEqual(PAYOUT_MODE_LABELS.direct, '直乘', 'direct label');
    expectEqual(PAYOUT_MODE_LABELS.pool, '部门池', 'pool label');
  });
});

export function runPerformancePayoutApiTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}