// M4-C4: payroll_run.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  runFindFirst: vi.fn(),
  runFindUnique: vi.fn(),
  runFindMany: vi.fn(),
  runCount: vi.fn(),
  runCreate: vi.fn(),
  runUpdate: vi.fn(),
  employeeFindMany: vi.fn(),
  payslipCreate: vi.fn(),
  payslipUpdateMany: vi.fn(),
  itemCreateMany: vi.fn(),
  instanceFindFirst: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  submitApproval: vi.fn(),
  withdraw: vi.fn(),
  calc: vi.fn(),
  toItems: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    payrollRun: {
      findFirst: mocks.runFindFirst,
      findUnique: mocks.runFindUnique,
      findMany: mocks.runFindMany,
      count: mocks.runCount,
      create: mocks.runCreate,
      update: mocks.runUpdate,
    },
    employee: { findMany: mocks.employeeFindMany },
    payslip: { create: mocks.payslipCreate, updateMany: mocks.payslipUpdateMany },
    payslipItem: { createMany: mocks.itemCreateMany },
    approvalInstance: { findFirst: mocks.instanceFindFirst },
    $transaction: mocks.transaction,
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
  withdraw: mocks.withdraw,
}));

vi.mock('./payroll_calculation.service', () => ({
  calculateSinglePayroll: mocks.calc,
  toPayslipItemRows: mocks.toItems,
}));

import * as runService from './payroll_run.service';

const ACTOR = 'hr-1';
const CALC = {
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
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'payroll.trigger_day': 5,
      'payroll.approval_flow': {
        hr: 'payroll:hr_submit',
        finance: 'payroll:finance_review',
        ceo: 'payroll:ceo_approve',
      },
      'payroll.lock_after_approve': false,
    };
    return map[key];
  });
  mocks.runFindFirst.mockResolvedValue(null);
  mocks.employeeFindMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
  mocks.calc.mockImplementation(async (_a: string, input: { employeeId: string }) => ({
    ...CALC, employeeId: input.employeeId,
  }));
  mocks.toItems.mockReturnValue([{
    itemType: 'earning_base', itemName: '基本工资', amount: 10000,
  }]);
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
    payrollRun: { create: mocks.runCreate },
    payslip: { create: mocks.payslipCreate, updateMany: mocks.payslipUpdateMany },
    payslipItem: { createMany: mocks.itemCreateMany },
  }));
  mocks.runCreate.mockResolvedValue({
    id: 'run-1',
    period: '2026-09',
    status: 'draft',
    totalGross: 20000,
    totalNet: 17800,
    anomalyCount: 0,
  });
  mocks.payslipCreate.mockResolvedValue({ id: 'ps-1' });
  mocks.submitApproval.mockResolvedValue({ id: 'ap-1', status: 'pending' });
  mocks.withdraw.mockResolvedValue({ id: 'ap-1', status: 'withdrawn' });
  mocks.payslipUpdateMany.mockResolvedValue({ count: 2 });
});

describe('payroll_run.service createPayrollRun', () => {
  it('发起 2026-09 算薪多名员工成功', async () => {
    const r = await runService.createPayrollRun(ACTOR, { period: '2026-09' });
    expect(r.payslipCount).toBe(2);
    expect(r.run.status).toBe('draft');
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PAYROLL_RUN_CREATE',
    }));
  });

  it('period="2026-13" 抛 73404', async () => {
    await expect(runService.createPayrollRun(ACTOR, { period: '2026-13' }))
      .rejects.toMatchObject({ code: 73404 });
  });

  it('同 period 已有 run 抛 73402', async () => {
    mocks.runFindFirst.mockResolvedValue({ id: 'old' });
    await expect(runService.createPayrollRun(ACTOR, { period: '2026-09' }))
      .rejects.toMatchObject({ code: 73402 });
  });

  it('部门下无员工抛 400', async () => {
    mocks.employeeFindMany.mockResolvedValue([]);
    await expect(runService.createPayrollRun(ACTOR, { period: '2026-09' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('totalGross / totalNet / anomalyCount 正确', async () => {
    await runService.createPayrollRun(ACTOR, { period: '2026-09' });
    expect(mocks.runCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        totalGross: 20000, totalNet: 17800, anomalyCount: 0,
      }),
    }));
  });
});

