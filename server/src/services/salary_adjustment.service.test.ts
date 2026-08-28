// M4-C8: salary_adjustment.service 单元测试
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
  employeeFindUnique: vi.fn(),
  planFindFirst: vi.fn(),
  adjFindFirst: vi.fn(),
  adjFindUnique: vi.fn(),
  adjCreate: vi.fn(),
  adjUpdate: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  submitApproval: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: { findUnique: mocks.employeeFindUnique },
    employeeSalaryPlan: { findFirst: mocks.planFindFirst },
    salaryAdjustment: {
      findFirst: mocks.adjFindFirst,
      findUnique: mocks.adjFindUnique,
      create: mocks.adjCreate,
      update: mocks.adjUpdate,
    },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

vi.mock('./approval.service', () => ({
  submitApproval: mocks.submitApproval,
  approve: mocks.approve,
  reject: mocks.reject,
}));

import * as adjService from './salary_adjustment.service';

const ACTOR = 'user-hr';
const EMP = 'emp-1';
const NOW = new Date('2026-03-15T00:00:00.000Z');

function employee(over: Record<string, unknown> = {}) {
  return {
    id: EMP, status: 'active', deletedAt: null, departmentId: 'dept-1', ...over,
  };
}

function plan(over: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    employeeId: EMP,
    gradeId: 'g1',
    levelId: 'l1',
    baseSalary: new Decimal(10000),
    performanceBase: new Decimal(2000),
    status: 'active',
    effectiveTo: null,
    ...over,
  };
}

function draft(over: Record<string, unknown> = {}) {
  return {
    id: 'adj-1',
    employeeId: EMP,
    adjustmentType: 'annual_adjust',
    fromBaseSalary: new Decimal(10000),
    toBaseSalary: new Decimal(11000),
    delta: new Decimal(1000),
    effectiveDate: new Date('2026-03-22T00:00:00.000Z'),
    status: 'draft',
    approvalInstanceId: null,
    reason: '年度调整',
    createdBy: ACTOR,
    ...over,
  };
}

