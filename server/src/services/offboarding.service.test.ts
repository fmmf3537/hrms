// M1-A6: offboarding.service 单元测试 | HRMS
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
  userUpdate: vi.fn(),
  companyFindFirst: vi.fn(),
  offCreate: vi.fn(),
  offFindUnique: vi.fn(),
  offFindFirst: vi.fn(),
  offFindMany: vi.fn(),
  offCount: vi.fn(),
  offUpdate: vi.fn(),
  taskFindMany: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  sendNotification: vi.fn(),
  submitApproval: vi.fn(),
  withdraw: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: {
      findFirst: mocks.empFindFirst,
      findMany: mocks.empFindMany,
      update: mocks.empUpdate,
    },
    user: { update: mocks.userUpdate },
    company: { findFirst: mocks.companyFindFirst },
    offboardingRecord: {
      create: mocks.offCreate,
      findUnique: mocks.offFindUnique,
      findFirst: mocks.offFindFirst,
      findMany: mocks.offFindMany,
      count: mocks.offCount,
      update: mocks.offUpdate,
    },
    handoverTask: { findMany: mocks.taskFindMany },
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

vi.mock('fs', () => ({
  promises: {
    mkdir: mocks.mkdir.mockResolvedValue(undefined),
    writeFile: mocks.writeFile.mockResolvedValue(undefined),
  },
}));

import * as offboardingService from './offboarding.service';

const employee = {
  id: 'e-1',
  employeeNo: 'XACH20260002',
  name: 'HR 专员',
  status: 'active',
  companyId: 'c-1',
  departmentId: 'd-hr',
  hireDate: new Date('2026-01-01'),
  userId: 'u-emp',
  deletedAt: null,
  resignationDate: null,
};

const makeTasks = (status = 'pending') => [
  {
    id: 't1', name: '工作文档交接', category: 'document', status,
  },
  {
    id: 't2', name: '客户/项目交接', category: 'client', status,
  },
  {
    id: 't3', name: '财务/物资交接', category: 'finance', status,
  },
  {
    id: 't4', name: '系统账号交接', category: 'account', status,
  },
  {
    id: 't5', name: '未了事项说明', category: 'misc', status,
  },
];

const makeRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'off-1',
  employeeId: 'e-1',
  resignationType: 'employee_initiated',
  reason: '个人发展',
  lastWorkingDate: new Date('2026-09-30'),
  handoverCompleted: false,
  handoverCompletedBy: null,
  handoverCompletedAt: null,
  approvalInstanceId: null,
  certificateIssued: false,
  certificateIssuedAt: null,
  certificateIssuedBy: null,
  certificateNumber: null,
  certificateUrl: null,
  accountDisabled: false,
  accountDisabledAt: null,
  archivedAt: null,
  archiveRetentionYears: 5,
  status: 'handover_pending',
  createdBy: 'u-hr',
  createdAt: new Date(),
  updatedAt: new Date(),
  cancelledAt: null,
  cancelledBy: null,
  cancelledReason: null,
  tasks: makeTasks(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (category: string, key: string) => {
    const map: Record<string, unknown> = {
      'offboarding.handover_template': null,
      'offboarding.approval_flow_key': 'offboarding:offboarding_approval',
      'offboarding.account_disable_strategy': 'immediately',
      'offboarding.certificate_number_format': 'OFFBOARD-{year}{seq:4}',
      'offboarding.archive_access_after_1y': ['admin', 'hr'],
      'archive.years': 5,
    };
    const v = map[`${category}.${key}`];
    if (v === null) throw new Error('not found');
    return v;
  });
});

describe('createOffboarding', () => {
  it('正常路径：创建草稿 + 5 tasks + 审计 + 通知', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.offFindFirst.mockResolvedValue(null);
    const created = makeRecord();
    mocks.transaction.mockImplementation(async (fn: any) => {
      const tx = {
        offboardingRecord: {
          create: mocks.offCreate.mockResolvedValue(created),
        },
      };
      return fn(tx);
    });

    const result = await offboardingService.createOffboarding(
      {
        employeeId: 'e-1',
        resignationType: 'employee_initiated',
        lastWorkingDate: '2026-09-30',
      },
      'u-hr',
    );

    expect(result.status).toBe('handover_pending');
    expect(result.tasks).toHaveLength(5);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'OffboardingRecord',
      }),
    );
    expect(mocks.sendNotification).toHaveBeenCalled();
  });

  it('员工不存在 → 71201', async () => {
    mocks.empFindFirst.mockResolvedValue(null);
    await expect(
      offboardingService.createOffboarding(
        {
          employeeId: 'x',
          resignationType: 'employee_initiated',
          lastWorkingDate: '2026-09-30',
        },
        'u-hr',
      ),
    ).rejects.toMatchObject({ code: 71201 });
  });

  it('员工非 active → 71504', async () => {
    mocks.empFindFirst.mockResolvedValue({ ...employee, status: 'probation' });
    await expect(
      offboardingService.createOffboarding(
        {
          employeeId: 'e-1',
          resignationType: 'employee_initiated',
          lastWorkingDate: '2026-09-30',
        },
        'u-hr',
      ),
    ).rejects.toMatchObject({ code: 71504 });
  });

  it('已有 active 离职记录 → 71505', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.offFindFirst.mockResolvedValue(makeRecord({ status: 'submitted' }));
    await expect(
      offboardingService.createOffboarding(
        {
          employeeId: 'e-1',
          resignationType: 'employee_initiated',
          lastWorkingDate: '2026-09-30',
        },
        'u-hr',
      ),
    ).rejects.toMatchObject({ code: 71505 });
  });
});

