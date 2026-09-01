/**
 * 提成 API 单测（M5-2-C3）内联断言
 */
import { COMMISSION_PATHS } from '@/api/commission';
import { canSettlementAction } from '@/api/types/compensation';
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

describe('api/commission.ts', () => {
  it('COMMISSION_PATHS 拼接 /salary/commissions', () => {
    expectEqual(COMMISSION_PATHS.summary, '/salary/commissions/summary', 'summary');
    expectEqual(COMMISSION_PATHS.employee('e1'), '/salary/commissions/employees/e1', 'employee');
    expectEqual(COMMISSION_PATHS.department('d1'), '/salary/commissions/departments/d1', 'dept');
    expectEqual(COMMISSION_PATHS.settlements, '/salary/commissions/settlements', 'list');
    expectEqual(
      COMMISSION_PATHS.confirm('s1'),
      '/salary/commissions/settlements/s1/confirm',
      'confirm',
    );
  });

  it('canSettlementAction 权限×状态', () => {
    const executive = mockUser(['executive'], ['salary:commission:confirm']);
    const employee = mockUser(['employee'], ['salary:commission:read']);
    expectEqual(
      canSettlementAction('confirm', { status: 'pending_confirm' }, executive),
      true,
      'confirm+executive+pending_confirm',
    );
    expectEqual(
      canSettlementAction('cancel', { status: 'pending_confirm' }, executive),
      false,
      'cancel+executive',
    );
    expectEqual(
      canSettlementAction('confirm', { status: 'pending_confirm' }, employee),
      false,
      'confirm+employee',
    );
  });
});

export function runCommissionApiTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const commissionApiTestCount = cases.length;
