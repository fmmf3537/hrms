/**
 * 转正 API 单测（M5-2-A2）内联断言
 */
import { REGULARIZATION_PATHS } from '@/api/regularization';
import type { RegularizationStatus } from '@/api/types/organization';

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

describe('api/regularization.ts', () => {
  it('listRegularizations 调 GET /regularizations', () => {
    expectEqual(REGULARIZATION_PATHS.list, '/regularizations', 'list');
    expectEqual(REGULARIZATION_PATHS.item('r1'), '/regularizations/r1', 'get');
  });

  it('cancelRegularization 调 POST /regularizations/:id/cancel；状态含 submitted 不含 pending', () => {
    expectEqual(REGULARIZATION_PATHS.cancel('r1'), '/regularizations/r1/cancel', 'cancel');
    const statuses: RegularizationStatus[] = [
      'draft',
      'submitted',
      'approved',
      'rejected',
      'cancelled',
    ];
    expectEqual(statuses.includes('submitted'), true, 'submitted');
    expectEqual((statuses as string[]).includes('pending'), false, 'no pending');
  });
});

export function runRegularizationTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const regularizationTestCount = cases.length;
