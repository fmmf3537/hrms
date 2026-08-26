// M3-D2: performance_record.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  cycleFindUnique: vi.fn(),
  employeeFindMany: vi.fn(),
  employeeFindFirst: vi.fn(),
  employeeFindUnique: vi.fn(),
  recordFindUnique: vi.fn(),
  recordFindFirst: vi.fn(),
  recordFindMany: vi.fn(),
  recordCount: vi.fn(),
  recordCreate: vi.fn(),
  recordUpdate: vi.fn(),
  userFindUnique: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  submitApproval: vi.fn(),
  withdraw: vi.fn(),
  sendNotification: vi.fn(),
  saveStageScore: vi.fn(),
  assertCurrentScoreExists: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    performanceCycle: { findUnique: mocks.cycleFindUnique },
    employee: {
      findMany: mocks.employeeFindMany,
      findFirst: mocks.employeeFindFirst,
      findUnique: mocks.employeeFindUnique,
    },
    performanceRecord: {
      findUnique: mocks.recordFindUnique,
      findFirst: mocks.recordFindFirst,
      findMany: mocks.recordFindMany,
      count: mocks.recordCount,
      create: mocks.recordCreate,
      update: mocks.recordUpdate,
    },
    user: { findUnique: mocks.userFindUnique },
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

vi.mock('./notification.service', () => ({
  sendNotification: mocks.sendNotification.mockResolvedValue({ logId: 'n-1' }),
}));

vi.mock('./performance_score.service', () => ({
  saveStageScore: mocks.saveStageScore,
  assertCurrentScoreExists: mocks.assertCurrentScoreExists,
  STAGE_REQUIRED_STATUS: {},
}));

import * as recordService from './performance_record.service';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindUnique.mockResolvedValue({
    id: 'user-hr',
    userRoles: [{ role: { code: 'hr' } }],
  });
  mocks.getValue.mockImplementation((_cat: string, key: string) => {
    if (key === 'score.min') return 0;
    if (key === 'score.max') return 100;
    if (key === 'archive.required_final_grade') return true;
    return null;
  });
  mocks.submitApproval.mockResolvedValue({ id: 'appr-1', status: 'pending' });
  mocks.cycleFindUnique.mockResolvedValue({ id: 'cyc-1', status: 'active', name: '2026-09' });
  mocks.employeeFindMany.mockResolvedValue([
    { id: 'emp-1', userId: 'u-1', name: 'A' },
    { id: 'emp-2', userId: 'u-2', name: 'B' },
    { id: 'emp-3', userId: null, name: 'C' },
  ]);
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
    performanceRecord: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: mocks.recordFindUnique.mockResolvedValue(null),
      create: mocks.recordCreate.mockImplementation(({ data }: { data: { employeeId: string } }) => Promise.resolve({
        id: `rec-${data.employeeId}`,
        ...data,
        status: 'draft',
      })),
    },
  }));
  mocks.recordFindMany.mockResolvedValue([]);
  mocks.recordCount.mockResolvedValue(0);
});

describe('createPerformanceRecord', () => {
  it('批量创建 3 条 record 成功', async () => {
    const result = await recordService.createPerformanceRecord('user-hr', {
      cycleId: 'cyc-1',
      employeeIds: ['emp-1', 'emp-2', 'emp-3'],
      schemeId: 'sch-1',
    });
    expect(result.created).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
  });

  it('cycle 不存在抛 404', async () => {
    mocks.cycleFindUnique.mockResolvedValue(null);
    await expect(recordService.createPerformanceRecord('user-hr', {
      cycleId: 'bad',
      employeeIds: ['emp-1'],
    })).rejects.toMatchObject({ code: 72501 });
  });

  it('cycle 非 active 抛 400', async () => {
    mocks.cycleFindUnique.mockResolvedValue({ id: 'cyc-1', status: 'draft' });
    await expect(recordService.createPerformanceRecord('user-hr', {
      cycleId: 'cyc-1',
      employeeIds: ['emp-1'],
    })).rejects.toMatchObject({ code: 72503 });
  });

  it('employeeId+cycleId 重复写入 skipped', async () => {
    mocks.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn({
      performanceRecord: {
        findMany: vi.fn().mockResolvedValue([{ employeeId: 'emp-2' }]),
        create: mocks.recordCreate.mockImplementation(({ data }: { data: { employeeId: string } }) => Promise.resolve({
          id: `rec-${data.employeeId}`,
          employeeId: data.employeeId,
          status: 'draft',
        })),
      },
    }));
    const result = await recordService.createPerformanceRecord('user-hr', {
      cycleId: 'cyc-1',
      employeeIds: ['emp-1', 'emp-2', 'emp-3'],
    });
    expect(result.skipped.length).toBeGreaterThanOrEqual(1);
    expect(result.created.length).toBe(2);
  });
});

describe('getPerformanceRecord', () => {
  it('record 不存在抛 72501', async () => {
    mocks.recordFindUnique.mockResolvedValue(null);
    await expect(recordService.getPerformanceRecord('user-hr', 'bad'))
      .rejects.toMatchObject({ code: 72501 });
  });
});

