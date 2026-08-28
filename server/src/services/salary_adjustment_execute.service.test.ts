// M4-C8: salary_adjustment_execute.service 单元测试
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
  adjFindUnique: vi.fn(),
  adjFindMany: vi.fn(),
  adjUpdate: vi.fn(),
  employeeFindUnique: vi.fn(),
  planFindFirst: vi.fn(),
  histCreate: vi.fn(),
  planUpdate: vi.fn(),
  planCreate: vi.fn(),
  posCreate: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    salaryAdjustment: {
      findUnique: mocks.adjFindUnique,
      findMany: mocks.adjFindMany,
      update: mocks.adjUpdate,
    },
    employee: { findUnique: mocks.employeeFindUnique },
    employeeSalaryPlan: { findFirst: mocks.planFindFirst },
    $transaction: mocks.transaction,
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

vi.mock('./notification.service', () => ({
  sendNotification: mocks.sendNotification,
}));

import * as execService from './salary_adjustment_execute.service';

const ACTOR = 'user-hr';
const NOW = new Date('2026-03-22T00:00:00.000Z');

function approved(over: Record<string, unknown> = {}) {
  return {
    id: 'adj-1',
    employeeId: 'emp-1',
    adjustmentType: 'annual_adjust',
    fromBaseSalary: new Decimal(10000),
    toBaseSalary: new Decimal(11000),
    toPerformanceSalary: new Decimal(2200),
    delta: new Decimal(1000),
    effectiveDate: new Date('2026-03-22T00:00:00.000Z'),
    status: 'approved',
    reason: '年度调整',
    ...over,
  };
}

