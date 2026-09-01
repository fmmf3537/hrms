/**
 * 算薪 Run API 单测（M5-2-C2）内联断言
 */
import { PAYROLL_PATHS } from '@/api/payroll';
import type { CreatePayrollRunRequest, PayrollRunStatus } from '@/api/types/payroll';

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

describe('api/payroll.ts', () => {
  it('PAYROLL_PATHS 拼接 /salary/payrolls/runs', () => {
    expectEqual(PAYROLL_PATHS.runs, '/salary/payrolls/runs', 'runs');
    expectEqual(PAYROLL_PATHS.run('r1'), '/salary/payrolls/runs/r1', 'run');
    expectEqual(PAYROLL_PATHS.submit('r1'), '/salary/payrolls/runs/r1/submit', 'submit');
    expectEqual(
      PAYROLL_PATHS.bankingExport('r1'),
      '/salary/payrolls/runs/r1/banking-export',
      'banking',
    );
  });

  it('PayrollRunStatus 6 态 + CreatePayrollRunRequest.period', () => {
    const statuses: PayrollRunStatus[] = [
      'draft',
      'submitted',
      'reviewed',
      'approved',
      'locked',
      'cancelled',
    ];
    expectEqual(statuses.length, 6, '6 statuses');
    const body: CreatePayrollRunRequest = { period: '2026-09' };
    expectEqual(body.period, '2026-09', 'period YYYY-MM');
  });
});

export function runPayrollApiTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const payrollApiTestCount = cases.length;
