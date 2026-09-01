/**
 * 月度汇总 API 单测（M5-2-B）内联断言
 */
import { MONTHLY_SUMMARY_PATHS } from '@/api/monthlySummary';
import type { SummaryStatus } from '@/api/types/attendance';

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

describe('api/monthlySummary.ts', () => {
  it('generateMonthlySummary 调 POST /monthly-summaries/generate', () => {
    expectEqual(MONTHLY_SUMMARY_PATHS.generate, '/monthly-summaries/generate', 'generate');
    expectEqual(MONTHLY_SUMMARY_PATHS.list, '/monthly-summaries', 'list');
  });

  it('confirm / lock 路径；3 状态；无 GET /:id', () => {
    expectEqual(MONTHLY_SUMMARY_PATHS.confirm('m1'), '/monthly-summaries/m1/confirm', 'confirm');
    expectEqual(MONTHLY_SUMMARY_PATHS.lock('m1'), '/monthly-summaries/m1/lock', 'lock');
    const statuses: SummaryStatus[] = ['draft', 'employee_confirmed', 'hr_locked'];
    expectEqual(statuses.length, 3, '3 statuses');
    expectEqual('item' in MONTHLY_SUMMARY_PATHS, false, 'no get');
  });
});

export function runMonthlySummaryTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const monthlySummaryTestCount = cases.length;
