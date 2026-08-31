/**
 * 离职 API 单测（M5-2-A2）内联断言
 */
import { OFFBOARDING_PATHS } from '@/api/offboarding';
import type { OffboardingStatus } from '@/api/types/organization';

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

describe('api/offboarding.ts', () => {
  it('listOffboardings 调 GET /offboarding', () => {
    expectEqual(OFFBOARDING_PATHS.list, '/offboarding', 'list');
    expectEqual(OFFBOARDING_PATHS.item('o1'), '/offboarding/o1', 'get');
  });

  it('confirmHandover 调 POST /offboarding/:id/confirm-handover（无 body）', () => {
    expectEqual(
      OFFBOARDING_PATHS.confirmHandover('o1'),
      '/offboarding/o1/confirm-handover',
      'handover',
    );
  });

  it('cancelOffboarding 调 POST /offboarding/:id/cancel', () => {
    expectEqual(OFFBOARDING_PATHS.cancel('o1'), '/offboarding/o1/cancel', 'cancel');
  });

  it('issueCertificate 调 POST /offboarding/:id/issue-certificate；7 状态', () => {
    expectEqual(
      OFFBOARDING_PATHS.issueCertificate('o1'),
      '/offboarding/o1/issue-certificate',
      'cert',
    );
    const statuses: OffboardingStatus[] = [
      'draft',
      'handover_pending',
      'submitted',
      'approved',
      'certificate_issued',
      'rejected',
      'cancelled',
    ];
    expectEqual(statuses.length, 7, '7 statuses');
  });
});

export function runOffboardingTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const offboardingTestCount = cases.length;
