// M0.5-6: 配置中心 service 单测 | HRMS
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
   @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

import * as configService from './config.service';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    config: {
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      create: mocks.create,
      update: mocks.update,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('./audit.service', () => ({
  AUDIT_ACTIONS: { UPDATE: 'UPDATE' },
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  configService.clearCacheForTest();
  configService.stopCacheRefresh();
});

describe('getValue', () => {
  it('返回当前生效最高 version', async () => {
    mocks.findMany.mockResolvedValueOnce([
      {
        category: 'leave',
        key: 'annual_days',
        value: { old: true },
        version: 1,
        effectiveFrom: new Date('2020-01-01'),
        effectiveTo: new Date('2023-12-31'),
      },
      {
        category: 'leave',
        key: 'annual_days',
        value: { '1-10年': 5 },
        version: 2,
        effectiveFrom: new Date('2024-01-01'),
        effectiveTo: null,
      },
    ]);

    const value = await configService.getValue('leave', 'annual_days');
    expect(value).toEqual({ '1-10年': 5 });
  });

  it('按 atDate 回溯历史版本', async () => {
    mocks.findMany.mockResolvedValueOnce([
      {
        category: 'probation',
        key: 'months',
        value: 6,
        version: 1,
        effectiveFrom: new Date('2020-01-01'),
        effectiveTo: new Date('2023-12-31'),
      },
      {
        category: 'probation',
        key: 'months',
        value: 3,
        version: 2,
        effectiveFrom: new Date('2024-01-01'),
        effectiveTo: null,
      },
    ]);

    const value = await configService.getValue('probation', 'months', new Date('2022-06-01'));
    expect(value).toBe(6);
  });

  it('不存在 → 70101', async () => {
    mocks.findMany.mockResolvedValueOnce([]);
    await expect(configService.getValue('x', 'y')).rejects.toMatchObject({
      statusCode: 404,
      code: 70101,
    });
  });
});

describe('setValue', () => {
  it('写入新版本并关闭旧 effective_to', async () => {
    mocks.transaction.mockImplementationOnce(async (fn: any) => {
      const tx = {
        config: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'old-id',
            version: 1,
            effectiveTo: null,
          }),
          update: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue({
            id: 'new-id',
            version: 2,
          }),
        },
      };
      return fn(tx);
    });
    mocks.findMany.mockResolvedValue([]); // refreshCache

    const result = await configService.setValue({
      category: 'leave',
      key: 'annual_days',
      value: { '1-10年': 6 },
      effectiveFrom: new Date('2026-01-01'),
      createdBy: 'user-1',
    });

    expect(result).toEqual({ id: 'new-id', version: 2 });
    expect(mocks.auditLog).toHaveBeenCalled();
  });
});

describe('getHistory', () => {
  it('按 version 降序返回', async () => {
    mocks.findMany.mockResolvedValueOnce([
      {
        id: '2', version: 2, value: 3, effectiveFrom: new Date(), effectiveTo: null, remark: null, createdAt: new Date(), createdBy: null,
      },
      {
        id: '1', version: 1, value: 6, effectiveFrom: new Date(), effectiveTo: new Date(), remark: null, createdAt: new Date(), createdBy: null,
      },
    ]);

    const rows = await configService.getHistory('probation', 'months');
    expect(rows[0].version).toBe(2);
    expect(rows).toHaveLength(2);
  });
});
