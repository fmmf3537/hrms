/**
 * 日期 / 金额 / 状态格式化单测（M5-2-0）
 */
import { formatAmount, formatDate, formatStatus } from '@/utils/format';

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

describe('utils/format.ts', () => {
  it('日期：纯日期字符串原样返回，非法值显示 —', () => {
    expectEqual(formatDate('2026-08-31'), '2026-08-31', 'ymd');
    expectEqual(formatDate(null), '—', 'null');
    expectEqual(formatDate('not-a-date'), '—', 'invalid');
  });

  it('金额千分位 + 状态中文', () => {
    expectEqual(formatAmount(1234.5), '1,234.50', 'amount');
    expectEqual(formatAmount(null), '—', 'amount null');
    expectEqual(formatStatus('approved'), '已通过', 'status');
    expectEqual(formatStatus('unknown_x'), 'unknown_x', 'passthrough');
  });
});

export function runFormatTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const formatTestCount = cases.length;
