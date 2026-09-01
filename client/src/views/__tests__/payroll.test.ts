/**
 * 算薪视图状态映射 + 按钮显隐单测（M5-2-C2）内联断言
 */
import {
  canPayrollRunAction,
  payrollRunTagType,
} from '@/api/types/payroll';
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

describe('views/__tests__/payroll.test.ts', () => {
  it('状态 → ElTag type 映射', () => {
    expectEqual(payrollRunTagType('draft'), 'info', 'draft');
    expectEqual(payrollRunTagType('submitted'), 'warning', 'submitted');
    expectEqual(payrollRunTagType('reviewed'), 'primary', 'reviewed');
    expectEqual(payrollRunTagType('approved'), 'success', 'approved');
    expectEqual(payrollRunTagType('locked'), 'danger', 'locked');
    expectEqual(payrollRunTagType('cancelled'), 'info', 'cancelled');
  });

  it('状态 × 权限按钮可见性', () => {
    const writer = mockUser(['hr'], ['salary:payroll-run:write']);
    const approver = mockUser(['executive'], ['salary:payroll-run:approve']);
    expectEqual(
      canPayrollRunAction('submit', { status: 'draft' }, writer),
      true,
      'draft+write→submit',
    );
    expectEqual(
      canPayrollRunAction('review', { status: 'submitted' }, writer),
      false,
      'submitted+write(非 approve)→review 不可见',
    );
    expectEqual(
      canPayrollRunAction('review', { status: 'submitted' }, approver),
      true,
      'submitted+approve→review',
    );
    expectEqual(
      canPayrollRunAction('lock', { status: 'approved' }, approver),
      true,
      'approved+approve→lock',
    );
  });
});

export function runPayrollViewTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const payrollViewTestCount = cases.length;
