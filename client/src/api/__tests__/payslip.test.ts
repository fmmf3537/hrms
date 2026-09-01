/**
 * 工资单 API 单测（M5-2-C2）内联断言：HR / ESS 双前缀不混淆
 */
import { PAYSLIP_PATHS } from '@/api/payslip';
import type { PayslipDeliverRequest, PayslipStatus } from '@/api/types/payroll';

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

describe('api/payslip.ts', () => {
  it('HR 走 /payrolls/payslips，ESS 走 /payslips/:id/payslip/*', () => {
    expectEqual(PAYSLIP_PATHS.list, '/salary/payrolls/payslips', 'hr list');
    expectEqual(PAYSLIP_PATHS.detail('p1'), '/salary/payrolls/payslips/p1', 'hr detail');
    expectEqual(
      PAYSLIP_PATHS.pdf('p1'),
      '/salary/payslips/p1/payslip/pdf',
      'ess pdf',
    );
    expectEqual(PAYSLIP_PATHS.deliver('p1'), '/salary/payslips/p1/deliver', 'deliver');
    expectEqual(
      PAYSLIP_PATHS.detail('p1') === PAYSLIP_PATHS.pdf('p1'),
      false,
      'prefixes differ',
    );
  });

  it('PayslipStatus 三态 + deliver methods 字面量', () => {
    const statuses: PayslipStatus[] = ['calculated', 'approved', 'locked'];
    expectEqual(statuses.length, 3, '3 statuses');
    const body: PayslipDeliverRequest = { methods: ['email', 'system'] };
    expectEqual(body.methods?.join(','), 'email,system', 'methods');
  });
});

export function runPayslipApiTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const payslipApiTestCount = cases.length;
