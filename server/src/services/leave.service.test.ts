// M2-B3: leave.service 单元测试 | HRMS
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  empFindFirst: vi.fn(),
  lrFindUnique: vi.fn(),
  lrFindMany: vi.fn(),
  lrFindFirst: vi.fn(),
  lrCount: vi.fn(),
  lrCreate: vi.fn(),
  lrUpdate: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  sendNotification: vi.fn(),
  submitApproval: vi.fn(),
  withdraw: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: { findFirst: mocks.empFindFirst },
    leaveRequest: {
      findUnique: mocks.lrFindUnique,
      findMany: mocks.lrFindMany,
      findFirst: mocks.lrFindFirst,
      count: mocks.lrCount,
      create: mocks.lrCreate,
      update: mocks.lrUpdate,
    },
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
  submitApproval: mocks.submitApproval.mockResolvedValue({ id: 'instance-1' }),
  withdraw: mocks.withdraw.mockResolvedValue({ id: 'instance-1', status: 'withdrawn' }),
}));

import { Decimal } from '@prisma/client/runtime/library';

import * as leaveService from './leave.service';

const employee = {
  id: 'emp-1',
  name: '张三',
  companyId: 'co-1',
  departmentId: 'dept-1',
  userId: 'u-1',
  hireDate: new Date('2018-01-01'),
  status: 'active',
  deletedAt: null,
};

const LEAVE_START = '2026-09-08';
const LEAVE_END_3 = '2026-09-10';
const LEAVE_END_5 = '2026-09-14';

