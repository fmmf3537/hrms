// M3-D1: performance_coefficient.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    performanceCoefficient: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
      create: mocks.create,
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

import * as coefService from './performance_coefficient.service';

const activeRows = [
  { grade: 'S', coefficient: 1.5, effectiveTo: null },
  { grade: 'A', coefficient: 1.2, effectiveTo: null },
  { grade: 'B', coefficient: 1.0, effectiveTo: null },
  { grade: 'C', coefficient: 0.8, effectiveTo: null },
  { grade: 'D', coefficient: 0.5, effectiveTo: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    if (key === 'coefficient.grades') return ['S', 'A', 'B', 'C', 'D'];
    if (key === 'coefficient.max_history_versions') return 12;
    return null;
  });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      performanceCoefficient: {
        updateMany: mocks.updateMany,
        create: mocks.create,
      },
    };
    return fn(tx);
  });
  mocks.create.mockImplementation(async ({ data }: { data: { grade: string } }) => ({
    id: `coef-${data.grade}`,
    ...data,
  }));
});

describe('getActiveCoefficients', () => {
  it('5 档全有效返对象', async () => {
    mocks.findMany.mockResolvedValue(activeRows);

    const result = await coefService.getActiveCoefficients();
    expect(result.S).toBe(1.5);
    expect(result.D).toBe(0.5);
  });

  it('任一档位缺失抛 500', async () => {
    mocks.findMany.mockResolvedValue(activeRows.slice(0, 4));
    await expect(coefService.getActiveCoefficients()).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe('updateCoefficients', () => {
  it('写入新版本成功', async () => {
    const input = {
      S: 1.6, A: 1.2, B: 1.0, C: 0.8, D: 0.5,
    };
    const result = await coefService.updateCoefficients('user-1', input);
    expect(result).toHaveLength(5);
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('系数 ≤0 抛 72410', async () => {
    await expect(coefService.updateCoefficients('user-1', {
      S: 0, A: 1.2, B: 1.0, C: 0.8, D: 0.5,
    })).rejects.toMatchObject({ code: 72410 });
  });

  it('系数 >10 抛 72410', async () => {
    await expect(coefService.updateCoefficients('user-1', {
      S: 11, A: 1.2, B: 1.0, C: 0.8, D: 0.5,
    })).rejects.toMatchObject({ code: 72410 });
  });
});

describe('listCoefficientHistory', () => {
  it('某 grade 历史版本按 effectiveFrom 倒序', async () => {
    mocks.findMany.mockResolvedValue([
      { grade: 'S', effectiveFrom: new Date('2026-08-01') },
      { grade: 'S', effectiveFrom: new Date('2026-01-01') },
    ]);

    const result = await coefService.listCoefficientHistory('user-1', 'S');
    expect(result).toHaveLength(2);
    expect(mocks.auditLog).toHaveBeenCalled();
  });
});
