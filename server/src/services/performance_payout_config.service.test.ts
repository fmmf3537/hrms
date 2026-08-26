// M3-D4: performance_payout_config.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
  setValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    performancePayoutConfig: {
      findFirst: mocks.findFirst,
      update: mocks.update,
      create: mocks.create,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  setValue: mocks.setValue.mockResolvedValue(undefined),
}));

import * as configService from './performance_payout_config.service';

const currentConfig = {
  id: 'cfg-1',
  mode: 'direct',
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
  remark: null,
  createdBy: 'admin-1',
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      performancePayoutConfig: {
        update: mocks.update,
        create: mocks.create,
      },
    };
    return fn(tx);
  });
  mocks.create.mockImplementation(async ({ data }: { data: { mode: string } }) => ({
    id: 'cfg-2',
    ...data,
    effectiveTo: null,
    createdBy: 'admin-1',
    createdAt: new Date(),
  }));
});

describe('performance_payout_config.service', () => {
  describe('getCurrentConfig', () => {
    it('返 effectiveTo=null 最新配置', async () => {
      mocks.findFirst.mockResolvedValue(currentConfig);
      const result = await configService.getCurrentConfig('admin-1');
      expect(result.mode).toBe('direct');
      expect(mocks.auditLog).toHaveBeenCalled();
    });

    it('无配置抛 72701', async () => {
      mocks.findFirst.mockResolvedValue(null);
      await expect(configService.getCurrentConfig()).rejects.toMatchObject({ code: 72701 });
    });
  });

  describe('switchConfig', () => {
    it('从 direct 切到 pool（旧版本 effectiveTo 自动设）', async () => {
      mocks.findFirst.mockResolvedValue(currentConfig);
      const result = await configService.switchConfig('admin-1', { mode: 'pool' });
      expect(result.mode).toBe('pool');
      expect(mocks.update).toHaveBeenCalled();
      expect(mocks.create).toHaveBeenCalled();
      expect(mocks.setValue).toHaveBeenCalledWith(expect.objectContaining({
        category: 'performance',
        key: 'payout.mode',
        value: 'pool',
        createdBy: 'admin-1',
      }));
    });

    it('mode 非法抛 72702', async () => {
      await expect(
        configService.switchConfig('admin-1', { mode: 'hybrid' as 'direct' }),
      ).rejects.toMatchObject({ code: 72702 });
    });

    it('首次切换无旧版本也能创建', async () => {
      mocks.findFirst.mockResolvedValue(null);
      const result = await configService.switchConfig('admin-1', { mode: 'direct' });
      expect(result.mode).toBe('direct');
      expect(mocks.update).not.toHaveBeenCalled();
    });
  });
});