beforeEach(() => {
  vi.clearAllMocks();
  // 修复 B3 跨 UTC 边界日期敏感测试（2026-08-27 发现的 72009 失败）
  // 锁在 2026-09-01 12:00 UTC+8（= 04:00 UTC），保证：
  //   1) toISOString().slice(0, 10) 不会跨日
  //   2) LEAVE_START='2026-09-08' > today 走正常校验（不会触发 72002 "日期不合法"）
  //   3) startDate = 明天（2026-09-02 周三）→ advanceDays=1 < 7 → 抛 72009
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-01T12:00:00+08:00'));
  mocks.getValue.mockImplementation(async (_cat: string, key: string) => {
    const map: Record<string, unknown> = {
      types: ['annual', 'sick', 'personal', 'compensatory', 'marriage', 'maternity', 'paternity', 'bereavement'],
      annual_leave_rules: { '1-10': 5, '10-20': 10, '>20': 15 },
      comp_leave_validity_months: 6,
      approval_flow_short: 'leave:leave_short',
      approval_flow_long: 'leave:leave_long',
      max_consecutive_days: 30,
      min_advance_days_annual: 7,
      workday_exclude_weekends: true,
      sick_leave_max_days: 90,
    };
    return map[key] ?? null;
  });
  mocks.empFindFirst.mockResolvedValue(employee);
  mocks.lrFindMany.mockResolvedValue([]);
  mocks.lrCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'lr-new',
    status: 'draft',
    ...data,
  }));
  mocks.lrUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'lr-new',
    status: 'submitted',
    approvalInstanceId: 'instance-1',
    ...data,
  }));
  mocks.auditLog.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createLeaveRequest', () => {
  it('正常路径：3 天年假 + 充足余额 + ≤3 天审批流', async () => {
    const result = await leaveService.createLeaveRequest({
      employeeId: 'emp-1',
      leaveType: 'annual',
      startDate: LEAVE_START,
      endDate: LEAVE_END_3,
      reason: '休假',
    }, 'user-1');

    expect(result.status).toBe('submitted');
    expect(mocks.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        flowKey: 'leave:leave_short',
        businessType: 'leave',
        businessId: 'lr-new',
      }),
    );
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('5 天年假 → 走 long 审批流', async () => {
    await leaveService.createLeaveRequest({
      employeeId: 'emp-1',
      leaveType: 'annual',
      startDate: LEAVE_START,
      endDate: LEAVE_END_5,
      reason: '长假',
    }, 'user-1');

    expect(mocks.submitApproval).toHaveBeenCalledWith(
      expect.objectContaining({ flowKey: 'leave:leave_long' }),
    );
  });

  it('leaveType 非法 → 72003', async () => {
    await expect(leaveService.createLeaveRequest({
      employeeId: 'emp-1',
      leaveType: 'invalid',
      startDate: LEAVE_START,
      endDate: LEAVE_END_3,
    }, 'user-1')).rejects.toMatchObject({ code: 72003 });
  });

  it('startDate >= endDate → 72002', async () => {
    await expect(leaveService.createLeaveRequest({
      employeeId: 'emp-1',
      leaveType: 'personal',
      startDate: '2026-09-15',
      endDate: '2026-09-10',
    }, 'user-1')).rejects.toMatchObject({ code: 72002 });
  });

  it('endDate - startDate > 30 天 → 72008', async () => {
    await expect(leaveService.createLeaveRequest({
      employeeId: 'emp-1',
      leaveType: 'personal',
      startDate: '2026-09-01',
      endDate: '2026-10-15',
    }, 'user-1')).rejects.toMatchObject({ code: 72008 });
  });

  it('年假未提前 7 天 → 72009', async () => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    while (start.getDay() === 0 || start.getDay() === 6) {
      start.setDate(start.getDate() + 1);
    }
    const end = new Date(start);
    await expect(leaveService.createLeaveRequest({
      employeeId: 'emp-1',
      leaveType: 'annual',
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    }, 'user-1')).rejects.toMatchObject({ code: 72009 });
  });

  it('年假余额不足 → 72004', async () => {
    mocks.lrFindMany.mockResolvedValue([
      { totalDays: new Decimal(5) },
    ]);
    await expect(leaveService.createLeaveRequest({
      employeeId: 'emp-1',
      leaveType: 'annual',
      startDate: LEAVE_START,
      endDate: LEAVE_END_3,
    }, 'user-1')).rejects.toMatchObject({ code: 72004 });
  });

  it('请假区间重叠 → 72005', async () => {
    mocks.lrFindMany.mockResolvedValue([{ id: 'lr-existing' }]);
    await expect(leaveService.createLeaveRequest({
      employeeId: 'emp-1',
      leaveType: 'personal',
      startDate: LEAVE_START,
      endDate: LEAVE_END_3,
    }, 'user-1')).rejects.toMatchObject({ code: 72005 });
  });

  it('病假不校验余额', async () => {
    const result = await leaveService.createLeaveRequest({
      employeeId: 'emp-1',
      leaveType: 'sick',
      startDate: LEAVE_START,
      endDate: LEAVE_END_3,
      reason: '感冒发烧',
    }, 'user-1');
    expect(result.status).toBe('submitted');
  });
});

describe('cancelLeaveRequest', () => {
  it('draft 直接取消', async () => {
    mocks.lrFindUnique.mockResolvedValue({ id: 'lr-1', status: 'draft' });
    mocks.lrUpdate.mockResolvedValue({ id: 'lr-1', status: 'cancelled' });
    const result = await leaveService.cancelLeaveRequest('lr-1', '撤回', 'user-1');
    expect(result.status).toBe('cancelled');
  });

  it('submitted 调 approval.withdraw', async () => {
    mocks.lrFindUnique.mockResolvedValue({
      id: 'lr-1', status: 'submitted', approvalInstanceId: 'i-1',
    });
    mocks.lrUpdate.mockResolvedValue({ id: 'lr-1', status: 'cancelled' });
    await leaveService.cancelLeaveRequest('lr-1', '撤回', 'user-1');
    expect(mocks.withdraw).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'i-1' }),
    );
  });

  it('approved 状态 → 72007', async () => {
    mocks.lrFindUnique.mockResolvedValue({ id: 'lr-1', status: 'approved' });
    await expect(leaveService.cancelLeaveRequest('lr-1', '原因', 'user-1'))
      .rejects.toMatchObject({ code: 72007 });
  });
});