describe('saveSelfScore / submitSelf', () => {
  it('saveSelfScore 委托 saveStageScore', async () => {
    mocks.recordFindUnique.mockResolvedValue({ employeeId: 'emp-1' });
    mocks.employeeFindFirst.mockResolvedValue({ id: 'emp-1' });
    mocks.saveStageScore.mockResolvedValue({ id: 'score-1' });
    const result = await recordService.saveSelfScore('user-emp', 'rec-1', { items: [] });
    expect(result.id).toBe('score-1');
  });

  it('非本人 record 抛 72504', async () => {
    mocks.recordFindUnique.mockResolvedValue({ employeeId: 'emp-2' });
    mocks.employeeFindFirst.mockResolvedValue({ id: 'emp-1' });
    await expect(recordService.saveSelfScore('user-emp', 'rec-1', { items: [] }))
      .rejects.toMatchObject({ code: 72504 });
  });

  it('提交成功 status→manager_scoring + 调 approval', async () => {
    mocks.recordFindUnique.mockResolvedValue({
      id: 'rec-1',
      employeeId: 'emp-1',
      status: 'draft',
      employee: { name: 'A', userId: 'u-1' },
    });
    mocks.employeeFindFirst.mockResolvedValue({ id: 'emp-1' });
    mocks.assertCurrentScoreExists.mockResolvedValue(undefined);
    mocks.recordUpdate.mockResolvedValue({ id: 'rec-1', status: 'manager_scoring' });
    const result = await recordService.submitSelf('user-emp', 'rec-1');
    expect(result.status).toBe('manager_scoring');
    expect(mocks.submitApproval).toHaveBeenCalledWith(expect.objectContaining({
      flowKey: 'performance:self_submit',
    }));
  });

  it('重复提交抛 72512', async () => {
    mocks.recordFindUnique.mockResolvedValue({
      id: 'rec-1', employeeId: 'emp-1', status: 'manager_scoring', employee: { name: 'A' },
    });
    mocks.employeeFindFirst.mockResolvedValue({ id: 'emp-1' });
    await expect(recordService.submitSelf('user-emp', 'rec-1'))
      .rejects.toMatchObject({ code: 72512 });
  });
});

describe('ceoApprove', () => {
  it('总经理审批成功', async () => {
    mocks.recordFindUnique.mockResolvedValue({
      id: 'rec-1',
      status: 'ceo_approving',
      employeeId: 'emp-1',
      employee: { name: 'A', userId: 'u-1' },
    });
    mocks.recordUpdate.mockResolvedValue({
      id: 'rec-1',
      status: 'ceo_approved',
      finalGrade: 'A',
      finalScore: 88,
    });
    const result = await recordService.ceoApprove('user-ceo', 'rec-1', {
      finalGrade: 'A',
      finalScore: 88,
    });
    expect(result.status).toBe('ceo_approved');
  });

  it('已审批重复抛 72520', async () => {
    mocks.recordFindUnique.mockResolvedValue({
      id: 'rec-1', status: 'ceo_approved', employee: { name: 'A' },
    });
    await expect(recordService.ceoApprove('user-ceo', 'rec-1', {
      finalGrade: 'A', finalScore: 88,
    })).rejects.toMatchObject({ code: 72520 });
  });
});

describe('archiveRecord', () => {
  it('归档成功', async () => {
    mocks.recordFindUnique.mockResolvedValue({
      id: 'rec-1', status: 'ceo_approved', finalGrade: 'A',
    });
    mocks.recordUpdate.mockResolvedValue({ id: 'rec-1', status: 'archived' });
    const result = await recordService.archiveRecord('user-hr', 'rec-1');
    expect(result.status).toBe('archived');
  });

  it('已归档抛 72505', async () => {
    mocks.recordFindUnique.mockResolvedValue({ id: 'rec-1', status: 'archived' });
    await expect(recordService.archiveRecord('user-hr', 'rec-1'))
      .rejects.toMatchObject({ code: 72505 });
  });
});

describe('rejectRecord', () => {
  it('拒绝成功 status→rejected', async () => {
    mocks.recordFindUnique.mockResolvedValue({
      id: 'rec-1',
      status: 'manager_scoring',
      approvalInstanceId: 'appr-1',
      employee: { userId: 'u-1' },
    });
    mocks.recordUpdate.mockResolvedValue({ id: 'rec-1', status: 'rejected' });
    const result = await recordService.rejectRecord('user-hr', 'rec-1', { reason: '评分依据不足' });
    expect(result.status).toBe('rejected');
  });

  it('reason 缺失抛 72506', async () => {
    await expect(recordService.rejectRecord('user-hr', 'rec-1', { reason: '短' }))
      .rejects.toMatchObject({ code: 72506 });
  });

  it('不在评分阶段抛 72519', async () => {
    mocks.recordFindUnique.mockResolvedValue({ id: 'rec-1', status: 'draft', employee: {} });
    await expect(recordService.rejectRecord('user-hr', 'rec-1', { reason: '不符合要求' }))
      .rejects.toMatchObject({ code: 72519 });
  });
});

describe('listPerformanceRecords', () => {
  it('分页列表成功', async () => {
    mocks.recordFindMany.mockResolvedValue([{ id: 'rec-1' }]);
    mocks.recordCount.mockResolvedValue(1);
    const result = await recordService.listPerformanceRecords('user-hr', { page: 1, pageSize: 20 });
    expect(result.total).toBe(1);
  });
});
