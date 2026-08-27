// M4-C4: payslip.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  payslipFindMany: vi.fn(),
  payslipCount: vi.fn(),
  payslipFindUnique: vi.fn(),
  payslipUpdate: vi.fn(),
  itemDeleteMany: vi.fn(),
  itemCreateMany: vi.fn(),
  userFindUnique: vi.fn(),
  employeeFindFirst: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  calc: vi.fn(),
  toItems: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    payslip: {
      findMany: mocks.payslipFindMany,
      count: mocks.payslipCount,
      findUnique: mocks.payslipFindUnique,
      update: mocks.payslipUpdate,
    },
    payslipItem: {
      deleteMany: mocks.itemDeleteMany,
      createMany: mocks.itemCreateMany,
    },
    user: { findUnique: mocks.userFindUnique },
    employee: { findFirst: mocks.employeeFindFirst },
    $transaction: mocks.transaction,
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

vi.mock('./payroll_calculation.service', () => ({
  calculateSinglePayroll: mocks.calc,
  toPayslipItemRows: mocks.toItems,
}));

import * as payslipService from './payslip.service';

const ACTOR = 'hr-1';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockResolvedValue(3);
  mocks.userFindUnique.mockResolvedValue({
    id: ACTOR,
    userRoles: [{ role: { code: 'hr' } }],
  });
  mocks.payslipFindMany.mockResolvedValue([{ id: 'ps-1' }]);
  mocks.payslipCount.mockResolvedValue(1);
  mocks.toItems.mockReturnValue([{
    itemType: 'earning_base', itemName: '基本工资', amount: 10000,
  }]);
  mocks.calc.mockResolvedValue({
    employeeId: 'e1',
    period: '2026-09',
    baseAmount: 10000,
    performanceAmount: 0,
    overtimeAmount: 0,
    allowanceAmount: 0,
    salesCommissionAmount: 0,
    yearEndBonusAmount: 0,
    grossAmount: 10000,
    socialInsuranceAmount: 800,
    housingFundAmount: 300,
    taxAmount: 0,
    absenceAmount: 0,
    deductionAmount: 1100,
    netAmount: 8900,
    anomaly: { isAnomaly: false, diff: 0, percentage: 0 },
  });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
    payslipItem: { deleteMany: mocks.itemDeleteMany, createMany: mocks.itemCreateMany },
    payslip: { update: mocks.payslipUpdate, findUnique: mocks.payslipFindUnique },
  }));
});

describe('payslip.service listPayslips', () => {
  it('filter runId 只返指定 run 的', async () => {
    await payslipService.listPayslips(ACTOR, { runId: 'run-1' });
    expect(mocks.payslipFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ runId: 'run-1' }),
    }));
  });

  it('filter employeeId', async () => {
    await payslipService.listPayslips(ACTOR, { employeeId: 'e1' });
    expect(mocks.payslipFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ employeeId: 'e1' }),
    }));
  });

  it('dept_head 仅看本部门员工', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'dh-1',
      userRoles: [{ role: { code: 'dept_head' } }],
    });
    mocks.employeeFindFirst.mockResolvedValue({ id: 'e-dh', departmentId: 'dept-1' });
    await payslipService.listPayslips('dh-1', {});
    expect(mocks.payslipFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ employee: { departmentId: 'dept-1' } }),
    }));
  });

  it('employee 仅看本人', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'u-e',
      userRoles: [{ role: { code: 'employee' } }],
    });
    mocks.employeeFindFirst.mockResolvedValue({ id: 'e-self', departmentId: 'dept-1' });
    await payslipService.listPayslips('u-e', {});
    expect(mocks.payslipFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ employeeId: 'e-self' }),
    }));
  });
});

describe('payslip.service getPayslip', () => {
  it('详情含 items 列表', async () => {
    mocks.payslipFindUnique.mockResolvedValue({
      id: 'ps-1',
      employeeId: 'e1',
      items: [{ id: 'it-1' }],
      employee: { departmentId: 'dept-1' },
    });
    const r = await payslipService.getPayslip(ACTOR, 'ps-1');
    expect(r.items).toHaveLength(1);
  });
});

describe('payslip.service recalculatePayslip', () => {
  it('calculated 状态可重算', async () => {
    mocks.payslipFindUnique.mockResolvedValue({
      id: 'ps-1',
      employeeId: 'e1',
      period: '2026-09',
      status: 'calculated',
      recalculateCount: 0,
      run: { locked: false, status: 'draft' },
      items: [{ id: 'it-new' }],
    });
    mocks.payslipUpdate.mockResolvedValue({ id: 'ps-1', recalculateCount: 1, items: [] });
    const r = await payslipService.recalculatePayslip(ACTOR, 'ps-1');
    expect(r).toBeTruthy();
    expect(mocks.itemDeleteMany).toHaveBeenCalled();
    expect(mocks.itemCreateMany).toHaveBeenCalled();
  });

  it('approved 状态不可重算抛 73403', async () => {
    mocks.payslipFindUnique.mockResolvedValue({
      id: 'ps-1',
      status: 'approved',
      recalculateCount: 0,
      run: { locked: false, status: 'approved' },
    });
    await expect(payslipService.recalculatePayslip(ACTOR, 'ps-1'))
      .rejects.toMatchObject({ code: 73403 });
  });

  it('locked 状态不可重算抛 73403 或 73406', async () => {
    mocks.payslipFindUnique.mockResolvedValue({
      id: 'ps-1',
      status: 'locked',
      recalculateCount: 0,
      run: { locked: true, status: 'locked' },
    });
    await expect(payslipService.recalculatePayslip(ACTOR, 'ps-1'))
      .rejects.toMatchObject({ code: 73406 });
  });

  it('recalculateCount > 限制抛 73409', async () => {
    mocks.payslipFindUnique.mockResolvedValue({
      id: 'ps-1',
      status: 'calculated',
      recalculateCount: 3,
      run: { locked: false, status: 'draft' },
    });
    await expect(payslipService.recalculatePayslip(ACTOR, 'ps-1'))
      .rejects.toMatchObject({ code: 73409 });
  });

  it('payslip 不存在抛 73407', async () => {
    mocks.payslipFindUnique.mockResolvedValue(null);
    await expect(payslipService.recalculatePayslip(ACTOR, 'missing'))
      .rejects.toMatchObject({ code: 73407 });
  });
});
