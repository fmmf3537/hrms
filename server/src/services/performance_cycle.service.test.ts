// M3-D1: performance_cycle.service 单元测试
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
    performanceCycle: {
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

import * as cycleService from './performance_cycle.service';

const baseInput = {
  code: '2026-09',
  name: '2026 年 9 月',
  type: 'monthly',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockResolvedValue(['monthly', 'quarterly', 'yearly']);
});

describe('createPerformanceCycle', () => {
  it('创建成功（monthly + 唯一 code + 日期合法）', async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 'cyc-1', ...baseInput, status: 'draft' });

    const result = await cycleService.createPerformanceCycle('user-1', baseInput);
    expect(result.id).toBe('cyc-1');
    expect(result.status).toBe('draft');
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('code 重复抛 72401', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(cycleService.createPerformanceCycle('user-1', baseInput))
      .rejects.toMatchObject({ code: 72401 });
  });

  it('type 不在白名单抛 72403', async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(cycleService.createPerformanceCycle('user-1', { ...baseInput, type: 'invalid' }))
      .rejects.toMatchObject({ code: 72403 });
  });

  it('startDate ≥ endDate 抛 72402', async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(cycleService.createPerformanceCycle('user-1', {
      ...baseInput,
      startDate: '2026-09-30',
      endDate: '2026-09-01',
    })).rejects.toMatchObject({ code: 72402 });
  });
});

describe('updatePerformanceCycle', () => {
  it('draft 状态可改 name', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 'cyc-1',
      status: 'draft',
      code: '2026-09',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-30'),
    });
    mocks.update.mockResolvedValue({ id: 'cyc-1', name: '新名称', status: 'draft' });

    const result = await cycleService.updatePerformanceCycle('user-1', 'cyc-1', { name: '新名称' });
    expect(result.name).toBe('新名称');
  });

  it('closed 状态不可改抛 72404', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'cyc-1', status: 'closed' });
    await expect(cycleService.updatePerformanceCycle('user-1', 'cyc-1', { name: 'x' }))
      .rejects.toMatchObject({ code: 72404 });
  });
});

describe('closePerformanceCycle', () => {
  it('active → closed 成功', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'cyc-1', status: 'active', code: '2026-09' });
    mocks.update.mockResolvedValue({ id: 'cyc-1', status: 'closed' });

    const result = await cycleService.closePerformanceCycle('user-1', 'cyc-1');
    expect(result.status).toBe('closed');
  });

  it('当前状态非 active 抛 72404', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'cyc-1', status: 'draft' });
    await expect(cycleService.closePerformanceCycle('user-1', 'cyc-1'))
      .rejects.toMatchObject({ code: 72404 });
  });
});

describe('listPerformanceCycles', () => {
  it('默认分页返回 items', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'cyc-1' }]);
    mocks.count.mockResolvedValue(1);

    const result = await cycleService.listPerformanceCycles('user-1', {});
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});
