// M4-C8: salary_adjustment_query.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import { Decimal } from '@prisma/client/runtime/library';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  adjFindMany: vi.fn(),
  adjFindUnique: vi.fn(),
  adjCount: vi.fn(),
  adjUpdate: vi.fn(),
  userFindUnique: vi.fn(),
  employeeFindMany: vi.fn(),
  employeeFindUnique: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    salaryAdjustment: {
      findMany: mocks.adjFindMany,
      findUnique: mocks.adjFindUnique,
      count: mocks.adjCount,
      update: mocks.adjUpdate,
    },
    user: { findUnique: mocks.userFindUnique },
    employee: {
      findMany: mocks.employeeFindMany,
      findUnique: mocks.employeeFindUnique,
    },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

import * as queryService from './salary_adjustment_query.service';

const ACTOR = 'user-hr';
const EMP = 'emp-1';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'adj-1',
    employeeId: EMP,
    adjustmentType: 'annual_adjust',
    status: 'draft',
    delta: new Decimal(1000),
    effectiveDate: new Date('2026-03-22T00:00:00.000Z'),
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-03-15T00:00:00.000Z') });
  vi.clearAllMocks();
  mocks.userFindUnique.mockResolvedValue({
    id: ACTOR,
    userRoles: [{ role: { code: 'hr' } }],
    employee: { id: EMP, departmentId: 'dept-1' },
  });
  mocks.adjFindMany.mockResolvedValue([row()]);
  mocks.adjCount.mockResolvedValue(1);
  mocks.adjFindUnique.mockResolvedValue(row());
  mocks.adjUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...row(), ...data,
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('salary_adjustment_query.service', () => {
  describe('listAdjustments', () => {
    it('按 status + adjustmentType + period 过滤', async () => {
      const r = await queryService.listAdjustments(ACTOR, {
        status: 'draft',
        adjustmentType: 'annual_adjust',
        period: '2026-03',
        page: 1,
        pageSize: 10,
      });
      expect(r.total).toBe(1);
      expect(mocks.adjFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'draft',
            adjustmentType: 'annual_adjust',
          }),
        }),
      );
    });

    it('employee 仅看自己（权限过滤）', async () => {
      mocks.userFindUnique.mockResolvedValue({
        id: ACTOR,
        userRoles: [{ role: { code: 'employee' } }],
        employee: { id: EMP, departmentId: 'dept-1' },
      });
      await queryService.listAdjustments(ACTOR, { page: 1, pageSize: 10 });
      expect(mocks.adjFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId: EMP },
        }),
      );
    });

    it('分页正确（page=1 / pageSize=10）', async () => {
      const r = await queryService.listAdjustments(ACTOR, { page: 1, pageSize: 10 });
      expect(r.page).toBe(1);
      expect(r.pageSize).toBe(10);
      expect(mocks.adjFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });
  });

  describe('cancelAdjustment', () => {
    it('draft → cancelled 成功', async () => {
      const rec = await queryService.cancelAdjustment(ACTOR, 'adj-1', { reason: '撤回' });
      expect(rec.status).toBe('cancelled');
    });

    it('pending → cancelled 成功', async () => {
      mocks.adjFindUnique.mockResolvedValue(row({ status: 'pending' }));
      const rec = await queryService.cancelAdjustment(ACTOR, 'adj-1', { reason: '撤回' });
      expect(rec.status).toBe('cancelled');
    });

    it('executed 状态抛 73810', async () => {
      mocks.adjFindUnique.mockResolvedValue(row({ status: 'executed' }));
      await expect(queryService.cancelAdjustment(ACTOR, 'adj-1', { reason: 'x' }))
        .rejects.toMatchObject({ statusCode: 400, code: 73810 });
    });

    it('rejected 状态抛 73810', async () => {
      mocks.adjFindUnique.mockResolvedValue(row({ status: 'rejected' }));
      await expect(queryService.cancelAdjustment(ACTOR, 'adj-1', { reason: 'x' }))
        .rejects.toMatchObject({ statusCode: 400, code: 73810 });
    });
  });

  describe('getAdjustmentSummary', () => {
    it('按 status / adjustmentType / period 统计正确', async () => {
      mocks.adjFindMany.mockResolvedValue([
        row({ status: 'draft', adjustmentType: 'annual_adjust', delta: new Decimal(1000) }),
        row({
          id: 'adj-2', status: 'approved', adjustmentType: 'promotion', delta: new Decimal(2000),
        }),
      ]);
      const r = await queryService.getAdjustmentSummary(ACTOR, '2026-03');
      expect(r.period).toBe('2026-03');
      expect(r.byStatus.draft.count).toBe(1);
      expect(r.byType.promotion.count).toBe(1);
      expect(r.totalDelta).toBe(3000);
    });
  });
});
