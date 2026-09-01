/**
 * 提成/预警/调薪视图映射 + 菜单可见性（M5-2-C3）内联断言
 */
import {
  adjustmentTagType,
  costAlertTagType,
  settlementTagType,
} from '@/api/types/compensation';
import { filterSalaryMenu } from '@/router/salary';
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

describe('views/__tests__/compensation.test.ts', () => {
  it('Settlement 4 态 / CostAlert 3 态 / Adjustment 6 态 ElTag 映射', () => {
    expectEqual(settlementTagType('draft'), 'info', 's-draft');
    expectEqual(settlementTagType('pending_confirm'), 'warning', 's-pending');
    expectEqual(settlementTagType('confirmed'), 'success', 's-confirmed');
    expectEqual(settlementTagType('cancelled'), 'danger', 's-cancelled');
    expectEqual(costAlertTagType('active'), 'warning', 'c-active');
    expectEqual(costAlertTagType('acknowledged'), 'success', 'c-ack');
    expectEqual(costAlertTagType('closed'), 'info', 'c-closed');
    expectEqual(adjustmentTagType('draft'), 'info', 'a-draft');
    expectEqual(adjustmentTagType('pending'), 'warning', 'a-pending');
    expectEqual(adjustmentTagType('approved'), 'success', 'a-approved');
    expectEqual(adjustmentTagType('rejected'), 'danger', 'a-rejected');
    expectEqual(adjustmentTagType('executed'), 'success', 'a-executed');
    expectEqual(adjustmentTagType('cancelled'), 'danger', 'a-cancelled');
  });

  it('employee 可见 commission/adjustments，不可见 settlements/cost-alerts', () => {
    const employee = mockUser(
      ['employee'],
      ['salary:commission:read', 'salary:adjustment:read-self'],
    );
    const keys = filterSalaryMenu(employee).map((item) => item.key);
    expectEqual(keys.includes('commission'), true, 'see commission');
    expectEqual(keys.includes('adjustments'), true, 'see adjustments');
    expectEqual(keys.includes('settlements'), false, 'hide settlements');
    expectEqual(keys.includes('cost-alerts'), false, 'hide cost-alerts');
    const commission = filterSalaryMenu(employee).find((item) => item.key === 'commission');
    expectEqual(commission?.label, '我的提成', 'employeeLabel');
    const adj = filterSalaryMenu(employee).find((item) => item.key === 'adjustments');
    expectEqual(adj?.label, '我的调薪', 'adjustment employeeLabel');
  });
});

export function runCompensationViewTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const compensationViewTestCount = cases.length;
