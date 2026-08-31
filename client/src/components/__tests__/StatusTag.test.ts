/**
 * StatusTag 状态映射单测（M5-2-A1）
 */
import { resolveStatusTag } from '@/components/StatusTag.vue';

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

describe('components/StatusTag.vue', () => {
  it('5 状态正确映射', () => {
    expectEqual(resolveStatusTag('active').type, 'success', 'active');
    expectEqual(resolveStatusTag('active').label, '正常', 'active label');
    expectEqual(resolveStatusTag('suspended').type, 'warning', 'suspended');
    expectEqual(resolveStatusTag('merged').type, 'info', 'merged');
    expectEqual(resolveStatusTag('probation').type, 'warning', 'probation');
    expectEqual(resolveStatusTag('resigned').type, 'danger', 'resigned');
  });

  it('未知状态显示原字符串', () => {
    expectEqual(resolveStatusTag('unknown_x').label, 'unknown_x', 'passthrough');
    expectEqual(resolveStatusTag('unknown_x').type, 'info', 'default type');
  });
});

export function runStatusTagTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const statusTagTestCount = cases.length;