describe('getOffboardingById / list', () => {
  it('getOffboardingById 正常 + 不存在 → 71501', async () => {
    mocks.offFindUnique.mockResolvedValueOnce(makeRecord());
    mocks.empFindFirst.mockResolvedValueOnce(employee);
    const row = await offboardingService.getOffboardingById('off-1');
    expect(row.id).toBe('off-1');
    expect(row.employee?.name).toBe('HR 专员');

    mocks.offFindUnique.mockResolvedValueOnce(null);
    await expect(
      offboardingService.getOffboardingById('x'),
    ).rejects.toMatchObject({ code: 71501 });
  });

  it('listOffboardings 分页', async () => {
    mocks.empFindMany.mockResolvedValue([{ id: 'e-1' }]);
    mocks.offFindMany.mockResolvedValue([makeRecord()]);
    mocks.offCount.mockResolvedValue(1);
    const result = await offboardingService.listOffboardings({
      companyId: 'c-1', page: 1, pageSize: 10,
    });
    expect(result.total).toBe(1);
  });
});

describe('confirmHandover', () => {
  it('正常路径：5 tasks done → submitted + approval', async () => {
    mocks.offFindUnique
      .mockResolvedValueOnce(makeRecord({
        status: 'handover_pending',
        tasks: makeTasks('done'),
      }))
      .mockResolvedValueOnce(makeRecord({ employeeId: 'e-1' })) // submitInternal find
      .mockResolvedValueOnce(makeRecord({
        status: 'submitted', tasks: makeTasks('done'),
      }));
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.submitApproval.mockResolvedValue({
      id: 'appr-1', currentNodeId: 'n1', status: 'pending',
    });
    mocks.offUpdate.mockResolvedValue(makeRecord({ status: 'submitted' }));

    const result = await offboardingService.confirmHandover('off-1', 'u-hr');
    expect(result.status).toBe('submitted');
    expect(mocks.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        businessType: 'offboarding', businessId: 'off-1',
      }),
    );
  });

  it('有 task 未 done → 71505', async () => {
    mocks.offFindUnique.mockResolvedValue(makeRecord({
      status: 'handover_pending',
      tasks: [
        { id: 't1', status: 'done' },
        { id: 't2', status: 'pending' },
      ],
    }));
    await expect(
      offboardingService.confirmHandover('off-1', 'u-hr'),
    ).rejects.toMatchObject({ code: 71505 });
  });

  it('状态非 handover_pending → 71503', async () => {
    mocks.offFindUnique.mockResolvedValue(makeRecord({ status: 'submitted' }));
    await expect(
      offboardingService.confirmHandover('off-1', 'u-hr'),
    ).rejects.toMatchObject({ code: 71503 });
  });
});

describe('confirmOffboarding', () => {
  it('approved 后 employee.status=resigned + 账号禁用 + audit', async () => {
    mocks.offFindUnique.mockResolvedValue(makeRecord({ status: 'submitted' }));
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.userUpdate.mockResolvedValue({ id: 'u-emp', status: 'disabled' });
    mocks.empUpdate.mockResolvedValue({ ...employee, status: 'resigned' });
    mocks.offUpdate
      .mockResolvedValueOnce(makeRecord()) // archiveEmployee
      .mockResolvedValueOnce(makeRecord({
        status: 'approved', accountDisabled: true,
      }));

    const result = await offboardingService.confirmOffboarding(
      'off-1',
      { approved: true, instanceId: 'appr-1' },
      'u-hr',
    );
    expect(result.status).toBe('approved');
    expect(mocks.empUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'e-1' },
        data: expect.objectContaining({ status: 'resigned' }),
      }),
    );
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-emp' },
        data: expect.objectContaining({ status: 'disabled' }),
      }),
    );
  });

  it('approvalResult.approved=false → rejectOffboarding', async () => {
    mocks.offFindUnique.mockResolvedValue(makeRecord({ status: 'submitted' }));
    mocks.offUpdate.mockResolvedValue(makeRecord({ status: 'rejected' }));
    mocks.empFindFirst.mockResolvedValue(employee);

    const result = await offboardingService.confirmOffboarding(
      'off-1',
      { approved: false },
      'u-hr',
    );
    expect(result.status).toBe('rejected');
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: 'offboarding_rejected:in_app' }),
    );
  });
});