function oldPlan() {
  return {
    id: 'plan-1',
    employeeId: 'emp-1',
    gradeId: 'g1',
    levelId: 'l1',
    baseSalary: new Decimal(10000),
    performanceBase: new Decimal(2000),
    allowance: new Decimal(0),
    welfare: 'demo',
    effectiveTo: null,
    status: 'active',
    createdById: ACTOR,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    if (key === 'adjustment.position_change_link') return true;
    if (key === 'adjustment.execute_mode') return 'manual';
    return null;
  });
  mocks.adjFindUnique.mockResolvedValue(approved());
  mocks.employeeFindUnique.mockResolvedValue({
    id: 'emp-1',
    companyId: 'co-1',
    departmentId: 'dept-1',
    userId: 'u-emp',
  });
  mocks.planFindFirst.mockResolvedValue(oldPlan());
  mocks.sendNotification.mockResolvedValue({ logId: 'n1', channel: 'email', status: 'pending' });
  mocks.histCreate.mockResolvedValue({ id: 'h1' });
  mocks.planUpdate.mockResolvedValue(oldPlan());
  mocks.planCreate.mockResolvedValue({ id: 'plan-2' });
  mocks.posCreate.mockResolvedValue({ id: 'pos-1' });
  mocks.adjUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...approved(), ...data,
  }));
  mocks.transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => fn({
    employeeSalaryHistory: { create: mocks.histCreate },
    employeeSalaryPlan: { update: mocks.planUpdate, create: mocks.planCreate },
    employeePositionHistory: { create: mocks.posCreate },
    salaryAdjustment: { update: mocks.adjUpdate },
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('salary_adjustment_execute.service', () => {
  describe('executeAdjustment', () => {
    it('approved + effective_date <= today → executed 成功', async () => {
      const rec = await execService.executeAdjustment(ACTOR, 'adj-1');
      expect(rec.status).toBe('executed');
    });

    it('写 M1 employee_salary_history（含 changeType 映射 + delta）', async () => {
      await execService.executeAdjustment(ACTOR, 'adj-1');
      expect(mocks.histCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            changeType: 'annual_adjust',
            baseSalary: 11000,
            totalSalary: 13200,
          }),
        }),
      );
    });

    it('同步 C1 employee_salary_plans（旧 plan 设 effectiveTo + 新 plan 创建）', async () => {
      await execService.executeAdjustment(ACTOR, 'adj-1');
      expect(mocks.planUpdate).toHaveBeenCalled();
      expect(mocks.planCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gradeId: 'g1', levelId: 'l1', baseSalary: 11000, status: 'active',
          }),
        }),
      );
    });

    it('联动 M1 employee_position_history（仅 promotion + position_change_link=true）', async () => {
      mocks.adjFindUnique.mockResolvedValue(approved({ adjustmentType: 'promotion' }));
      await execService.executeAdjustment(ACTOR, 'adj-1');
      expect(mocks.posCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ changeType: 'promote', toPosition: 'promoted' }),
        }),
      );
    });

    it('不联动 employee_position_history（非 promotion 或 position_change_link=false）', async () => {
      await execService.executeAdjustment(ACTOR, 'adj-1');
      expect(mocks.posCreate).not.toHaveBeenCalled();
      mocks.getValue.mockImplementation(async (_c: string, key: string) => {
        if (key === 'adjustment.position_change_link') return false;
        return 'manual';
      });
      mocks.adjFindUnique.mockResolvedValue(approved({ adjustmentType: 'promotion' }));
      await execService.executeAdjustment(ACTOR, 'adj-1');
      expect(mocks.posCreate).not.toHaveBeenCalled();
    });

    it('gradeId / levelId 沿用旧 plan（不实现 grade 升降级）', async () => {
      await execService.executeAdjustment(ACTOR, 'adj-1');
      expect(mocks.planCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ gradeId: 'g1', levelId: 'l1' }),
        }),
      );
    });

    it('已 executed 抛 73803', async () => {
      mocks.adjFindUnique.mockResolvedValue(approved({ status: 'executed' }));
      await expect(execService.executeAdjustment(ACTOR, 'adj-1'))
        .rejects.toMatchObject({ statusCode: 400, code: 73803 });
    });

    it('effective_date > today 抛 73805', async () => {
      mocks.adjFindUnique.mockResolvedValue(approved({
        effectiveDate: new Date('2026-04-01T00:00:00.000Z'),
      }));
      await expect(execService.executeAdjustment(ACTOR, 'adj-1'))
        .rejects.toMatchObject({ statusCode: 400, code: 73805 });
    });

    it('事务失败 rollback（写 employee_salary_plans 失败 → 保持 approved）', async () => {
      mocks.transaction.mockRejectedValue(new Error('plan write failed'));
      await expect(execService.executeAdjustment(ACTOR, 'adj-1'))
        .rejects.toMatchObject({ statusCode: 400, code: 73808 });
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILURE' }),
      );
    });

    it('通知走 notification.sendNotification（mock）', async () => {
      await execService.executeAdjustment(ACTOR, 'adj-1');
      expect(mocks.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          templateKey: 'salary_adjustment_executed',
          bypassTemplate: expect.objectContaining({ channel: 'email' }),
        }),
      );
    });

    it('audit 记录 fromBaseSalary + toBaseSalary + changeType', async () => {
      await execService.executeAdjustment(ACTOR, 'adj-1');
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SALARY_ADJUSTMENT_EXECUTE',
          newValue: expect.objectContaining({
            fromBaseSalary: 10000, toBaseSalary: 11000, changeType: 'annual_adjust',
          }),
        }),
      );
    });
  });

  describe('executePendingAdjustments', () => {
    it('扫描所有 approved + effective_date <= asOfDate', async () => {
      mocks.adjFindMany.mockResolvedValue([{ id: 'adj-1' }]);
      const r = await execService.executePendingAdjustments(ACTOR, '2026-03-22');
      expect(r.totalCount).toBe(1);
      expect(r.successCount).toBe(1);
      expect(mocks.adjFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'approved' }),
        }),
      );
    });

    it('单条失败不中断（记录到 results）', async () => {
      mocks.adjFindMany.mockResolvedValue([{ id: 'adj-1' }, { id: 'adj-2' }]);
      mocks.adjFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
        if (where.id === 'adj-2') return approved({ id: 'adj-2', status: 'executed' });
        return approved();
      });
      const r = await execService.executePendingAdjustments(ACTOR, '2026-03-22');
      expect(r.successCount).toBe(1);
      expect(r.failedCount).toBe(1);
      expect(r.results[1].status).toBe('failed');
    });

    it('audit 记录 batchMode: true + totalCount + successCount', async () => {
      mocks.adjFindMany.mockResolvedValue([{ id: 'adj-1' }]);
      await execService.executePendingAdjustments(ACTOR, '2026-03-22');
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: expect.objectContaining({
            batchMode: true, totalCount: 1, successCount: 1,
          }),
        }),
      );
    });
  });
});
