// M3-D4: performance_payout.service 单元测试
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
  employeeFindFirst: vi.fn(),
  employeeFindMany: vi.fn(),
  cycleFindUnique: vi.fn(),
  recordFindUnique: vi.fn(),
  payoutFindUnique: vi.fn(),
  payoutFindFirst: vi.fn(),
  payoutFindMany: vi.fn(),
  payoutCreate: vi.fn(),
  payoutUpdate: vi.fn(),
  payoutUpdateMany: vi.fn(),
  payoutCount: vi.fn(),
  coefFindMany: vi.fn(),
  salaryFindFirst: vi.fn(),
  deptFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: {
      findFirst: mocks.employeeFindFirst,
      findMany: mocks.employeeFindMany,
      findUnique: vi.fn(),
    },
    performanceCycle: { findUnique: mocks.cycleFindUnique },
    performanceRecord: { findUnique: mocks.recordFindUnique },
    performancePayout: {
      findUnique: mocks.payoutFindUnique,
      findFirst: mocks.payoutFindFirst,
      findMany: mocks.payoutFindMany,
      create: mocks.payoutCreate,
      update: mocks.payoutUpdate,
      updateMany: mocks.payoutUpdateMany,
      count: mocks.payoutCount,
    },
    performanceCoefficient: { findMany: mocks.coefFindMany },
    employeeSalaryHistory: { findFirst: mocks.salaryFindFirst },
    department: { findMany: mocks.deptFindMany },
    user: { findUnique: mocks.userFindUnique },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as payoutService from './performance_payout.service';

const coefRows = [
  { grade: 'S', coefficient: 1.5 },
  { grade: 'A', coefficient: 1.2 },
  { grade: 'B', coefficient: 1.0 },
  { grade: 'C', coefficient: 0.8 },
  { grade: 'D', coefficient: 0.5 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'coefficient.grades': ['S', 'A', 'B', 'C', 'D'],
      'coefficient.default': {
        S: 1.5, A: 1.2, B: 1.0, C: 0.8, D: 0.5,
      },
      'payout.direct.excluded_grades': ['D'],
      'payout.pool.min_members': 5,
      'payout.dept_coefficient_default': 1.0,
      'payout.prepay_rate': 0.5,
      'payout.prepay.months_per_quarter': 2,
      'payout.settle.trigger_cycle_status': ['closed', 'archived'],
    };
    return map[key] ?? null;
  });
  mocks.coefFindMany.mockResolvedValue(coefRows);
  mocks.salaryFindFirst.mockResolvedValue({ performanceSalary: new Decimal(10000), totalSalary: new Decimal(15000) });
  mocks.employeeFindFirst.mockResolvedValue({ id: 'emp-1', deletedAt: null });
  mocks.cycleFindUnique.mockResolvedValue({
    id: 'cycle-1', status: 'closed', startDate: new Date('2026-01-01'),
  });
  mocks.recordFindUnique.mockResolvedValue({
    status: 'archived', finalGrade: 'B', finalScore: new Decimal(80),
  });
  mocks.payoutFindUnique.mockResolvedValue(null);
  mocks.payoutFindFirst.mockResolvedValue(null);
  mocks.payoutCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'pay-1',
    ...data,
  }));
  mocks.userFindUnique.mockResolvedValue({
    userRoles: [{ role: { code: 'hr' } }],
  });
});

