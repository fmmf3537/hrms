// M4-C1: salary_plan.service 单元测试
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
  employeeFindFirst: vi.fn(),
  employeeFindUnique: vi.fn(),
  gradeFindUnique: vi.fn(),
  levelFindUnique: vi.fn(),
  planFindFirst: vi.fn(),
  planFindUnique: vi.fn(),
  planFindMany: vi.fn(),
  planCreate: vi.fn(),
  planUpdate: vi.fn(),
  planCount: vi.fn(),
  userFindUnique: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: {
      findFirst: mocks.employeeFindFirst,
      findUnique: mocks.employeeFindUnique,
    },
    salaryGrade: {
      findUnique: mocks.gradeFindUnique,
    },
    salaryGradeLevel: {
      findUnique: mocks.levelFindUnique,
    },
    employeeSalaryPlan: {
      findFirst: mocks.planFindFirst,
      findUnique: mocks.planFindUnique,
      findMany: mocks.planFindMany,
      create: mocks.planCreate,
      update: mocks.planUpdate,
      count: mocks.planCount,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as planService from './salary_plan.service';

const EMPLOYEE = { id: 'emp-1', departmentId: 'dept-1', deletedAt: null };
const GRADE = { id: 'grade-1', sequence: 'T', gradeCode: 'T3' };
const LEVEL = {
  id: 'level-1',
  gradeId: 'grade-1',
  level: 3,
  baseSalary: new Decimal(10000),
  performanceBase: new Decimal(2100),
  status: 'active',
};
const PLAN_INPUT = {
  employeeId: 'emp-1',
  gradeId: 'grade-1',
  levelId: 'level-1',
  baseSalary: 10000,
  performanceBase: 2100,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'plan.effective_default': 'next_month_first_day',
      'plan.lock_after_effective': true,
    };
    return map[key] ?? null;
  });
  mocks.employeeFindFirst.mockResolvedValue(EMPLOYEE);
  mocks.gradeFindUnique.mockResolvedValue(GRADE);
  mocks.levelFindUnique.mockResolvedValue(LEVEL);
  mocks.planFindFirst.mockResolvedValue(null);
  mocks.planCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'plan-1',
    ...data,
  }));
  mocks.planUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'plan-1',
    status: 'active',
    ...data,
  }));
  mocks.userFindUnique.mockResolvedValue({
    id: 'admin-1',
    userRoles: [{ role: { code: 'hr' } }],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('salary_plan.service', () => {
  describe('createPlan', () => {
    it('创建方案 status=active 成功', async () => {
      const result = await planService.createPlan('admin-1', {
        ...PLAN_INPUT,
        effectiveFrom: new Date(2026, 8, 1),
      });
      expect(result.status).toBe('active');
      expect(Number(result.baseSalary)).toBe(10000);
      expect(mocks.auditLog).toHaveBeenCalled();
    });

    it('employeeId 不存在抛 73010', async () => {
      mocks.employeeFindFirst.mockResolvedValue(null);
      await expect(planService.createPlan('admin-1', PLAN_INPUT))
        .rejects.toMatchObject({ statusCode: 400, code: 73010 });
    });

    it('gradeId 不存在抛 73001', async () => {
      mocks.gradeFindUnique.mockResolvedValue(null);
      await expect(planService.createPlan('admin-1', PLAN_INPUT))
        .rejects.toMatchObject({ statusCode: 400, code: 73001 });
    });

    it('levelId.gradeId !== gradeId 抛 73001', async () => {
      mocks.levelFindUnique.mockResolvedValue({ ...LEVEL, gradeId: 'other-grade' });
      await expect(planService.createPlan('admin-1', PLAN_INPUT))
        .rejects.toMatchObject({ statusCode: 400, code: 73001 });
    });

    it('baseSalary < level.baseSalary 抛 400', async () => {
      await expect(planService.createPlan('admin-1', {
        ...PLAN_INPUT, baseSalary: 5000,
      })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('effectiveFrom 不传默认次月 1 日', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 15));
      const result = await planService.createPlan('admin-1', PLAN_INPUT);
      expect(result.effectiveFrom).toEqual(new Date(2026, 8, 1));
    });
  });

  describe('listPlans', () => {
    it('filter employeeId 只返指定员工的', async () => {
      mocks.planFindMany.mockResolvedValue([{ id: 'plan-1', employeeId: 'emp-1' }]);
      mocks.planCount.mockResolvedValue(1);
      const result = await planService.listPlans('admin-1', { employeeId: 'emp-1' });
      expect(result.items).toHaveLength(1);
      expect(mocks.planFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ employeeId: 'emp-1' }),
        }),
      );
    });

    it('dept_head 仅看本部门员工', async () => {
      mocks.userFindUnique.mockResolvedValue({
        id: 'dh-1',
        userRoles: [{ role: { code: 'dept_head' } }],
      });
      mocks.employeeFindFirst.mockResolvedValue({ id: 'emp-dh', departmentId: 'dept-1' });
      mocks.planFindMany.mockResolvedValue([]);
      mocks.planCount.mockResolvedValue(0);
      await planService.listPlans('dh-1', {});
      expect(mocks.planFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ employee: { departmentId: 'dept-1' } }),
        }),
      );
    });
  });

  describe('getCurrentPlan', () => {
    it('返 effectiveFrom ≤ now < effectiveTo 的 active plan', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 15));
      mocks.planFindFirst.mockResolvedValue({
        id: 'plan-1',
        employeeId: 'emp-1',
        status: 'active',
        effectiveFrom: new Date(2026, 8, 1),
        effectiveTo: null,
      });
      const result = await planService.getCurrentPlan('admin-1', 'emp-1');
      expect(result.id).toBe('plan-1');
      expect(mocks.auditLog).toHaveBeenCalled();
    });

    it('无当前生效抛 73009', async () => {
      mocks.planFindFirst.mockResolvedValue(null);
      await expect(planService.getCurrentPlan('admin-1', 'emp-1'))
        .rejects.toMatchObject({ statusCode: 400, code: 73009 });
    });
  });

  describe('deactivatePlan', () => {
    it('active → inactive 成功', async () => {
      mocks.planFindUnique.mockResolvedValue({
        id: 'plan-1', status: 'active', employeeId: 'emp-1',
      });
      const result = await planService.deactivatePlan('admin-1', 'plan-1', {
        effectiveTo: new Date(2026, 8, 30),
      });
      expect(result.status).toBe('inactive');
    });

    it('已 inactive 抛 400', async () => {
      mocks.planFindUnique.mockResolvedValue({
        id: 'plan-1', status: 'inactive', employeeId: 'emp-1',
      });
      await expect(planService.deactivatePlan('admin-1', 'plan-1', {
        effectiveTo: new Date(2026, 8, 30),
      })).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