describe('issueCertificate', () => {
  it('正常路径：approved → certificate_issued + mock PDF + 通知', async () => {
    mocks.offFindUnique.mockResolvedValue(makeRecord({ status: 'approved' }));
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.companyFindFirst.mockResolvedValue({
      id: 'c-1', name: '西安辰航卓越科技有限公司', deletedAt: null,
    });
    mocks.offFindFirst.mockResolvedValue(null); // cert number seq
    mocks.offUpdate.mockResolvedValue(makeRecord({
      status: 'certificate_issued',
      certificateIssued: true,
      certificateNumber: 'OFFBOARD-20260001',
    }));

    const result = await offboardingService.issueCertificate('off-1', 'u-hr');
    expect(result.status).toBe('certificate_issued');
    expect(result.certificateIssued).toBe(true);
    expect(mocks.writeFile).toHaveBeenCalled();
    expect(mocks.sendNotification).toHaveBeenCalled();
  });

  it('已签发 → 71507', async () => {
    mocks.offFindUnique.mockResolvedValue(makeRecord({
      status: 'certificate_issued', certificateIssued: true,
    }));
    await expect(
      offboardingService.issueCertificate('off-1', 'u-hr'),
    ).rejects.toMatchObject({ code: 71507 });
  });

  it('非 approved 状态 → 71503', async () => {
    mocks.offFindUnique.mockResolvedValue(makeRecord({ status: 'submitted' }));
    await expect(
      offboardingService.issueCertificate('off-1', 'u-hr'),
    ).rejects.toMatchObject({ code: 71503 });
  });
});

describe('cancelOffboarding', () => {
  it('handover_pending 直接取消', async () => {
    mocks.offFindUnique.mockResolvedValue(
      makeRecord({ status: 'handover_pending' }),
    );
    mocks.offUpdate.mockResolvedValue(makeRecord({ status: 'cancelled' }));
    const result = await offboardingService.cancelOffboarding(
      'off-1',
      '员工撤回',
      'u-hr',
    );
    expect(result.status).toBe('cancelled');
    expect(mocks.withdraw).not.toHaveBeenCalled();
  });

  it('submitted 调 approval.withdraw', async () => {
    mocks.offFindUnique.mockResolvedValue(makeRecord({
      status: 'submitted', approvalInstanceId: 'appr-1',
    }));
    mocks.withdraw.mockResolvedValue({ id: 'appr-1', status: 'withdrawn' });
    mocks.offUpdate.mockResolvedValue(makeRecord({ status: 'cancelled' }));
    const result = await offboardingService.cancelOffboarding(
      'off-1',
      '撤回',
      'u-hr',
    );
    expect(mocks.withdraw).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'appr-1' }),
    );
    expect(result.status).toBe('cancelled');
  });

  it('approved 状态 → 71506', async () => {
    mocks.offFindUnique.mockResolvedValue(makeRecord({ status: 'approved' }));
    await expect(
      offboardingService.cancelOffboarding('off-1', '原因', 'u-hr'),
    ).rejects.toMatchObject({ code: 71506 });
  });
});

describe('checkArchiveAccess', () => {
  it('离职 1 年后非 admin/hr → false', () => {
    const result = offboardingService.checkArchiveAccess(
      'e-1',
      ['employee'],
      new Date('2025-01-01'),
    );
    expect(result).toBe(false);
  });

  it('离职 1 年后 admin → true', () => {
    const result = offboardingService.checkArchiveAccess(
      'e-1',
      ['admin'],
      new Date('2025-01-01'),
    );
    expect(result).toBe(true);
  });

  it('离职 1 年内任意角色 → true', () => {
    const result = offboardingService.checkArchiveAccess(
      'e-1',
      ['employee'],
      new Date('2026-08-01'),
    );
    expect(result).toBe(true);
  });
});

describe('listUpcomingResignations', () => {
  it('返回 N 天内离职生效列表', async () => {
    mocks.offFindMany.mockResolvedValue([makeRecord({ status: 'approved' })]);
    const result = await offboardingService.listUpcomingResignations(7);
    expect(Array.isArray(result)).toBe(true);
    expect(mocks.offFindMany).toHaveBeenCalled();
  });
});
