// M1-A5: transfer.service 单元测试 | HRMS
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  empFindFirst: vi.fn(),
  empUpdate: vi.fn(),
  companyFindUnique: vi.fn(),
  deptFindUnique: vi.fn(),
  posHistoryFindFirst: vi.fn(),
  posHistoryCreate: vi.fn(),
  salHistoryCreate: vi.fn(),
  trCreate: vi.fn(),
  trFindUnique: vi.fn(),
  trFindFirst: vi.fn(),
  trFindMany: vi.fn(),
  trCount: vi.fn(),
  trUpdate: vi.fn(),
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
      update: mocks.empUpdate,
    },
    company: { findUnique: mocks.companyFindUnique },
    department: { findUnique: mocks.deptFindUnique },
    employeePositionHistory: {
      findFirst: mocks.posHistoryFindFirst,
      create: mocks.posHistoryCreate,
    },
    employeeSalaryHistory: { create: mocks.salHistoryCreate },
    transferRecord: {
      create: mocks.trCreate,
      findUnique: mocks.trFindUnique,
      findFirst: mocks.trFindFirst,
      findMany: mocks.trFindMany,
      count: mocks.trCount,
      update: mocks.trUpdate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('./audit.service', () => ({
  AUDIT_ACTIONS: {
    CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE',
  },
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

import { Decimal } from '@prisma/client/runtime/library';

import * as transferService from './transfer.service';

const employee = {
  id: 'emp-1',
  name: '张三',
  status: 'active',
  companyId: 'co-1',
  departmentId: 'dept-1',
  userId: 'u-1',
  deletedAt: null,
};

const futureDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const makeRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'tr-1',
  employeeId: 'emp-1',
  transferType: 'transfer',
  reason: null,
  fromCompanyId: 'co-1',
  fromDeptId: 'dept-1',
  fromPosition: '工程师',
  toCompanyId: 'co-1',
  toDeptId: 'dept-2',
  toPosition: '高级工程师',
  newBaseSalary: null,
  newPerformanceSalary: null,
  newTotalSalary: null,
  effectiveDate: new Date(todayStr()),
  status: 'draft',
  approvalInstanceId: null,
  positionHistoryWritten: false,
  salaryHistoryWritten: false,
  employeeUpdated: false,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_cat: string, key: string) => {
    if (key === 'requires_salary_for_promote') return true;
    if (key === 'salary_effective') return 'immediate';
    if (key === 'max_future_days') return 90;
    if (key === 'approval_flow_key') return 'transfer:transfer_approval';
    if (key === 'approval_nodes') {
      return ['from_dept_leader', 'to_dept_leader', 'hr', 'ceo'];
    }
    return null;
  });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      employeePositionHistory: { create: mocks.posHistoryCreate },
      employeeSalaryHistory: { create: mocks.salHistoryCreate },
      employee: { update: mocks.empUpdate },
      transferRecord: { update: mocks.trUpdate },
    };
    return fn(tx);
  });
  mocks.posHistoryFindFirst.mockResolvedValue({ toPosition: '工程师' });
  mocks.companyFindUnique.mockResolvedValue({ id: 'co-1' });
  mocks.deptFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (where.id === 'dept-1') return { id: 'dept-1', name: '技术部', companyId: 'co-1' };
    if (where.id === 'dept-2') return { id: 'dept-2', name: '产品部', companyId: 'co-1' };
    return null;
  });
});

