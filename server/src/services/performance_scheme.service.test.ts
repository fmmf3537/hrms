// M3-D1: performance_scheme.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  schemeFindUnique: vi.fn(),
  schemeFindMany: vi.fn(),
  schemeCount: vi.fn(),
  schemeCreate: vi.fn(),
  schemeUpdate: vi.fn(),
  linkFindMany: vi.fn(),
  linkCreateMany: vi.fn(),
  linkDeleteMany: vi.fn(),
  indicatorFindMany: vi.fn(),
  cycleFindUnique: vi.fn(),
  deptFindUnique: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    performanceScheme: {
      findUnique: mocks.schemeFindUnique,
      findMany: mocks.schemeFindMany,
      count: mocks.schemeCount,
      create: mocks.schemeCreate,
      update: mocks.schemeUpdate,
    },
    performanceSchemeIndicator: {
      findMany: mocks.linkFindMany,
      createMany: mocks.linkCreateMany,
      deleteMany: mocks.linkDeleteMany,
    },
    performanceIndicator: { findMany: mocks.indicatorFindMany },
    performanceCycle: { findUnique: mocks.cycleFindUnique },
    department: { findUnique: mocks.deptFindUnique },
    $transaction: mocks.transaction,
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as schemeService from './performance_scheme.service';

const indicators = [
  { indicatorId: 'ind-1', weight: 40 },
  { indicatorId: 'ind-2', weight: 30 },
  { indicatorId: 'ind-3', weight: 30 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockResolvedValue(['company', 'department', 'position']);
  mocks.indicatorFindMany.mockResolvedValue([
    { id: 'ind-1' }, { id: 'ind-2' }, { id: 'ind-3' },
  ]);
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      performanceScheme: {
        create: mocks.schemeCreate,
        update: mocks.schemeUpdate,
      },
      performanceSchemeIndicator: {
        createMany: mocks.linkCreateMany,
        deleteMany: mocks.linkDeleteMany,
        findMany: mocks.linkFindMany,
      },
    };
    return fn(tx);
  });
  mocks.schemeCreate.mockResolvedValue({
    id: 'sch-1', code: 'SCH-1', name: '方案1', status: 'draft',
  });
  mocks.linkFindMany.mockResolvedValue([]);
});

describe('createPerformanceScheme', () => {
  it('company 范围 + 3 个指标（权重 40/30/30）成功', async () => {
    mocks.schemeFindUnique.mockResolvedValue(null);

    const result = await schemeService.createPerformanceScheme('user-1', {
      code: 'SCH-1',
      name: '销售方案',
      applicableScope: 'company',
      indicators,
    });
    expect(result.id).toBe('sch-1');
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('department 范围未传 applicableDeptId 抛 72411', async () => {
    mocks.schemeFindUnique.mockResolvedValue(null);
    await expect(schemeService.createPerformanceScheme('user-1', {
      code: 'SCH-1',
      name: 'x',
      applicableScope: 'department',
      indicators,
    })).rejects.toMatchObject({ code: 72411 });
  });

  it('权重和 = 90 抛 72409', async () => {
    mocks.schemeFindUnique.mockResolvedValue(null);
    await expect(schemeService.createPerformanceScheme('user-1', {
      code: 'SCH-1',
      name: 'x',
      applicableScope: 'company',
      indicators: [{ indicatorId: 'ind-1', weight: 90 }],
    })).rejects.toMatchObject({ code: 72409 });
  });
});

describe('clonePerformanceScheme', () => {
  it('复制成功（含 indicators 中间表）', async () => {
    mocks.schemeFindUnique
      .mockResolvedValueOnce({
        id: 'sch-src',
        code: 'SRC',
        indicators: [{
          indicatorId: 'ind-1', weight: 100, target: null, sortOrder: 0,
        }],
        cycleId: null,
        applicableScope: 'company',
        applicableDeptId: null,
        applicablePositionLevel: null,
        description: null,
      })
      .mockResolvedValueOnce(null);
    mocks.schemeCreate.mockResolvedValue({ id: 'sch-new', code: 'NEW', status: 'draft' });
    mocks.linkFindMany.mockResolvedValue([{ indicatorId: 'ind-1', weight: 100, sortOrder: 0 }]);

    const result = await schemeService.clonePerformanceScheme('user-1', 'sch-src', 'NEW', '新方案');
    expect(result.code).toBe('NEW');
  });

  it('源方案不存在抛 404', async () => {
    mocks.schemeFindUnique.mockResolvedValue(null);
    await expect(schemeService.clonePerformanceScheme('user-1', 'missing', 'N', 'n'))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('updatePerformanceScheme', () => {
  it('active 状态不可改 indicators 抛 72404', async () => {
    mocks.schemeFindUnique.mockResolvedValue({
      id: 'sch-1', status: 'active', code: 'SCH-1', indicators: [],
    });
    await expect(schemeService.updatePerformanceScheme('user-1', 'sch-1', {
      indicators: [{ indicatorId: 'ind-1', weight: 100 }],
    })).rejects.toMatchObject({ code: 72404 });
  });
});

describe('listPerformanceSchemes', () => {
  it('filter cycleId 只返指定周期的方案', async () => {
    mocks.schemeFindMany.mockResolvedValue([{ id: 'sch-1', cycleId: 'cyc-1', indicators: [] }]);
    mocks.schemeCount.mockResolvedValue(1);

    const result = await schemeService.listPerformanceSchemes('user-1', { cycleId: 'cyc-1' });
    expect(result.items[0].cycleId).toBe('cyc-1');
  });
});
