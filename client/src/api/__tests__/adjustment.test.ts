/**
 * 调薪 API 单测（M5-2-C3）内联断言
 */
import { ADJUSTMENT_PATHS } from '@/api/adjustment';
import {
  canAdjustmentAction,
  type ApproveAdjustmentRequest,
} from '@/api/types/compensation';
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

describe('api/adjustment.ts', () => {
  it('ADJUSTMENT_PATHS + ApproveAdjustmentRequest action', () => {
    expectEqual(ADJUSTMENT_PATHS.list, '/salary/adjustments', 'list');
    expectEqual(ADJUSTMENT_PATHS.executePending, '/salary/adjustments/execute-pending', 'batch');
    expectEqual(ADJUSTMENT_PATHS.approve('x1'), '/salary/adjustments/x1/approve', 'approve');
    const approve: ApproveAdjustmentRequest = { action: 'approve' };
    const reject: ApproveAdjustmentRequest = { action: 'reject', comment: 'no' };
    expectEqual(approve.action, 'approve', 'approve literal');
    expectEqual(reject.action, 'reject', 'reject literal');
  });

  it('canAdjustmentAction 权限×状态', () => {
    const hr = mockUser(['hr'], ['salary:adjustment:approve', 'salary:adjustment:write']);
    const executive = mockUser(['executive'], ['salary:adjustment:approve', 'salary:adjustment:execute']);
    expectEqual(
      canAdjustmentAction('approve', { status: 'pending' }, hr),
      true,
      'approve+hr+pending',
    );
    expectEqual(
      canAdjustmentAction('cancel', { status: 'draft' }, executive),
      false,
      'cancel+executive',
    );
    expectEqual(
      canAdjustmentAction('submit', { status: 'draft' }, executive),
      false,
      'submit+executive',
    );
  });
});

export function runAdjustmentApiTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const adjustmentApiTestCount = cases.length;