describe('performance_payout.service calculateDirect', () => {
  it('finalGrade=B 系数 1.0，baseAmount=10000，actualAmount=10000', async () => {
    const result = await payoutService.calculateDirect('admin-1', {
      employeeId: 'emp-1', cycleId: 'cycle-1', month: new Date('2026-09-01'),
    });
    expect(Number(result.actualAmount)).toBe(10000);
    expect(Number(result.coefficient)).toBe(1.0);
  });

  it('finalGrade=S 系数 1.5，actualAmount=15000', async () => {
    mocks.recordFindUnique.mockResolvedValue({
      status: 'archived', finalGrade: 'S', finalScore: new Decimal(95),
    });
    const result = await payoutService.calculateDirect('admin-1', {
      employeeId: 'emp-1', cycleId: 'cycle-1', month: new Date('2026-09-01'),
    });
    expect(Number(result.actualAmount)).toBe(15000);
  });

  it('finalGrade=D actualAmount=0（excluded_grades）', async () => {
    mocks.recordFindUnique.mockResolvedValue({
      status: 'archived', finalGrade: 'D', finalScore: new Decimal(50),
    });
    const result = await payoutService.calculateDirect('admin-1', {
      employeeId: 'emp-1', cycleId: 'cycle-1', month: new Date('2026-09-01'),
    });
    expect(Number(result.actualAmount)).toBe(0);
  });

  it('record.status !== archived 抛 72704', async () => {
    mocks.recordFindUnique.mockResolvedValue({ status: 'ceo_approving', finalGrade: 'A' });
    await expect(
      payoutService.calculateDirect('admin-1', {
        employeeId: 'emp-1', cycleId: 'cycle-1', month: new Date('2026-09-01'),
      }),
    ).rejects.toMatchObject({ code: 72704 });
  });

  it('employee 不存在抛 404', async () => {
    mocks.employeeFindFirst.mockResolvedValue(null);
    await expect(
      payoutService.calculateDirect('admin-1', {
        employeeId: 'emp-x', cycleId: 'cycle-1', month: new Date('2026-09-01'),
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('重复 employeeId+cycleId+month 抛 72710', async () => {
    mocks.payoutFindUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      payoutService.calculateDirect('admin-1', {
        employeeId: 'emp-1', cycleId: 'cycle-1', month: new Date('2026-09-01'),
      }),
    ).rejects.toMatchObject({ code: 72710 });
  });
});

describe('performance_payout.service calculatePool', () => {
  const members = Array.from({ length: 5 }, (_, i) => ({
    id: `emp-${i}`,
    departmentId: 'dept-1',
    status: 'active',
    deletedAt: null,
  }));

  beforeEach(() => {
    mocks.deptFindMany.mockResolvedValue([{ id: 'dept-1' }]);
    mocks.employeeFindMany.mockResolvedValue(members);
    mocks.recordFindUnique.mockResolvedValue({
      status: 'archived', finalGrade: 'B', finalScore: new Decimal(80),
    });
  });

  it('5 人部门池按比例分配', async () => {
    const results = await payoutService.calculatePoolByDept('admin-1', 'dept-1', 'cycle-1', new Date('2026-09-01'));
    expect(results.length).toBe(5);
    expect(mocks.payoutCreate).toHaveBeenCalledTimes(5);
  });

  it('部门成员 < 5 抛 72706', async () => {
    mocks.employeeFindMany.mockResolvedValue(members.slice(0, 3));
    await expect(
      payoutService.calculatePoolByDept('admin-1', 'dept-1', 'cycle-1', new Date('2026-09-01')),
    ).rejects.toMatchObject({ code: 72706 });
  });

  it('deptId 不存在抛 72705', async () => {
    mocks.deptFindMany.mockResolvedValue([]);
    await expect(
      payoutService.calculatePool('admin-1', {
        cycleId: 'cycle-1', month: new Date('2026-09-01'), deptIds: ['dept-x'],
      }),
    ).rejects.toMatchObject({ code: 72705 });
  });
});

describe('performance_payout.service prepay', () => {
  it('季度第 1 月预支 50%', async () => {
    mocks.cycleFindUnique.mockResolvedValue({ id: 'cycle-1', status: 'active', startDate: new Date('2026-01-01') });
    const results = await payoutService.prepay('admin-1', {
      cycleId: 'cycle-1', month: new Date('2026-01-01'), employeeId: 'emp-1',
    });
    expect(results.length).toBe(1);
    expect(Number(results[0].actualAmount)).toBe(5000);
    expect(results[0].status).toBe('prepaid');
  });

  it('非季度前 2 月抛 72707', async () => {
    await expect(
      payoutService.prepay('admin-1', {
        cycleId: 'cycle-1', month: new Date('2026-03-01'), employeeId: 'emp-1',
      }),
    ).rejects.toMatchObject({ code: 72707 });
  });

  it('同 employee+cycle+month 预支重复抛 72708', async () => {
    mocks.cycleFindUnique.mockResolvedValue({ id: 'cycle-1', status: 'active', startDate: new Date('2026-01-01') });
    mocks.payoutFindFirst.mockResolvedValue({ id: 'prepaid-1' });
    await expect(
      payoutService.prepay('admin-1', {
        cycleId: 'cycle-1', month: new Date('2026-01-01'), employeeId: 'emp-1',
      }),
    ).rejects.toMatchObject({ code: 72708 });
  });
});

describe('performance_payout.service settle', () => {
  it('季度末清算：实际 > 预支，补差', async () => {
    mocks.payoutFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'pre-1', actualAmount: new Decimal(5000) }]);
    mocks.payoutFindUnique.mockResolvedValue(null);
    const result = await payoutService.settle('admin-1', {
      cycleId: 'cycle-1', quarter: 1, employeeId: 'emp-1',
    });
    expect(Number(result.totalDifference)).toBeGreaterThan(0);
    expect(mocks.payoutCreate).toHaveBeenCalled();
  });

  it('季度末未到抛 72709', async () => {
    mocks.cycleFindUnique.mockResolvedValue({ id: 'cycle-1', status: 'active', startDate: new Date('2026-01-01') });
    await expect(
      payoutService.settle('admin-1', { cycleId: 'cycle-1', quarter: 1, employeeId: 'emp-1' }),
    ).rejects.toMatchObject({ code: 72709 });
  });

  it('record 未归档抛 72709', async () => {
    mocks.recordFindUnique.mockResolvedValue({ status: 'draft', finalGrade: null });
    await expect(
      payoutService.settle('admin-1', { cycleId: 'cycle-1', quarter: 1, employeeId: 'emp-1' }),
    ).rejects.toMatchObject({ code: 72709 });
  });
});

describe('performance_payout.service list+get', () => {
  it('listPayouts 分页返回', async () => {
    mocks.payoutFindMany.mockResolvedValue([{ id: 'pay-1' }]);
    mocks.payoutCount.mockResolvedValue(1);
    const result = await payoutService.listPayouts('admin-1', { page: 1, pageSize: 20 });
    expect(result.total).toBe(1);
    expect(result.items.length).toBe(1);
  });

  it('getPayout 不存在抛 404', async () => {
    mocks.payoutFindUnique.mockResolvedValue(null);
    await expect(payoutService.getPayout('admin-1', 'missing')).rejects.toMatchObject({ statusCode: 404 });
  });
});