describe('payroll_run.service list/get/lock', () => {
  it('list 按 period 过滤', async () => {
    mocks.runFindMany.mockResolvedValue([{ id: 'run-1' }]);
    mocks.runCount.mockResolvedValue(1);
    const r = await runService.listPayrollRuns(ACTOR, { period: '2026-09' });
    expect(r.total).toBe(1);
  });

  it('list 按 status 过滤', async () => {
    mocks.runFindMany.mockResolvedValue([]);
    mocks.runCount.mockResolvedValue(0);
    await runService.listPayrollRuns(ACTOR, { status: 'draft' });
    expect(mocks.runFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'draft' }),
    }));
  });

  it('详情含 payslips 列表', async () => {
    mocks.runFindUnique.mockResolvedValue({
      id: 'run-1', payslips: [{ id: 'ps-1', items: [] }],
    });
    const r = await runService.getPayrollRun(ACTOR, 'run-1');
    expect(r.payslips).toHaveLength(1);
  });

  it('runId 不存在抛 73401', async () => {
    mocks.runFindUnique.mockResolvedValue(null);
    await expect(runService.getPayrollRun(ACTOR, 'missing'))
      .rejects.toMatchObject({ code: 73401 });
  });

  it('approved → locked 成功', async () => {
    mocks.runFindUnique.mockResolvedValue({ id: 'run-1', status: 'approved', locked: false });
    mocks.runUpdate.mockResolvedValue({ id: 'run-1', status: 'locked', locked: true });
    const r = await runService.lockPayrollRun(ACTOR, 'run-1');
    expect(r.status).toBe('locked');
  });

  it('非 approved 状态 lock 抛 73403', async () => {
    mocks.runFindUnique.mockResolvedValue({ id: 'run-1', status: 'draft', locked: false });
    await expect(runService.lockPayrollRun(ACTOR, 'run-1'))
      .rejects.toMatchObject({ code: 73403 });
  });
});

describe('payroll_run.service submit/review/approve/reject', () => {
  it('draft → submitted 成功', async () => {
    mocks.runFindUnique.mockResolvedValue({
      id: 'run-1', status: 'draft', anomalyCount: 0, locked: false, period: '2026-09',
    });
    mocks.runUpdate.mockResolvedValue({ id: 'run-1', status: 'submitted' });
    const r = await runService.submitPayrollRun(ACTOR, 'run-1');
    expect(r.status).toBe('submitted');
    expect(mocks.submitApproval).toHaveBeenCalledWith(expect.objectContaining({
      flowKey: 'payroll:hr_submit',
    }));
  });

  it('submitted → reviewed 成功', async () => {
    mocks.runFindUnique.mockResolvedValue({
      id: 'run-1', status: 'submitted', locked: false, period: '2026-09',
    });
    mocks.runUpdate.mockResolvedValue({ id: 'run-1', status: 'reviewed' });
    const r = await runService.reviewPayrollRun(ACTOR, 'run-1', {});
    expect(r.status).toBe('reviewed');
  });

  it('reviewed → approved 成功', async () => {
    mocks.runFindUnique.mockResolvedValue({
      id: 'run-1', status: 'reviewed', anomalyCount: 0, locked: false, period: '2026-09',
    });
    mocks.runUpdate.mockResolvedValue({ id: 'run-1', status: 'approved' });
    const r = await runService.approvePayrollRun(ACTOR, 'run-1');
    expect(r.status).toBe('approved');
  });

  it('submitted → draft (reject) 成功', async () => {
    mocks.runFindUnique.mockResolvedValue({
      id: 'run-1', status: 'submitted', locked: false, period: '2026-09',
    });
    mocks.instanceFindFirst.mockResolvedValue(null);
    mocks.runUpdate.mockResolvedValue({ id: 'run-1', status: 'draft' });
    const r = await runService.rejectPayrollRun(ACTOR, 'run-1', '数据有误');
    expect(r.status).toBe('draft');
  });

  it('draft → approved 状态机非法抛 73403', async () => {
    mocks.runFindUnique.mockResolvedValue({
      id: 'run-1', status: 'draft', anomalyCount: 0, locked: false, period: '2026-09',
    });
    await expect(runService.approvePayrollRun(ACTOR, 'run-1'))
      .rejects.toMatchObject({ code: 73403 });
  });

  it('异常数 > 0 时 submit 抛 73405', async () => {
    mocks.runFindUnique.mockResolvedValue({
      id: 'run-1', status: 'draft', anomalyCount: 2, locked: false, period: '2026-09',
    });
    await expect(runService.submitPayrollRun(ACTOR, 'run-1'))
      .rejects.toMatchObject({ code: 73405 });
  });

  it('locked 后 submit 抛 73406', async () => {
    mocks.runFindUnique.mockResolvedValue({
      id: 'run-1', status: 'draft', anomalyCount: 0, locked: true, period: '2026-09',
    });
    await expect(runService.submitPayrollRun(ACTOR, 'run-1'))
      .rejects.toMatchObject({ code: 73406 });
  });
});