const BASE_INPUT = {
  employeeId: EMP,
  adjustmentType: 'annual_adjust' as const,
  toBaseSalary: 11000,
  effectiveDate: '2026-03-22',
  reason: '年度调整',
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    if (key === 'adjustment.min_increase_ratio') return 0.05;
    if (key === 'adjustment.max_increase_ratio') return 0.30;
    if (key === 'adjustment.advance_notice_days') return 7;
    if (key === 'adjustment.require_approval_threshold') return 5000;
    return null;
  });
  mocks.employeeFindUnique.mockResolvedValue(employee());
  mocks.planFindFirst.mockResolvedValue(plan());
  mocks.adjFindFirst.mockResolvedValue(null);
  mocks.adjCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'adj-1', ...data,
  }));
  mocks.adjFindUnique.mockResolvedValue(draft());
  mocks.adjUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...draft(), ...data,
  }));
  mocks.submitApproval.mockResolvedValue({ id: 'inst-1', status: 'pending', currentNodeId: 'n1' });
  mocks.approve.mockResolvedValue({ id: 'inst-1', status: 'approved', currentNodeId: null });
  mocks.reject.mockResolvedValue({ id: 'inst-1', status: 'rejected', currentNodeId: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('salary_adjustment.service', () => {
  describe('createAdjustment', () => {
    it('4 种类型（promotion / annual_adjust / performance / market_adjustment）', async () => {
      const types = ['promotion', 'annual_adjust', 'performance', 'market_adjustment'] as const;
      const created = await Promise.all(types.map((adjustmentType) => adjService.createAdjustment(
        ACTOR,
        { ...BASE_INPUT, adjustmentType },
      )));
      expect(created).toHaveLength(4);
      expect(mocks.adjCreate).toHaveBeenCalledTimes(4);
    });

    it('调薪后薪资 > 调薪前（涨幅 5%-30%）成功', async () => {
      const rec = await adjService.createAdjustment(ACTOR, BASE_INPUT);
      expect(rec.status).toBe('draft');
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SALARY_ADJUSTMENT_CREATE' }),
      );
    });

    it('减薪抛 73806', async () => {
      await expect(adjService.createAdjustment(ACTOR, { ...BASE_INPUT, toBaseSalary: 9000 }))
        .rejects.toMatchObject({ statusCode: 400, code: 73806 });
    });

    it('涨幅 < 5% 抛 73806', async () => {
      await expect(adjService.createAdjustment(ACTOR, { ...BASE_INPUT, toBaseSalary: 10400 }))
        .rejects.toMatchObject({ statusCode: 400, code: 73806 });
    });

    it('涨幅 > 30% 抛 73806', async () => {
      await expect(adjService.createAdjustment(ACTOR, { ...BASE_INPUT, toBaseSalary: 14000 }))
        .rejects.toMatchObject({ statusCode: 400, code: 73806 });
    });

    it('effective_date < 提前通知天数 抛 73805', async () => {
      await expect(adjService.createAdjustment(ACTOR, { ...BASE_INPUT, effectiveDate: '2026-03-18' }))
        .rejects.toMatchObject({ statusCode: 400, code: 73805 });
    });

    it('employee 已离职抛 73804', async () => {
      mocks.employeeFindUnique.mockResolvedValue(employee({ status: 'resigned' }));
      await expect(adjService.createAdjustment(ACTOR, BASE_INPUT))
        .rejects.toMatchObject({ statusCode: 404, code: 73804 });
    });

    it('employee 不存在抛 73804', async () => {
      mocks.employeeFindUnique.mockResolvedValue(null);
      await expect(adjService.createAdjustment(ACTOR, BASE_INPUT))
        .rejects.toMatchObject({ statusCode: 404, code: 73804 });
    });

    it('同 (employeeId, effectiveDate, adjustmentType) 已存在抛 73809', async () => {
      mocks.adjFindFirst.mockResolvedValue(draft());
      await expect(adjService.createAdjustment(ACTOR, BASE_INPUT))
        .rejects.toMatchObject({ statusCode: 400, code: 73809 });
    });
  });

  describe('submitAdjustment', () => {
    it('draft → pending 调 M0.5-1 approval（mock）', async () => {
      const rec = await adjService.submitAdjustment(ACTOR, 'adj-1');
      expect(rec.status).toBe('pending');
      expect(mocks.submitApproval).toHaveBeenCalledWith(
        expect.objectContaining({ flowKey: 'salary:salary_adjustment', businessId: 'adj-1' }),
      );
    });

    it('delta > require_approval_threshold 触发 CEO 终审', async () => {
      mocks.adjFindUnique.mockResolvedValue(draft({ delta: new Decimal(6000) }));
      await adjService.submitAdjustment(ACTOR, 'adj-1');
      expect(mocks.submitApproval).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ requireCeo: true }) }),
      );
    });

    it('status 非 draft 抛 73802', async () => {
      mocks.adjFindUnique.mockResolvedValue(draft({ status: 'pending' }));
      await expect(adjService.submitAdjustment(ACTOR, 'adj-1'))
        .rejects.toMatchObject({ statusCode: 400, code: 73802 });
    });
  });

  describe('approveAdjustment', () => {
    it('pending → approved（3 级审批完成）', async () => {
      mocks.adjFindUnique.mockResolvedValue(draft({
        status: 'pending', approvalInstanceId: 'inst-1',
      }));
      const rec = await adjService.approveAdjustment(ACTOR, 'adj-1', { action: 'approve' });
      expect(rec.status).toBe('approved');
    });

    it('pending → rejected（任何节点拒绝）', async () => {
      mocks.adjFindUnique.mockResolvedValue(draft({
        status: 'pending', approvalInstanceId: 'inst-1',
      }));
      const rec = await adjService.approveAdjustment(ACTOR, 'adj-1', { action: 'reject' });
      expect(rec.status).toBe('rejected');
      expect(mocks.reject).toHaveBeenCalled();
    });

    it('中间节点 approve 保持 pending', async () => {
      mocks.adjFindUnique.mockResolvedValue(draft({
        status: 'pending', approvalInstanceId: 'inst-1',
      }));
      mocks.approve.mockResolvedValue({ id: 'inst-1', status: 'pending', currentNodeId: 'n2' });
      const rec = await adjService.approveAdjustment(ACTOR, 'adj-1', { action: 'approve' });
      expect(rec.status).toBe('pending');
      expect(mocks.adjUpdate).not.toHaveBeenCalled();
    });

    it('status 非 pending 抛 73802', async () => {
      mocks.adjFindUnique.mockResolvedValue(draft({ status: 'draft' }));
      await expect(adjService.approveAdjustment(ACTOR, 'adj-1', { action: 'approve' }))
        .rejects.toMatchObject({ statusCode: 400, code: 73802 });
    });

    it('audit 记录 action + comment + approvalStatus', async () => {
      mocks.adjFindUnique.mockResolvedValue(draft({
        status: 'pending', approvalInstanceId: 'inst-1',
      }));
      await adjService.approveAdjustment(ACTOR, 'adj-1', { action: 'approve', comment: 'ok' });
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SALARY_ADJUSTMENT_APPROVE',
          newValue: expect.objectContaining({
            action: 'approve', comment: 'ok', approvalStatus: 'approved',
          }),
        }),
      );
    });
  });
});