describe('confirmLeaveRequest', () => {
  const pendingRecord = {
    id: 'lr-1',
    employeeId: 'emp-1',
    status: 'submitted',
  };

  it('approved → 通知 + 审计', async () => {
    mocks.lrFindUnique.mockResolvedValue(pendingRecord);
    mocks.lrUpdate.mockResolvedValue({ id: 'lr-1', status: 'approved' });
    const result = await leaveService.confirmLeaveRequest(
      'lr-1',
      { approved: true },
      'user-hr',
    );
    expect(result.status).toBe('approved');
    expect(mocks.sendNotification).toHaveBeenCalled();
  });

  it('rejected → 通知 + 审计', async () => {
    mocks.lrFindUnique.mockResolvedValue(pendingRecord);
    mocks.lrUpdate.mockResolvedValue({ id: 'lr-1', status: 'rejected' });
    const result = await leaveService.confirmLeaveRequest(
      'lr-1',
      { approved: false },
      'user-hr',
    );
    expect(result.status).toBe('rejected');
  });

  it('非 submitted 状态 → 72006', async () => {
    mocks.lrFindUnique.mockResolvedValue({ id: 'lr-1', status: 'approved' });
    await expect(leaveService.confirmLeaveRequest('lr-1', { approved: true }, 'user-1'))
      .rejects.toMatchObject({ code: 72006 });
  });
});

describe('calculateLeaveBalance', () => {
  it('工龄 5 年的员工 → 年假 5 天', async () => {
    mocks.empFindFirst.mockResolvedValue({
      ...employee,
      hireDate: new Date('2021-01-01'),
    });
    mocks.lrFindMany.mockResolvedValue([]);
    const result = await leaveService.calculateLeaveBalance('emp-1', 'annual', 2026);
    expect(result.totalDays).toBe(5);
    expect(result.remainingDays).toBe(5);
  });

  it('工龄 15 年 → 年假 10 天', async () => {
    mocks.empFindFirst.mockResolvedValue({
      ...employee,
      hireDate: new Date('2011-01-01'),
    });
    mocks.lrFindMany.mockResolvedValue([]);
    const result = await leaveService.calculateLeaveBalance('emp-1', 'annual', 2026);
    expect(result.totalDays).toBe(10);
  });

  it('病假不限余额 → 999', async () => {
    const sick = await leaveService.calculateLeaveBalance('emp-1', 'sick', 2026);
    expect(sick.remainingDays).toBe(999);
  });
});

describe('calculateWorkingDays', () => {
  it('2026-09-01 ~ 2026-09-05（周二到周六）→ 4 个工作日', () => {
    const days = leaveService.calculateWorkingDays(
      new Date('2026-09-01'),
      new Date('2026-09-05'),
    );
    expect(days).toBe(4);
  });

  it('2026-09-05（周六）单日 → 0 个工作日', () => {
    const days = leaveService.calculateWorkingDays(
      new Date('2026-09-05'),
      new Date('2026-09-05'),
    );
    expect(days).toBe(0);
  });
});

describe('hasOverlappingLeave', () => {
  it('无重叠 → false', async () => {
    mocks.lrFindMany.mockResolvedValue([]);
    const result = await leaveService.hasOverlappingLeave(
      'emp-1',
      new Date('2026-09-01'),
      new Date('2026-09-05'),
    );
    expect(result).toBe(false);
  });

  it('有重叠 → true', async () => {
    mocks.lrFindMany.mockResolvedValue([{ id: 'lr-existing' }]);
    const result = await leaveService.hasOverlappingLeave(
      'emp-1',
      new Date('2026-09-01'),
      new Date('2026-09-05'),
    );
    expect(result).toBe(true);
  });
});