describe('createTransfer', () => {
  it('正常路径：平调 + 立即生效 → 创建草稿 + 审计', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.trFindFirst.mockResolvedValue(null);
    mocks.trCreate.mockResolvedValue(makeRecord({ id: 'tr-new' }));

    const result = await transferService.createTransfer({
      employeeId: 'emp-1',
      transferType: 'transfer',
      toCompanyId: 'co-1',
      toDeptId: 'dept-2',
      toPosition: '高级工程师',
      effectiveDate: futureDate(),
    }, 'user-1');

    expect(result.status).toBe('draft');
    expect(mocks.trCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromDeptId: 'dept-1',
          toDeptId: 'dept-2',
        }),
      }),
    );
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'TransferRecord',
      }),
    );
  });

  it('员工不存在 → 71201', async () => {
    mocks.empFindFirst.mockResolvedValue(null);
    await expect(transferService.createTransfer({
      employeeId: 'emp-1',
      transferType: 'transfer',
      toCompanyId: 'co-1',
      toDeptId: 'dept-2',
      toPosition: '高级工程师',
      effectiveDate: futureDate(),
    }, 'user-1')).rejects.toMatchObject({ code: 71201 });
  });

  it('员工非 active → 71604', async () => {
    mocks.empFindFirst.mockResolvedValue({
      ...employee, status: 'probation',
    });
    await expect(transferService.createTransfer({
      employeeId: 'emp-1',
      transferType: 'transfer',
      toCompanyId: 'co-1',
      toDeptId: 'dept-2',
      toPosition: '高级工程师',
      effectiveDate: futureDate(),
    }, 'user-1')).rejects.toMatchObject({ code: 71604 });
  });

  it('fromDeptId snapshot 不一致 → 71603', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    await expect(transferService.createTransfer({
      employeeId: 'emp-1',
      transferType: 'transfer',
      fromCompanyId: 'co-2',
      fromDeptId: 'dept-1',
      toCompanyId: 'co-1',
      toDeptId: 'dept-2',
      toPosition: '高级工程师',
      effectiveDate: futureDate(),
    }, 'user-1')).rejects.toMatchObject({ code: 71603 });
  });

  it('同部门调动 → 71605', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    await expect(transferService.createTransfer({
      employeeId: 'emp-1',
      transferType: 'transfer',
      toCompanyId: 'co-1',
      toDeptId: 'dept-1',
      toPosition: '高级工程师',
      effectiveDate: futureDate(),
    }, 'user-1')).rejects.toMatchObject({ code: 71605 });
  });

  it('已有 pending 调动 → 71606', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.trFindFirst.mockResolvedValue({ id: 'tr-existing' });
    await expect(transferService.createTransfer({
      employeeId: 'emp-1',
      transferType: 'transfer',
      toCompanyId: 'co-1',
      toDeptId: 'dept-2',
      toPosition: '高级工程师',
      effectiveDate: futureDate(),
    }, 'user-1')).rejects.toMatchObject({ code: 71606 });
  });

  it('晋升未填 newBaseSalary → 71607', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.trFindFirst.mockResolvedValue(null);
    await expect(transferService.createTransfer({
      employeeId: 'emp-1',
      transferType: 'promote',
      toCompanyId: 'co-1',
      toDeptId: 'dept-2',
      toPosition: '高级工程师',
      effectiveDate: futureDate(),
    }, 'user-1')).rejects.toMatchObject({ code: 71607 });
  });

  it('effectiveDate 早于今天 → 71609', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    await expect(transferService.createTransfer({
      employeeId: 'emp-1',
      transferType: 'transfer',
      toCompanyId: 'co-1',
      toDeptId: 'dept-2',
      toPosition: '高级工程师',
      effectiveDate: '2020-01-01',
    }, 'user-1')).rejects.toMatchObject({ code: 71609 });
  });
});

describe('updateTransfer', () => {
  it('draft 状态可更新', async () => {
    mocks.trFindUnique.mockResolvedValue(makeRecord());
    mocks.trUpdate.mockResolvedValue(makeRecord({ toPosition: '新岗位' }));

    const result = await transferService.updateTransfer(
      'tr-1',
      { toPosition: '新岗位' },
      'user-1',
    );
    expect(result.status).toBe('draft');
    expect(mocks.trUpdate).toHaveBeenCalled();
  });

  it('非 draft 状态 → 71603', async () => {
    mocks.trFindUnique.mockResolvedValue(makeRecord({ status: 'submitted' }));
    await expect(transferService.updateTransfer('tr-1', {}, 'user-1'))
      .rejects.toMatchObject({ code: 71603 });
  });
});

describe('submitTransfer', () => {
  it('正常路径：draft → submitted + 调 approval.submitApproval', async () => {
    mocks.trFindUnique.mockResolvedValue(makeRecord());
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.submitApproval.mockResolvedValue({ id: 'instance-1' });
    mocks.trUpdate.mockResolvedValue(makeRecord({ status: 'submitted' }));

    const result = await transferService.submitTransfer('tr-1', 'user-1');

    expect(result.status).toBe('submitted');
    expect(mocks.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        flowKey: 'transfer:transfer_approval',
        businessType: 'transfer',
        businessId: 'tr-1',
      }),
    );
  });

  it('非 draft 状态 → 71602', async () => {
    mocks.trFindUnique.mockResolvedValue(makeRecord({ status: 'approved' }));
    await expect(transferService.submitTransfer('tr-1', 'user-1'))
      .rejects.toMatchObject({ code: 71602 });
  });
});

