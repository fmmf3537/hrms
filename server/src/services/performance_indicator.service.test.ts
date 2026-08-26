// M3-D1: performance_indicator.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    performanceIndicator: {
      findUnique: mocks.findUnique,
      findMany: mocks.findMany,
      count: mocks.count,
      create: mocks.create,
      update: mocks.update,
    },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as indicatorService from './performance_indicator.service';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    if (key === 'indicator.types') return ['KPI', 'OKR', 'BSC', '360'];
    if (key === 'indicator.max_weight') return 100;
    return null;
  });
});

describe('createPerformanceIndicator', () => {
  it('创建 KPI 指标成功', async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue({
      id: 'ind-1', code: 'KPI-SALES', type: 'KPI', status: 'active',
    });

    const result = await indicatorService.createPerformanceIndicator('user-1', {
      code: 'KPI-SALES',
      name: '销售额',
      type: 'KPI',
      defaultWeight: 30,
    });
    expect(result.type).toBe('KPI');
  });

  it('code 重复抛 72406', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(indicatorService.createPerformanceIndicator('user-1', {
      code: 'KPI-SALES', name: 'x', type: 'KPI',
    })).rejects.toMatchObject({ code: 72406 });
  });

  it('type 不在白名单抛 72407', async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(indicatorService.createPerformanceIndicator('user-1', {
      code: 'X', name: 'x', type: 'INVALID',
    })).rejects.toMatchObject({ code: 72407 });
  });

  it('defaultWeight=0 抛 72408', async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(indicatorService.createPerformanceIndicator('user-1', {
      code: 'X', name: 'x', type: 'KPI', defaultWeight: 0,
    })).rejects.toMatchObject({ code: 72408 });
  });

  it('defaultWeight=101 抛 72408', async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(indicatorService.createPerformanceIndicator('user-1', {
      code: 'X', name: 'x', type: 'KPI', defaultWeight: 101,
    })).rejects.toMatchObject({ code: 72408 });
  });
});

describe('archivePerformanceIndicator', () => {
  it('active → archived 成功', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'ind-1', status: 'active', code: 'KPI-SALES' });
    mocks.update.mockResolvedValue({ id: 'ind-1', status: 'archived' });

    const result = await indicatorService.archivePerformanceIndicator('user-1', 'ind-1');
    expect(result.status).toBe('archived');
  });

  it('已是 archived 抛 72404', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'ind-1', status: 'archived' });
    await expect(indicatorService.archivePerformanceIndicator('user-1', 'ind-1'))
      .rejects.toMatchObject({ code: 72404 });
  });
});

describe('listPerformanceIndicators', () => {
  it('默认只返 active', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'ind-1', status: 'active' }]);
    mocks.count.mockResolvedValue(1);

    const result = await indicatorService.listPerformanceIndicators('user-1', {});
    expect(result.items[0].status).toBe('active');
  });
});
