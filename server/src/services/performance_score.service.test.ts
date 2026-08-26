// M3-D2: performance_score.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import { Decimal } from '@prisma/client/runtime/library';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    performanceRecord: { findUnique: mocks.findUnique },
    performanceSchemeIndicator: { findMany: mocks.findMany },
    performanceScore: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
      create: mocks.create,
    },
    performanceScoreItem: {
      createMany: mocks.createMany,
      findMany: mocks.findMany,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as scoreService from './performance_score.service';

const schemeIndicators = [
  { indicatorId: 'ind-1', weight: new Decimal(60) },
  { indicatorId: 'ind-2', weight: new Decimal(40) },
];

const validItems = [
  { indicatorId: 'ind-1', score: 80 },
  { indicatorId: 'ind-2', score: 90 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation((_cat: string, key: string) => {
    if (key === 'score.min') return 0;
    if (key === 'score.max') return 100;
    if (key === 'score.weight_tolerance') return 0.01;
    return null;
  });
  mocks.findUnique.mockResolvedValue({ id: 'rec-1', status: 'draft', schemeId: 'sch-1' });
  mocks.findMany.mockImplementation((args: { where?: { scoreId?: string } }) => {
    if (args?.where?.scoreId) {
      return Promise.resolve([
        {
          id: 'item-1', indicatorId: 'ind-1', weight: new Decimal(60), scoreValue: new Decimal(80), weightedScore: new Decimal(48), comment: null,
        },
        {
          id: 'item-2', indicatorId: 'ind-2', weight: new Decimal(40), scoreValue: new Decimal(90), weightedScore: new Decimal(36), comment: null,
        },
      ]);
    }
    return Promise.resolve(schemeIndicators);
  });
  mocks.findFirst.mockResolvedValue(null);
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
    performanceScore: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
      create: mocks.create.mockResolvedValue({
        id: 'score-1',
        recordId: 'rec-1',
        stage: 'self',
        totalScore: new Decimal(84),
        version: 1,
        isCurrent: true,
      }),
    },
    performanceScoreItem: {
      createMany: mocks.createMany,
      findMany: mocks.findMany,
    },
  }));
});

describe('validateScoreItems (via saveStageScore)', () => {
  it('保存自评草稿成功', async () => {
    const result = await scoreService.saveStageScore('user-1', 'rec-1', 'self', { items: validItems }, 'SELF_EVALUATE');
    expect(result.id).toBe('score-1');
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('version 递增（第二次保存 version=2）', async () => {
    mocks.findFirst.mockResolvedValueOnce({ version: 1 });
    mocks.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn({
      performanceScore: {
        findFirst: vi.fn().mockResolvedValue({ version: 1 }),
        updateMany: mocks.updateMany,
        create: vi.fn().mockResolvedValue({
          id: 'score-2', version: 2, totalScore: new Decimal(84), isCurrent: true,
        }),
      },
      performanceScoreItem: { createMany: mocks.createMany, findMany: mocks.findMany },
    }));
    const result = await scoreService.saveStageScore('user-1', 'rec-1', 'self', { items: validItems }, 'SELF_EVALUATE');
    expect(result.version).toBe(2);
  });

  it('items 未覆盖全部 indicators 抛 72507', async () => {
    await expect(scoreService.saveStageScore('user-1', 'rec-1', 'self', {
      items: [{ indicatorId: 'ind-1', score: 80 }],
    }, 'SELF_EVALUATE')).rejects.toMatchObject({ code: 72507 });
  });

  it('score=101 抛 72508', async () => {
    await expect(scoreService.saveStageScore('user-1', 'rec-1', 'self', {
      items: [{ indicatorId: 'ind-1', score: 101 }, { indicatorId: 'ind-2', score: 90 }],
    }, 'SELF_EVALUATE')).rejects.toMatchObject({ code: 72508 });
  });

  it('score=-1 抛 72508', async () => {
    await expect(scoreService.saveStageScore('user-1', 'rec-1', 'self', {
      items: [{ indicatorId: 'ind-1', score: -1 }, { indicatorId: 'ind-2', score: 90 }],
    }, 'SELF_EVALUATE')).rejects.toMatchObject({ code: 72508 });
  });

  it('权重和≠100 抛 72509', async () => {
    mocks.findMany.mockResolvedValueOnce([
      { indicatorId: 'ind-1', weight: new Decimal(50) },
      { indicatorId: 'ind-2', weight: new Decimal(40) },
    ]);
    await expect(scoreService.saveStageScore('user-1', 'rec-1', 'self', { items: validItems }, 'SELF_EVALUATE'))
      .rejects.toMatchObject({ code: 72509 });
  });

  it('状态非 draft 抛 72503/72510', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'rec-1', status: 'manager_scoring', schemeId: 'sch-1' });
    await expect(scoreService.saveStageScore('user-1', 'rec-1', 'self', { items: validItems }, 'SELF_EVALUATE'))
      .rejects.toMatchObject({ code: 72503 });
  });
});

describe('assertCurrentScoreExists', () => {
  it('无当前评分抛 72507', async () => {
    mocks.findFirst.mockReset();
    mocks.findFirst.mockResolvedValue(null);
    await expect(scoreService.assertCurrentScoreExists('rec-1', 'self'))
      .rejects.toMatchObject({ code: 72507 });
  });
});