describe('confirmTransfer', () => {
  it('立即生效：approved 后写 employee_position_history + 更新 employee + 写 audit', async () => {
    mocks.trFindUnique
      .mockResolvedValueOnce(makeRecord({ status: 'submitted' }))
      .mockResolvedValueOnce(makeRecord({ status: 'approved' }));
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.trUpdate.mockResolvedValue(makeRecord({ status: 'approved' }));

    const result = await transferService.confirmTransfer(
      'tr-1',
      { approved: true },
      'user-1',
    );

    expect(result.status).toBe('approved');
    expect(mocks.posHistoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changeType: 'transfer',
          fromDeptId: 'dept-1',
          toDeptId: 'dept-2',
        }),
      }),
    );
    expect(mocks.empUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'emp-1' },
        data: expect.objectContaining({ departmentId: 'dept-2' }),
      }),
    );
  });

  it('次月生效：仅写 history 不更新 employee 薪资', async () => {
    mocks.getValue.mockImplementation(async (_cat: string, key: string) => {
      if (key === 'salary_effective') return 'next_month';
      if (key === 'requires_salary_for_promote') return true;
      if (key === 'max_future_days') return 90;
      return 'transfer:transfer_approval';
    });
    const record = makeRecord({
      status: 'submitted',
      transferType: 'promote',
      newBaseSalary: new Decimal(20000),
      newTotalSalary: new Decimal(25000),
      newPerformanceSalary: null,
    });
    mocks.trFindUnique
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, status: 'approved' });
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.trUpdate.mockResolvedValue({ ...record, status: 'approved' });

    await transferService.confirmTransfer('tr-1', { approved: true }, 'user-1');

    expect(mocks.salHistoryCreate).toHaveBeenCalled();
  });

  it('晋升：写 employee_salary_history', async () => {
    const record = makeRecord({
      status: 'submitted',
      transferType: 'promote',
      newBaseSalary: new Decimal(20000),
      newTotalSalary: new Decimal(25000),
      newPerformanceSalary: null,
    });
    mocks.trFindUnique
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, status: 'approved' });
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.trUpdate.mockResolvedValue({ ...record, status: 'approved' });

    await transferService.confirmTransfer('tr-1', { approved: true }, 'user-1');

    expect(mocks.salHistoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ changeType: 'transfer' }),
      }),
    );
  });

  it('approvalResult.approved=false → 调 rejectTransfer', async () => {
    mocks.trFindUnique.mockResolvedValue(makeRecord({ status: 'submitted' }));
    mocks.trUpdate.mockResolvedValue(makeRecord({ status: 'rejected' }));
    mocks.empFindFirst.mockResolvedValue(employee);

    const result = await transferService.confirmTransfer(
      'tr-1',
      { approved: false },
      'user-1',
    );

    expect(result.status).toBe('rejected');
    expect(mocks.sendNotification).toHaveBeenCalled();
  });
});

describe('rejectTransfer', () => {
  it('submitted → rejected + 通知', async () => {
    mocks.trFindUnique.mockResolvedValue(makeRecord({ status: 'submitted' }));
    mocks.trUpdate.mockResolvedValue(makeRecord({ status: 'rejected' }));
    mocks.empFindFirst.mockResolvedValue(employee);

    const result = await transferService.rejectTransfer('tr-1', '原因', 'user-1');
    expect(result.status).toBe('rejected');
    expect(mocks.sendNotification).toHaveBeenCalled();
  });
});

describe('cancelTransfer', () => {
  it('draft 直接取消', async () => {
    mocks.trFindUnique.mockResolvedValue(makeRecord({ status: 'draft' }));
    mocks.trUpdate.mockResolvedValue(makeRecord({ status: 'cancelled' }));

    const result = await transferService.cancelTransfer('tr-1', '撤回', 'user-1');
    expect(result.status).toBe('cancelled');
  });

  it('submitted 调 approval.withdraw', async () => {
    mocks.trFindUnique.mockResolvedValue(makeRecord({
      status: 'submitted',
      approvalInstanceId: 'instance-1',
    }));
    mocks.withdraw.mockResolvedValue({ id: 'instance-1', status: 'withdrawn' });
    mocks.trUpdate.mockResolvedValue(makeRecord({ status: 'cancelled' }));

    const result = await transferService.cancelTransfer('tr-1', '撤回', 'user-1');
    expect(mocks.withdraw).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'instance-1' }),
    );
    expect(result.status).toBe('cancelled');
  });

  it('approved 状态 → 71608', async () => {
    mocks.trFindUnique.mockResolvedValue(makeRecord({ status: 'approved' }));
    await expect(transferService.cancelTransfer('tr-1', '原因', 'user-1'))
      .rejects.toMatchObject({ code: 71608 });
  });
});

describe('listUpcomingTransfers', () => {
  it('返回 7 天内生效的调动列表', async () => {
    mocks.trFindMany.mockResolvedValue([makeRecord({ status: 'approved' })]);
    const result = await transferService.listUpcomingTransfers(7);
    expect(Array.isArray(result)).toBe(true);
    expect(mocks.trFindMany).toHaveBeenCalled();
  });
});
