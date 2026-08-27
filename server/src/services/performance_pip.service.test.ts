// M3-D6: performance_pip.service 单元测试
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
  pipFindFirst: vi.fn(),
  pipFindUnique: vi.fn(),
  pipFindMany: vi.fn(),
  pipCount: vi.fn(),
  pipCreate: vi.fn(),
  pipUpdate: vi.fn(),
  reviewCount: vi.fn(),
  reviewCreate: vi.fn(),
  reviewFindFirst: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: { findFirst: mocks.employeeFindFirst },
    performanceRecord: { findMany: mocks.recordFindMany },
    performancePip: {
      findFirst: mocks.pipFindFirst,
      findUnique: mocks.pipFindUnique,
      findMany: mocks.pipFindMany,
      count: mocks.pipCount,
      create: mocks.pipCreate,
      update: mocks.pipUpdate,
    },
    performancePipReview: {
      count: mocks.reviewCount,
      create: mocks.reviewCreate,
      findFirst: mocks.reviewFindFirst,
    },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as pipService from './performance_pip.service';

const futureEnd = new Date(2027, 0, 1);

function activePip(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pip-1',
    employeeId: 'emp-1',
    status: 'active',
    startDate: new Date(2026, 8, 1),
    endDate: futureEnd,
    outcome: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'pip.d_grade_quarters': 2,
      'pip.duration_months': 3,
      'pip.review_frequency': 'monthly',
      'pip.training_required': true,
    };
    return map[key] ?? null;
  });
  mocks.employeeFindFirst.mockResolvedValue({ id: 'emp-1', deletedAt: null });
  mocks.pipFindFirst.mockResolvedValue(null);
  mocks.recordFindMany.mockResolvedValue([
    { finalGrade: 'D', archivedAt: new Date(2026, 5, 1) },
    { finalGrade: 'D', archivedAt: new Date(2026, 2, 1) },
  ]);
  mocks.pipCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'pip-1',
    ...data,
  }));
  mocks.pipUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'pip-1',
    employeeId: 'emp-1',
    ...data,
  }));
  mocks.reviewCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'rev-1',
    ...data,
  }));
  mocks.reviewCount.mockResolvedValue(0);
});

describe('performance_pip.service', () => {
  describe('triggerPip', () => {
    it('连续 2 季度 D 触发 PIP 成功', async () => {
      const result = await pipService.triggerPip('hr-1', 'emp-1', '连续两季度 D 档');
      expect(result.status).toBe('active');
      expect(mocks.pipCreate).toHaveBeenCalled();
    });

    it('员工已有 active PIP 抛 72907', async () => {
      mocks.pipFindFirst.mockResolvedValue(activePip());
      await expect(
        pipService.triggerPip('hr-1', 'emp-1', '连续两季度 D 档'),
      ).rejects.toMatchObject({ code: 72907 });
    });

    it('D 档不足 2 季度抛 72908', async () => {
      mocks.recordFindMany.mockResolvedValue([{ finalGrade: 'D' }]);
      await expect(
        pipService.triggerPip('hr-1', 'emp-1', '连续两季度 D 档'),
      ).rejects.toMatchObject({ code: 72908 });
    });

    it('D 档 + 其他 grade 抛 72908', async () => {
      mocks.recordFindMany.mockResolvedValue([{ finalGrade: 'D' }, { finalGrade: 'C' }]);
      await expect(
        pipService.triggerPip('hr-1', 'emp-1', '连续两季度 D 档'),
      ).rejects.toMatchObject({ code: 72908 });
    });

    it('employee 不存在抛 404', async () => {
      mocks.employeeFindFirst.mockResolvedValue(null);
      await expect(
        pipService.triggerPip('hr-1', 'missing', '连续两季度 D 档'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('reviewPip', () => {
    it('第 1 月评审 improved → status 保持 active', async () => {
      mocks.pipFindUnique.mockResolvedValue(activePip());
      mocks.reviewCount.mockResolvedValue(0);
      const result = await pipService.reviewPip('hr-1', 'pip-1', { rating: 'improved' });
      expect(result.pip.status).toBe('active');
      expect(result.review.reviewMonth).toBe(1);
    });

    it('第 3 月评审 improved → status=completed', async () => {
      mocks.pipFindUnique.mockResolvedValue(activePip());
      mocks.reviewCount.mockResolvedValue(2);
      const result = await pipService.reviewPip('hr-1', 'pip-1', { rating: 'improved' });
      expect(result.pip.status).toBe('completed');
    });

    it('第 1 月评审 worsened → status=failed + 写 PIP_FAIL_TRIGGER_OFFBOARDING', async () => {
      mocks.pipFindUnique.mockResolvedValue(activePip());
      mocks.reviewCount.mockResolvedValue(0);
      const result = await pipService.reviewPip('hr-1', 'pip-1', { rating: 'worsened' });
      expect(result.pip.status).toBe('failed');
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PIP_FAIL_TRIGGER_OFFBOARDING' }),
      );
    });

    it('PIP 不存在抛 72906', async () => {
      mocks.pipFindUnique.mockResolvedValue(null);
      await expect(
        pipService.reviewPip('hr-1', 'missing', { rating: 'improved' }),
      ).rejects.toMatchObject({ code: 72906 });
    });

    it('PIP 状态非 active 抛 72910', async () => {
      mocks.pipFindUnique.mockResolvedValue(activePip({ status: 'completed' }));
      await expect(
        pipService.reviewPip('hr-1', 'pip-1', { rating: 'improved' }),
      ).rejects.toMatchObject({ code: 72910 });
    });

    it('PIP 逾期漏评审抛 72909', async () => {
      mocks.pipFindUnique.mockResolvedValue(activePip({ endDate: new Date(2020, 0, 1) }));
      await expect(
        pipService.reviewPip('hr-1', 'pip-1', { rating: 'improved' }),
      ).rejects.toMatchObject({ code: 72909 });
    });
  });

  describe('completePip', () => {
    it('active → completed 成功', async () => {
      mocks.pipFindUnique.mockResolvedValue(activePip());
      const result = await pipService.completePip('hr-1', 'pip-1', '改进达标');
      expect(result.status).toBe('completed');
    });

    it('已 completed 抛 72910', async () => {
      mocks.pipFindUnique.mockResolvedValue(activePip({ status: 'completed' }));
      await expect(
        pipService.completePip('hr-1', 'pip-1', '重复'),
      ).rejects.toMatchObject({ code: 72910 });
    });
  });

  describe('failPip', () => {
    it('active → failed 成功', async () => {
      mocks.pipFindUnique.mockResolvedValue(activePip());
      const result = await pipService.failPip('hr-1', 'pip-1', '仍未达标');
      expect(result.status).toBe('failed');
    });
  });

  describe('listPips', () => {
    it('filter status=active', async () => {
      mocks.pipFindMany.mockResolvedValue([activePip()]);
      mocks.pipCount.mockResolvedValue(1);
      const result = await pipService.listPips('hr-1', { status: 'active' });
      expect(result.total).toBe(1);
    });
  });
});
