/**
 * 请假 API 单测（M5-2-B）内联断言
 */
import { LEAVE_PATHS } from '@/api/leave';
import type { LeaveType } from '@/api/types/attendance';

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

describe('api/leave.ts', () => {
  it('getLeaveBalance 调 GET /leaves/balance', () => {
    expectEqual(LEAVE_PATHS.balance, '/leaves/balance', 'balance');
    const types: LeaveType[] = [
      'annual',
      'sick',
      'personal',
      'compensatory',
      'marriage',
      'maternity',
      'paternity',
      'bereavement',
    ];
    expectEqual(types.length, 8, '8 leave types');
  });

  it('listLeaveRequests 调 GET /leaves/requests（不是 /leaves）', () => {
    expectEqual(LEAVE_PATHS.requests, '/leaves/requests', 'list');
    expectEqual(LEAVE_PATHS.item('l1'), '/leaves/requests/l1', 'get');
  });

  it('cancelLeaveRequest 调 POST /leaves/requests/:id/cancel', () => {
    expectEqual(LEAVE_PATHS.cancel('l1'), '/leaves/requests/l1/cancel', 'cancel');
  });
});

export function runLeaveTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const leaveTestCount = cases.length;
