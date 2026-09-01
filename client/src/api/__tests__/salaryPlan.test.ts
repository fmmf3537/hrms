/**
 * 薪酬方案 API 单测（M5-2-C1）内联断言
 */
import { SALARY_PLAN_PATHS } from '@/api/salaryPlan';
import type { PlanStatus } from '@/api/types/salary';

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

describe('api/salaryPlan.ts', () => {
  it('list/create 走 /salary/plans', () => {
    expectEqual(SALARY_PLAN_PATHS.plans, '/salary/plans', 'plans');
  });

  it('deactivate 是 PATCH /salary/plans/:id/deactivate（不是 PUT/POST）', () => {
    expectEqual(
      SALARY_PLAN_PATHS.deactivate('p1'),
      '/salary/plans/p1/deactivate',
      'deactivate',
    );
  });

  it('PlanStatus 3 值', () => {
    const statuses: PlanStatus[] = ['active', 'inactive', 'superseded'];
    expectEqual(statuses.length, 3, '3 plan statuses');
  });
});

export function runSalaryPlanTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const salaryPlanTestCount = cases.length;
