/**
 * 加班 API 单测（M5-2-B）内联断言
 */
import { OVERTIME_PATHS } from '@/api/overtime';

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

describe('api/overtime.ts', () => {
  it('create/list 走 /overtime/requests', () => {
    expectEqual(OVERTIME_PATHS.requests, '/overtime/requests', 'requests');
  });

  it('cancelOvertimeRequest 调 POST /overtime/requests/:id/cancel；无 GET /:id', () => {
    expectEqual(OVERTIME_PATHS.cancel('o1'), '/overtime/requests/o1/cancel', 'cancel');
    expectEqual('item' in OVERTIME_PATHS, false, 'no get path');
  });
});

export function runOvertimeTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const overtimeTestCount = cases.length;
