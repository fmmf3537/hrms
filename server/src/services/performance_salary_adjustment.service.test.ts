// M3-D6: performance_salary_adjustment.service 单元测试
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
  auditFindFirst: vi.fn(),
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
      findFirst: mocks.auditFindFirst,
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

import * as adjustmentService from './performance_salary_adjustment.service';

function grades(list: string[]) {
  return list.map((finalGrade, i) => ({
    id: `r-${i}`, finalGrade, status: 'archived', archivedAt: new Date(2026, 8 - i, 1),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'salary_adjustment.evaluation_quarters': 4,
      'salary_adjustment.s_threshold': 0.5,
      'salary_adjustment.s_adjustment': 0.1,
      'salary_adjustment.a_adjustment': 0.05,
    };
    return map[key] ?? null;
  });
  mocks.employeeFindFirst.mockResolvedValue({ id: 'emp-1', deletedAt: null });
  mocks.auditCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'audit-1',
    ...data,
  }));
  mocks.auditFindFirst.mockResolvedValue(null);
});

describe('performance_salary_adjustment.service', () => {
  describe('proposeAdjustment', () => {
    it('4 季度 3 个 S + 1 个 A → 调薪 10%', async () => {
      mocks.recordFindMany.mockResolvedValue(grades(['S', 'S', 'S', 'A']));
      const result = await adjustmentService.proposeAdjustment('hr-1', {
        employeeId: 'emp-1', period: '2026-Q3',
      });
      expect(result.adjustmentRate).toBe(0.1);
      expect(result.sRatio).toBe(0.75);
    });

    it('4 季度 2 个 S + 1 个 A + 1 个 B → 调薪 10%（S 比例 50%）', async () => {
      mocks.recordFindMany.mockResolvedValue(grades(['S', 'S', 'A', 'B']));
      const result = await adjustmentService.proposeAdjustment('hr-1', {
        employeeId: 'emp-1', period: '2026-Q3',
      });
      expect(result.adjustmentRate).toBe(0.1);
    });

    it('4 季度 3 个 A + 1 个 B → 调薪 5%', async () => {
      mocks.recordFindMany.mockResolvedValue(grades(['A', 'A', 'A', 'B']));
      const result = await adjustmentService.proposeAdjustment('hr-1', {
        employeeId: 'emp-1', period: '2026-Q3',
      });
      expect(result.adjustmentRate).toBe(0.05);
    });

    it('4 季度 全 B/C → 不调薪（0）', async () => {
      mocks.recordFindMany.mockResolvedValue(grades(['B', 'B', 'C', 'C']));
      const result = await adjustmentService.proposeAdjustment('hr-1', {
        employeeId: 'emp-1', period: '2026-Q3',
      });
      expect(result.adjustmentRate).toBe(0);
    });

    it('period 格式错抛 72902', async () => {
      await expect(
        adjustmentService.proposeAdjustment('hr-1', { employeeId: 'emp-1', period: '2026-09' }),
      ).rejects.toMatchObject({ code: 72902 });
    });

    it('记录不足 4 季度抛 400', async () => {
      mocks.recordFindMany.mockResolvedValue(grades(['S', 'A']));
      await expect(
        adjustmentService.proposeAdjustment('hr-1', { employeeId: 'emp-1', period: '2026-Q3' }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('employee 不存在抛 404', async () => {
      mocks.employeeFindFirst.mockResolvedValue(null);
      await expect(
        adjustmentService.proposeAdjustment('hr-1', { employeeId: 'missing', period: '2026-Q3' }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('approveAdjustment', () => {
    it('approved=true 写 audit', async () => {
      mocks.auditFindUnique.mockResolvedValue({
        id: 'audit-1', action: 'SALARY_ADJUSTMENT_PROPOSE', resourceId: 'emp-1',
      });
      const result = await adjustmentService.approveAdjustment('exec-1', 'audit-1', { approved: true });
      expect(result.approved).toBe(true);
      expect(mocks.auditCreate).toHaveBeenCalled();
    });

    it('auditLogId 不存在抛 72901', async () => {
      mocks.auditFindUnique.mockResolvedValue(null);
      await expect(
        adjustmentService.approveAdjustment('exec-1', 'missing', { approved: true }),
      ).rejects.toMatchObject({ code: 72901 });
    });

    it('已审批抛 72903', async () => {
      mocks.auditFindUnique.mockResolvedValue({
        id: 'audit-1', action: 'SALARY_ADJUSTMENT_PROPOSE', resourceId: 'emp-1',
      });
      mocks.auditFindFirst.mockResolvedValue({ id: 'approve-1' });
      await expect(
        adjustmentService.approveAdjustment('exec-1', 'audit-1', { approved: true }),
      ).rejects.toMatchObject({ code: 72903 });
    });
  });

  describe('listAdjustments', () => {
    it('返 audit_logs 中 SALARY_ADJUSTMENT_PROPOSE 记录', async () => {
      mocks.auditFindMany.mockResolvedValue([{ id: 'audit-1', action: 'SALARY_ADJUSTMENT_PROPOSE' }]);
      mocks.auditCount.mockResolvedValue(1);
      const result = await adjustmentService.listAdjustments('hr-1', {});
      expect(result.total).toBe(1);
    });
  });
});
