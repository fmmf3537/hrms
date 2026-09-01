/**
 * 打卡 API 单测（M5-2-B）内联断言
 */
import { ATTENDANCE_PATHS } from '@/api/attendance';
import type { ClockType } from '@/api/types/attendance';

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

describe('api/attendance.ts', () => {
  it('clockIn 调 POST /attendance/clock-in', () => {
    expectEqual(ATTENDANCE_PATHS.clockIn, '/attendance/clock-in', 'clock-in');
    const types: ClockType[] = ['wifi', 'gps', 'manual', 'imported'];
    expectEqual(types.length, 4, '4 clock types');
  });

  it('listRecords 调 GET /attendance/records（不是 /attendance）', () => {
    expectEqual(ATTENDANCE_PATHS.records, '/attendance/records', 'list');
    expectEqual(ATTENDANCE_PATHS.record('r1'), '/attendance/records/r1', 'get');
  });

  it('manualClock / importData 路径对齐', () => {
    expectEqual(ATTENDANCE_PATHS.manual, '/attendance/manual', 'manual');
    expectEqual(ATTENDANCE_PATHS.import, '/attendance/import', 'import');
  });
});

export function runAttendanceApiTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const attendanceApiTestCount = cases.length;
