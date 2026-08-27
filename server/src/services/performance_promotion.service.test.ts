// M3-D6: performance_promotion.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  employeeFindFirst: vi.fn(),
  recordFindMany: vi.fn(),
  auditCreate: vi.fn(),
  auditFindUnique: vi.fn(),
  auditFindMany: vi.fn(),
  auditCount: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: { findFirst: mocks.employeeFindFirst },
    performanceRecord: { findMany: mocks.recordFindMany },
    auditLog: {
      create: mocks.auditCreate,
      findUnique: mocks.auditFindUnique,
      findMany: mocks.auditFindMany,
      count: mocks.auditCount,
    },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as promotionService from './performance_promotion.service';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'promotion.lookback_years': 2,
      'promotion.min_a_count': 2,
      'promotion.min_s_count': 1,
    };
    return map[key] ?? null;
  });
  mocks.employeeFindFirst.mockResolvedValue({ id: 'emp-1', deletedAt: null });
  mocks.auditCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'promo-1',
    ...data,
  }));
});

describe('performance_promotion.service', () => {
  describe('proposePromotion', () => {
    it('2 年 3 个 A + 0 个 S → 满足晋升', async () => {
      mocks.recordFindMany.mockResolvedValue([
        { finalGrade: 'A' }, { finalGrade: 'A' }, { finalGrade: 'A' },
      ]);
      const result = await promotionService.proposePromotion('hr-1', {
        employeeId: 'emp-1', proposedPosition: '销售经理',
      });
      expect(result.requirementMet).toBe(true);
      expect(result.aCount).toBe(3);
    });

    it('2 年 1 个 S + 1 个 A → 满足晋升', async () => {
      mocks.recordFindMany.mockResolvedValue([
        { finalGrade: 'S' }, { finalGrade: 'A' },
      ]);
      const result = await promotionService.proposePromotion('hr-1', {
        employeeId: 'emp-1', proposedPosition: '销售经理',
      });
      expect(result.requirementMet).toBe(true);
      expect(result.sCount).toBe(1);
    });

    it('2 年 1 个 A + 0 个 S → 不满足抛 72905', async () => {
      mocks.recordFindMany.mockResolvedValue([{ finalGrade: 'A' }, { finalGrade: 'B' }]);
      await expect(
        promotionService.proposePromotion('hr-1', {
          employeeId: 'emp-1', proposedPosition: '销售经理',
        }),
      ).rejects.toMatchObject({ code: 72905 });
    });

    it('2 年 0 个 A + 0 个 S → 不满足抛 72905', async () => {
      mocks.recordFindMany.mockResolvedValue([{ finalGrade: 'B' }, { finalGrade: 'C' }]);
      await expect(
        promotionService.proposePromotion('hr-1', {
          employeeId: 'emp-1', proposedPosition: '销售经理',
        }),
      ).rejects.toMatchObject({ code: 72905 });
    });

    it('employee 不存在抛 404', async () => {
      mocks.employeeFindFirst.mockResolvedValue(null);
      await expect(
        promotionService.proposePromotion('hr-1', {
          employeeId: 'missing', proposedPosition: '销售经理',
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('listPromotions', () => {
    it('返 audit_logs 中 PROMOTION_PROPOSE 记录', async () => {
      mocks.auditFindMany.mockResolvedValue([{ id: 'promo-1', action: 'PROMOTION_PROPOSE' }]);
      mocks.auditCount.mockResolvedValue(1);
      const result = await promotionService.listPromotions('hr-1', {});
      expect(result.total).toBe(1);
    });

    it('指定 id 不存在抛 72904', async () => {
      mocks.auditFindUnique.mockResolvedValue(null);
      await expect(
        promotionService.listPromotions('hr-1', { id: 'missing' }),
      ).rejects.toMatchObject({ code: 72904 });
    });
  });
});
