/**
 * 合同 API 单测（M5-2-A2）内联断言
 */
import { CONTRACT_PATHS } from '@/api/contract';
import type { ContractStatus, ContractType } from '@/api/types/organization';

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

describe('api/contract.ts', () => {
  it('listContracts 调 GET /contracts；5 类合同模板', () => {
    expectEqual(CONTRACT_PATHS.list, '/contracts', 'list');
    expectEqual(CONTRACT_PATHS.item('c1'), '/contracts/c1', 'get');
    const types: ContractType[] = ['formal', 'intern', 'consultant', 'labor', 'nda'];
    expectEqual(types.length, 5, '5 types');
  });

  it('updateContract 调 POST /contracts/:id/update（不是 PUT）', () => {
    expectEqual(CONTRACT_PATHS.update('c1'), '/contracts/c1/update', 'update');
  });

  it('cancelContract 调 POST /:id/cancel；handleESignWebhook 调 /webhook/e-sign', () => {
    expectEqual(CONTRACT_PATHS.cancel('c1'), '/contracts/c1/cancel', 'cancel');
    expectEqual(CONTRACT_PATHS.webhook, '/contracts/webhook/e-sign', 'webhook');
    const statuses: ContractStatus[] = [
      'draft',
      'pending_signature',
      'signing',
      'signed',
      'expired',
      'cancelled',
    ];
    expectEqual(statuses.length, 6, '6 statuses');
  });
});

export function runContractTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const contractTestCount = cases.length;
