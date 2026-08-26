// M3-D3: performance_grade.service 单元测试
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
  update: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  setValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    performanceRecord: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
  setValue: mocks.setValue,
}));

import {
  calcGradeFromScore,
  calculateGrade,
  calculateBatchGrade,
  getGradeThresholds,
  updateGradeThresholds,
  analyzeCoefficientRatios,
  validateThresholdOrder,
} from './performance_grade.service';

const thresholds = {
  S: 90, A: 80, B: 70, C: 60, D: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    if (key === 'grade.thresholds') return thresholds;
    if (key === 'grade.batch_size') return 100;
    if (key === 'grade.distribution') {
      return {
        S: 0.1, A: 0.2, B: 0.5, C: 0.15, D: 0.05,
      };
    }
    return null;
  });
  mocks.setValue.mockResolvedValue({ id: 'cfg-1', version: 2 });
  mocks.findUnique.mockResolvedValue({
    id: 'rec-1',
    status: 'ceo_approved',
    finalScore: new Decimal(85),
    finalGrade: null,
  });
  mocks.update.mockResolvedValue({ id: 'rec-1', finalGrade: 'A' });
});

describe('calcGradeFromScore', () => {
  it('finalScore=95 判定 S', () => {
    expect(calcGradeFromScore(95, thresholds)).toBe('S');
  });
  it('finalScore=85 判定 A', () => {
    expect(calcGradeFromScore(85, thresholds)).toBe('A');
  });
  it('finalScore=75 判定 B', () => {
    expect(calcGradeFromScore(75, thresholds)).toBe('B');
  });
  it('finalScore=65 判定 C', () => {
    expect(calcGradeFromScore(65, thresholds)).toBe('C');
  });
  it('finalScore=55 判定 D', () => {
    expect(calcGradeFromScore(55, thresholds)).toBe('D');
  });
  it('finalScore=90 边界值判定 S', () => {
    expect(calcGradeFromScore(90, thresholds)).toBe('S');
  });
  it('finalScore=89 边界值判定 A', () => {
    expect(calcGradeFromScore(89, thresholds)).toBe('A');
  });
});

describe('calculateGrade', () => {
  it('判定成功写 finalGrade', async () => {
    const result = await calculateGrade('user-1', 'rec-1');
    expect(result.newGrade).toBe('A');
    expect(mocks.update).toHaveBeenCalled();
  });

  it('finalScore=null 抛 72601', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 'rec-1', status: 'ceo_approved', finalScore: null, finalGrade: null,
    });
    await expect(calculateGrade('user-1', 'rec-1')).rejects.toMatchObject({ code: 72601 });
  });

  it('finalScore=101 抛 72603', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 'rec-1', status: 'ceo_approved', finalScore: new Decimal(101), finalGrade: null,
    });
    await expect(calculateGrade('user-1', 'rec-1')).rejects.toMatchObject({ code: 72603 });
  });

  it('finalGrade 已存在抛 72604', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 'rec-1', status: 'ceo_approved', finalScore: new Decimal(85), finalGrade: 'B',
    });
    await expect(calculateGrade('user-1', 'rec-1')).rejects.toMatchObject({ code: 72604 });
  });

  it('force=true 覆盖 finalGrade 成功', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 'rec-1', status: 'ceo_approved', finalScore: new Decimal(95), finalGrade: 'A',
    });
    const result = await calculateGrade('user-1', 'rec-1', { force: true });
    expect(result.newGrade).toBe('S');
  });

  it('status !== ceo_approved 抛 72503', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 'rec-1', status: 'draft', finalScore: new Decimal(85), finalGrade: null,
    });
    await expect(calculateGrade('user-1', 'rec-1')).rejects.toMatchObject({ code: 72503 });
  });
});

describe('calculateBatchGrade', () => {
  it('批量 2 条全部成功', async () => {
    const result = await calculateBatchGrade('user-1', ['rec-1', 'rec-2']);
    expect(result.succeeded.length).toBe(2);
  });

  it('空数组抛 72605', async () => {
    await expect(calculateBatchGrade('user-1', [])).rejects.toMatchObject({ code: 72605 });
  });

  it('超过 batch_size 抛 72606', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `rec-${i}`);
    await expect(calculateBatchGrade('user-1', ids)).rejects.toMatchObject({ code: 72606 });
  });
});

describe('getGradeThresholds / updateGradeThresholds', () => {
  it('读 5 档阈值成功', async () => {
    const t = await getGradeThresholds('user-1');
    expect(t.S).toBe(90);
  });

  it('写 5 档阈值成功', async () => {
    const t = await updateGradeThresholds('user-1', thresholds);
    expect(t.A).toBe(80);
    expect(mocks.setValue).toHaveBeenCalled();
  });

  it('S < A 抛 72608', () => {
    try {
      validateThresholdOrder({
        S: 70, A: 80, B: 60, C: 50, D: 0,
      });
      expect.fail('should throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 72608 });
    }
  });

  it('缺少 grade 抛 72607', () => {
    try {
      validateThresholdOrder({
        S: 90, A: 80, B: 70, C: 60, D: undefined as unknown as number,
      });
      expect.fail('should throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 72607 });
    }
  });
});

describe('analyzeCoefficientRatios', () => {
  it('默认 5 档系数分析成功', async () => {
    const result = await analyzeCoefficientRatios([
      { grade: 'S', coefficient: new Decimal(1.5) },
      { grade: 'A', coefficient: new Decimal(1.2) },
      { grade: 'B', coefficient: new Decimal(1.0) },
      { grade: 'C', coefficient: new Decimal(0.8) },
      { grade: 'D', coefficient: new Decimal(0.5) },
    ]);
    expect(result.averageCoefficient).toBeGreaterThan(0);
  });
});
