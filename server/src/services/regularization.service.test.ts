// M1-A4: regularization.service 单元测试 | HRMS
/* eslint-disable import/first */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  empFindFirst: vi.fn(),
  empFindMany: vi.fn(),
  empUpdate: vi.fn(),
  regCreate: vi.fn(),
  regFindUnique: vi.fn(),
  regFindFirst: vi.fn(),
  regFindMany: vi.fn(),
  regCount: vi.fn(),
  regUpdate: vi.fn(),
  salCreate: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  sendNotification: vi.fn(),
  submitApproval: vi.fn(),
  withdraw: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: {
      findFirst: mocks.empFindFirst,
      findMany: mocks.empFindMany,
      update: mocks.empUpdate,
    },
    regularizationRecord: {
      create: mocks.regCreate,
      findUnique: mocks.regFindUnique,
      findFirst: mocks.regFindFirst,
      findMany: mocks.regFindMany,
      count: mocks.regCount,
      update: mocks.regUpdate,
    },
    employeeSalaryHistory: { create: mocks.salCreate },
    $transaction: mocks.transaction,
  },
}));

vi.mock('./audit.service', () => ({
  AUDIT_ACTIONS: {
    CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE',
  },
  AUDIT_RESOURCE_TYPES: {},
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

vi.mock('./notification.service', () => ({
  sendNotification: mocks.sendNotification.mockResolvedValue({ logId: 'l1' }),
}));

vi.mock('./approval.service', () => ({
  submitApproval: mocks.submitApproval,
  withdraw: mocks.withdraw,
}));

import * as regularizationService from './regularization.service';

const employee = {
  id: 'e-1',
  employeeNo: 'XACH20260005',
  name: '普通员工',
  status: 'probation',
  companyId: 'c-1',
  departmentId: 'd-tech',
  hireDate: new Date('2026-01-01'),
  userId: 'u-emp',
  deletedAt: null,
};

const makeRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'reg-1',
  employeeId: 'e-1',
  hireDate: new Date('2026-01-01'),
  probationEndDate: new Date('2026-04-01'),
  appliedAt: new Date(),
  selfEvaluation: '自评示例',
  managerEvaluation: null,
  hrEvaluation: null,
  performanceScore: 85,
  newBaseSalary: null,
  newPerformanceSalary: null,
  newTotalSalary: null,
  status: 'draft',
  approvalInstanceId: null,
  approvedAt: null,
  approvedBy: null,
  rejectedAt: null,
  rejectedBy: null,
  rejectedReason: null,
  createdBy: 'u-hr',
  createdAt: new Date(),
  updatedAt: new Date(),
  cancelledAt: null,
  cancelledBy: null,
  cancelledReason: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (category: string, key: string) => {
    const map: Record<string, unknown> = {
      'probation.months': 3,
      'probation.remind_days': 15,
      'regularization.approval_flow_key': 'regularization:regularization_approval',
      'regularization.salary_effective': 'next_month',
      'regularization.approval_nodes': ['department_leader', 'hr', 'ceo'],
    };
    return map[`${category}.${key}`];
  });
});

