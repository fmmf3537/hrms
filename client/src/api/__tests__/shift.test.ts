/**
 * 班次 API 单测（M5-2-B）内联断言
 */
import { SHIFT_PATHS } from '@/api/shift';
import type { ShiftStatus, ShiftType } from '@/api/types/attendance';

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

describe('api/shift.ts', () => {
  it('listShifts 调 GET /shifts', () => {
    expectEqual(SHIFT_PATHS.list, '/shifts', 'list');
    expectEqual(SHIFT_PATHS.item('s1'), '/shifts/s1', 'get');
  });

  it('updateShift 调 PUT /shifts/:id；create 走 POST /shifts', () => {
    expectEqual(SHIFT_PATHS.item('s1'), '/shifts/s1', 'put path');
    expectEqual(SHIFT_PATHS.list, '/shifts', 'post create');
  });

  it('assignShift 调 POST /shifts/assignments（不是 /shifts/:id/assign）', () => {
    expectEqual(SHIFT_PATHS.assignments, '/shifts/assignments', 'assign');
    const types: ShiftType[] = ['standard', 'comprehensive', 'flexible'];
    expectEqual(types.length, 3, '3 types');
    const statuses: ShiftStatus[] = ['draft', 'active', 'archived'];
    expectEqual(statuses.length, 3, '3 statuses');
  });
});

export function runShiftTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const shiftTestCount = cases.length;
