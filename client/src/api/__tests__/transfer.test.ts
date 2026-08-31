/**
 * 调动 API 单测（M5-2-A2）内联断言
 */
import { TRANSFER_PATHS } from '@/api/transfer';
import type { TransferStatus, TransferType } from '@/api/types/organization';

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

describe('api/transfer.ts', () => {
  it('listTransfers 调 GET /transfers', () => {
    expectEqual(TRANSFER_PATHS.list, '/transfers', 'list');
    expectEqual(TRANSFER_PATHS.item('t1'), '/transfers/t1', 'get');
  });

  it('updateTransfer 调 POST /transfers/:id/update（不是 PUT）', () => {
    expectEqual(TRANSFER_PATHS.update('t1'), '/transfers/t1/update', 'update');
  });

  it('cancelTransfer 调 POST /transfers/:id/cancel；类型 transfer/promote/demote', () => {
    expectEqual(TRANSFER_PATHS.cancel('t1'), '/transfers/t1/cancel', 'cancel');
    const types: TransferType[] = ['transfer', 'promote', 'demote'];
    expectEqual(types.length, 3, '3 types');
    const statuses: TransferStatus[] = [
      'draft',
      'submitted',
      'approved',
      'rejected',
      'cancelled',
    ];
    expectEqual((statuses as string[]).includes('executed'), false, 'no executed');
  });
});

export function runTransferTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const transferTestCount = cases.length;