describe('regularization.service', () => {
  it('createRegularization 正常路径（草稿 + probationEndDate）', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.regFindFirst.mockResolvedValue(null);
    const created = makeRecord();
    mocks.regCreate.mockResolvedValue(created);

    const result = await regularizationService.createRegularization({
      employeeId: 'e-1',
      selfEvaluation: '自评示例',
      createdBy: 'u-hr',
    });

    expect(result.status).toBe('draft');
    expect(mocks.regCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: 'e-1',
          probationEndDate: new Date('2026-04-01'),
        }),
      }),
    );
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', resourceType: 'RegularizationRecord' }),
    );
  });

  it('createRegularization 员工非 probation → 71404', async () => {
    mocks.empFindFirst.mockResolvedValue({ ...employee, status: 'active' });
    await expect(
      regularizationService.createRegularization({ employeeId: 'e-1' }),
    ).rejects.toMatchObject({ code: 71404 });
  });

  it('createRegularization 已有 active 转正记录 → 71405', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.regFindFirst.mockResolvedValue(makeRecord({ status: 'submitted' }));
    await expect(
      regularizationService.createRegularization({ employeeId: 'e-1' }),
    ).rejects.toMatchObject({ code: 71405 });
  });

  it('getRegularizationById 正常 + 不存在 → 71401', async () => {
    mocks.regFindUnique.mockResolvedValueOnce(makeRecord());
    mocks.empFindFirst.mockResolvedValueOnce(employee);
    const row = await regularizationService.getRegularizationById('reg-1');
    expect(row.id).toBe('reg-1');
    expect(row.employee?.name).toBe('普通员工');

    mocks.regFindUnique.mockResolvedValueOnce(null);
    await expect(
      regularizationService.getRegularizationById('x'),
    ).rejects.toMatchObject({ code: 71401 });
  });

  it('listRegularizations 分页 + 过滤', async () => {
    mocks.empFindMany.mockResolvedValue([{ id: 'e-1' }]);
    mocks.regFindMany.mockResolvedValue([makeRecord()]);
    mocks.regCount.mockResolvedValue(1);
    const result = await regularizationService.listRegularizations({
      companyId: 'c-1', status: 'draft', page: 1, pageSize: 10,
    });
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it('listUpcomingRegularizations 返回试用期到期列表', async () => {
    const soonHire = new Date();
    soonHire.setMonth(soonHire.getMonth() - 3);
    soonHire.setDate(soonHire.getDate() + 7); // 约 7 天后到期
    mocks.empFindMany.mockResolvedValue([
      { ...employee, hireDate: soonHire },
      {
        ...employee,
        id: 'e-far',
        hireDate: new Date('2020-01-01'),
      },
    ]);
    const result = await regularizationService.listUpcomingRegularizations(15);
    expect(result.count).toBe(1);
    expect(result.data[0].id).toBe('e-1');
  });

  it('updateRegularization 仅 draft 可改（submitted → 71403）', async () => {
    mocks.regFindUnique.mockResolvedValue(makeRecord({ status: 'submitted' }));
    await expect(
      regularizationService.updateRegularization('reg-1', { performanceScore: 90 }),
    ).rejects.toMatchObject({ code: 71403 });
  });

  it('submitRegularization draft → submitted', async () => {
    mocks.regFindUnique.mockResolvedValue(makeRecord());
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.submitApproval.mockResolvedValue({
      id: 'appr-1', currentNodeId: 'n1', status: 'pending',
    });
    mocks.regUpdate.mockResolvedValue(
      makeRecord({ status: 'submitted', approvalInstanceId: 'appr-1' }),
    );

    const result = await regularizationService.submitRegularization('reg-1', 'u-hr');
    expect(result.status).toBe('submitted');
    expect(mocks.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        flowKey: 'regularization:regularization_approval',
        businessType: 'regularization',
      }),
    );
  });

  it('confirmRegularization approved 后 employee.status = active', async () => {
    mocks.regFindUnique
      .mockResolvedValueOnce(makeRecord({ status: 'submitted' }))
      .mockResolvedValueOnce(makeRecord({ status: 'approved' }));
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        employee: { update: mocks.empUpdate },
        employeeSalaryHistory: { create: mocks.salCreate },
        regularizationRecord: { update: mocks.regUpdate },
      };
      mocks.empUpdate.mockResolvedValue({ ...employee, status: 'active' });
      mocks.regUpdate.mockResolvedValue(makeRecord({ status: 'approved' }));
      return fn(tx);
    });

    const result = await regularizationService.confirmRegularization(
      'reg-1',
      { approved: true, instanceId: 'appr-1' },
      'u-hr',
    );
    expect(result.status).toBe('approved');
    expect(mocks.empUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'active' } }),
    );
  });

  it('confirmRegularization 有 newBaseSalary 时写薪资历史', async () => {
    const { Decimal } = await import('@prisma/client/runtime/library');
    mocks.regFindUnique
      .mockResolvedValueOnce(makeRecord({
        status: 'submitted',
        newBaseSalary: new Decimal(10000),
        newPerformanceSalary: new Decimal(2000),
        newTotalSalary: new Decimal(12000),
      }))
      .mockResolvedValueOnce(makeRecord({ status: 'approved' }));
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        employee: { update: mocks.empUpdate.mockResolvedValue({}) },
        employeeSalaryHistory: { create: mocks.salCreate.mockResolvedValue({}) },
        regularizationRecord: {
          update: mocks.regUpdate.mockResolvedValue(makeRecord({ status: 'approved' })),
        },
      };
      return fn(tx);
    });

    await regularizationService.confirmRegularization(
      'reg-1',
      { approved: true },
      'u-hr',
    );
    expect(mocks.salCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ changeType: 'regularization' }),
      }),
    );
  });

  it('confirmRegularization 无 newBaseSalary 时不写薪资历史', async () => {
    mocks.regFindUnique
      .mockResolvedValueOnce(makeRecord({ status: 'submitted', newBaseSalary: null }))
      .mockResolvedValueOnce(makeRecord({ status: 'approved' }));
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        employee: { update: mocks.empUpdate.mockResolvedValue({}) },
        employeeSalaryHistory: { create: mocks.salCreate },
        regularizationRecord: {
          update: mocks.regUpdate.mockResolvedValue(makeRecord({ status: 'approved' })),
        },
      };
      return fn(tx);
    });

    await regularizationService.confirmRegularization(
      'reg-1',
      { approved: true },
      'u-hr',
    );
    expect(mocks.salCreate).not.toHaveBeenCalled();
  });

  it('rejectRegularization submitted → rejected + 通知', async () => {
    mocks.regFindUnique.mockResolvedValue(makeRecord({ status: 'submitted' }));
    mocks.regUpdate.mockResolvedValue(makeRecord({ status: 'rejected' }));
    mocks.empFindFirst.mockResolvedValue(employee);

    const result = await regularizationService.rejectRegularization(
      'reg-1',
      '绩效不达标',
      'u-hr',
    );
    expect(result.status).toBe('rejected');
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: 'regularization_rejected:in_app' }),
    );
  });

  it('cancelRegularization draft 直接取消', async () => {
    mocks.regFindUnique.mockResolvedValue(makeRecord({ status: 'draft' }));
    mocks.regUpdate.mockResolvedValue(makeRecord({ status: 'cancelled' }));
    const result = await regularizationService.cancelRegularization(
      'reg-1',
      '暂缓',
      'u-hr',
    );
    expect(result.status).toBe('cancelled');
    expect(mocks.withdraw).not.toHaveBeenCalled();
  });

  it('cancelRegularization submitted 调 approval.withdraw', async () => {
    mocks.regFindUnique.mockResolvedValue(
      makeRecord({ status: 'submitted', approvalInstanceId: 'appr-1' }),
    );
    mocks.withdraw.mockResolvedValue({ id: 'appr-1', status: 'withdrawn' });
    mocks.regUpdate.mockResolvedValue(makeRecord({ status: 'cancelled' }));
    await regularizationService.cancelRegularization('reg-1', '撤回', 'u-hr');
    expect(mocks.withdraw).toHaveBeenCalledWith({
      instanceId: 'appr-1', initiatorId: 'u-hr',
    });
  });

  it('cancelRegularization approved → 71408', async () => {
    mocks.regFindUnique.mockResolvedValue(makeRecord({ status: 'approved' }));
    await expect(
      regularizationService.cancelRegularization('reg-1', 'x', 'u-hr'),
    ).rejects.toMatchObject({ code: 71408 });
  });

  it('审计写入验证', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.regFindFirst.mockResolvedValue(null);
    mocks.regCreate.mockResolvedValue(makeRecord());
    await regularizationService.createRegularization({
      employeeId: 'e-1', createdBy: 'u-hr',
    });
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('通知发送验证（confirm）', async () => {
    mocks.regFindUnique
      .mockResolvedValueOnce(makeRecord({ status: 'submitted' }))
      .mockResolvedValueOnce(makeRecord({ status: 'approved' }));
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        employee: { update: mocks.empUpdate.mockResolvedValue({}) },
        employeeSalaryHistory: { create: mocks.salCreate },
        regularizationRecord: {
          update: mocks.regUpdate.mockResolvedValue(makeRecord({ status: 'approved' })),
        },
      };
      return fn(tx);
    });

    await regularizationService.confirmRegularization(
      'reg-1',
      { approved: true },
      'u-hr',
    );
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: 'regularization_confirmed:in_app' }),
    );
  });

  it('状态机非法转换 draft → approved → 71403', async () => {
    mocks.regFindUnique.mockResolvedValue(makeRecord({ status: 'draft' }));
    await expect(
      regularizationService.confirmRegularization(
        'reg-1',
        { approved: true },
        'u-hr',
      ),
    ).rejects.toMatchObject({ code: 71403 });
  });
});
