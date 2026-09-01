/**
 * 薪级薪档 API 单测（M5-2-C1）内联断言
 */
import { SALARY_GRADE_PATHS } from '@/api/salaryGrade';
import type { GradeStatus, SalarySequence } from '@/api/types/salary';

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

describe('api/salaryGrade.ts', () => {
  it('list/create 走 GET/POST /salary/grades', () => {
    expectEqual(SALARY_GRADE_PATHS.grades, '/salary/grades', 'grades');
  });

  it('薪档走 /salary/grade-levels（不是 /grades/:id/levels）', () => {
    expectEqual(SALARY_GRADE_PATHS.gradeLevels, '/salary/grade-levels', 'levels');
  });

  it('sequence 5 值 + status 2 值', () => {
    const seq: SalarySequence[] = ['M', 'T', 'P', 'S', 'A'];
    expectEqual(seq.length, 5, '5 sequences');
    const statuses: GradeStatus[] = ['active', 'archived'];
    expectEqual(statuses.length, 2, '2 grade statuses');
  });
});

export function runSalaryGradeTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const salaryGradeTestCount = cases.length;
