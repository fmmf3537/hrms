// M2-B4: overtime.service 单元测试 | HRMS
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
  salaryFindFirst: vi.fn(),
  otFindUnique: vi.fn(),
  otFindFirst: vi.fn(),
  otFindMany: vi.fn(),
  otCreate: vi.fn(),
  otUpdate: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  sendNotification: vi.fn(),
  submitApproval: vi.fn(),
  withdraw: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: { findFirst: mocks.empFindFirst },
    employeeSalaryHistory: { findFirst: mocks.salaryFindFirst },
    overtimeRequest: {
      findUnique: mocks.otFindUnique,
      findFirst: mocks.otFindFirst,
      findMany: mocks.otFindMany,
      create: mocks.otCreate,
      update: mocks.otUpdate,
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

import * as overtimeService from './overtime.service';

const employee = {
  id: 'emp-1',
  name: '张三',
  companyId: 'co-1',
  departmentId: 'dept-1',
  userId: 'u-1',
  status: 'active',
  deletedAt: null,
};

let lastRecord: Record<string, unknown> = {};

function futureStart(hoursFromNow: number): Date {
  return new Date(Date.now() + hoursFromNow * 3600 * 1000);
}

function defaultConfig(_cat: string, key: string): unknown {
  const map: Record<string, unknown> = {
    max_daily_hours: 3,
    max_monthly_hours: 36,
    min_advance_hours: 4,
    approval_flow_key: 'overtime:overtime_approval',
    pay_multiplier_weekday: 1.5,
    pay_multiplier_weekend: 2.0,
    pay_multiplier_holiday: 3.0,
  };
  return map[key] ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(defaultConfig);
  mocks.empFindFirst.mockResolvedValue(employee);
  mocks.salaryFindFirst.mockResolvedValue({ baseSalary: new Decimal(10000) });
  mocks.otFindFirst.mockResolvedValue(null);
  mocks.otFindMany.mockResolvedValue([]);
  mocks.otCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    lastRecord = { id: 'ov-new', status: 'draft', ...data };
    return lastRecord;
  });
  mocks.otUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    lastRecord = { ...lastRecord, ...data };
    return lastRecord;
  });
  mocks.auditLog.mockResolvedValue(undefined);
});

describe('createOvertimeRequest', () => {
  it('正常路径：工作日 2 小时加班 + pay 补偿', async () => {
    const start = futureStart(6);
    const end = new Date(start.getTime() + 2 * 3600 * 1000);

    const result = await overtimeService.createOvertimeRequest({
      employeeId: 'emp-1',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      compensationType: 'pay',
      reason: '项目紧急',
    }, 'user-1');

    expect(result.status).toBe('submitted');
    expect(Number(result.totalHours)).toBe(2);
    expect(Number(result.overtimePay)).toBeGreaterThan(0);
    expect(mocks.submitApproval).toHaveBeenCalled();
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('周末加班 + comp 补偿 → compDays = totalHours / 8', async () => {
    mocks.getValue.mockImplementation(async (_cat: string, key: string) => {
      if (key === 'max_daily_hours') return 24;
      return defaultConfig(_cat, key);
    });
    const start = futureStart(6);
    const end = new Date(start.getTime() + 8 * 3600 * 1000);

    const result = await overtimeService.createOvertimeRequest({
      employeeId: 'emp-1',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      compensationType: 'comp',
      reason: '周末加班',
    }, 'user-1');

    expect(Number(result.compDays)).toBe(1.0);
    expect(result.overtimePay).toBeNull();
  });

  it('startTime >= endTime → 72102', async () => {
    const t = futureStart(6);
    await expect(overtimeService.createOvertimeRequest({
      employeeId: 'emp-1',
      startTime: t.toISOString(),
      endTime: new Date(t.getTime() - 3600 * 1000).toISOString(),
      compensationType: 'pay',
      reason: 'test',
    }, 'user-1')).rejects.toMatchObject({ code: 72102 });
  });

  it('单日 > 3 小时 → 72103', async () => {
    const start = futureStart(6);
    const end = new Date(start.getTime() + 4 * 3600 * 1000);
    await expect(overtimeService.createOvertimeRequest({
      employeeId: 'emp-1',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      compensationType: 'pay',
      reason: 'test',
    }, 'user-1')).rejects.toMatchObject({ code: 72103 });
  });

  it('单月 > 36 小时 → 72104', async () => {
    mocks.otFindMany.mockResolvedValue([
      { totalHours: new Decimal(35) },
    ]);
    const start = futureStart(6);
    const end = new Date(start.getTime() + 2.5 * 3600 * 1000);
    await expect(overtimeService.createOvertimeRequest({
      employeeId: 'emp-1',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      compensationType: 'pay',
      reason: 'test',
    }, 'user-1')).rejects.toMatchObject({ code: 72104 });
  });

  it('未提前 4 小时 → 72108', async () => {
    const soon = futureStart(2);
    const end = new Date(soon.getTime() + 2 * 3600 * 1000);
    await expect(overtimeService.createOvertimeRequest({
      employeeId: 'emp-1',
      startTime: soon.toISOString(),
      endTime: end.toISOString(),
      compensationType: 'pay',
      reason: 'test',
    }, 'user-1')).rejects.toMatchObject({ code: 72108 });
  });

  it('compensationType 非法 → 72107', async () => {
    const start = futureStart(6);
    const end = new Date(start.getTime() + 2 * 3600 * 1000);
    await expect(overtimeService.createOvertimeRequest({
      employeeId: 'emp-1',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      compensationType: 'invalid',
      reason: 'test',
    }, 'user-1')).rejects.toMatchObject({ code: 72107 });
  });

  it('加班区间重叠 → 72109', async () => {
    mocks.otFindFirst.mockResolvedValue({
      id: 'ov-existing',
      startTime: futureStart(6),
      endTime: futureStart(8),
    });
    const start = futureStart(7);
    const end = new Date(start.getTime() + 2 * 3600 * 1000);
    await expect(overtimeService.createOvertimeRequest({
      employeeId: 'emp-1',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      compensationType: 'pay',
      reason: 'test',
    }, 'user-1')).rejects.toMatchObject({ code: 72109 });
  });
});

describe('cancelOvertimeRequest', () => {
  it('draft 直接取消', async () => {
    mocks.otFindUnique.mockResolvedValue({ id: 'ov-1', status: 'draft' });
    mocks.otUpdate.mockResolvedValue({ id: 'ov-1', status: 'cancelled' });
    const result = await overtimeService.cancelOvertimeRequest('ov-1', '撤回', 'user-1');
    expect(result.status).toBe('cancelled');
  });

  it('submitted 调 approval.withdraw', async () => {
    mocks.otFindUnique.mockResolvedValue({
      id: 'ov-1', status: 'submitted', approvalInstanceId: 'i-1',
    });
    mocks.otUpdate.mockResolvedValue({ id: 'ov-1', status: 'cancelled' });
    await overtimeService.cancelOvertimeRequest('ov-1', '撤回', 'user-1');
    expect(mocks.withdraw).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'i-1' }),
    );
  });

  it('approved 状态 → 72106', async () => {
    mocks.otFindUnique.mockResolvedValue({ id: 'ov-1', status: 'approved' });
    await expect(overtimeService.cancelOvertimeRequest('ov-1', '原因', 'user-1'))
      .rejects.toMatchObject({ code: 72106 });
  });
});

describe('confirmOvertimeRequest', () => {
  it('approved → 通知 + 审计', async () => {
    mocks.otFindUnique.mockResolvedValue({ id: 'ov-1', status: 'submitted', employeeId: 'emp-1' });
    mocks.otUpdate.mockResolvedValue({ id: 'ov-1', status: 'approved' });
    const result = await overtimeService.confirmOvertimeRequest('ov-1', { approved: true }, 'user-1');
    expect(result.status).toBe('approved');
    expect(mocks.sendNotification).toHaveBeenCalled();
  });

  it('rejected → 状态 rejected + 通知', async () => {
    mocks.otFindUnique.mockResolvedValue({ id: 'ov-1', status: 'submitted', employeeId: 'emp-1' });
    mocks.otUpdate.mockResolvedValue({ id: 'ov-1', status: 'rejected' });
    const result = await overtimeService.confirmOvertimeRequest('ov-1', { approved: false }, 'user-1');
    expect(result.status).toBe('rejected');
  });

  it('非 submitted 状态 → 72105', async () => {
    mocks.otFindUnique.mockResolvedValue({ id: 'ov-1', status: 'approved' });
    await expect(overtimeService.confirmOvertimeRequest('ov-1', { approved: true }, 'user-1'))
      .rejects.toMatchObject({ code: 72105 });
  });
});

describe('calculateOvertimePay', () => {
  it('工作日 2 小时 + baseSalary=10000 → pay ≈ 172.41', async () => {
    mocks.salaryFindFirst.mockResolvedValue({ baseSalary: new Decimal(10000) });
    mocks.getValue.mockResolvedValue(1.5);
    const pay = await overtimeService.calculateOvertimePay('emp-1', 2.0, 'weekday');
    expect(pay).toBeCloseTo(172.41, 1);
  });

  it('周末 4 小时 + baseSalary=20000 → pay ≈ 919.54', async () => {
    mocks.salaryFindFirst.mockResolvedValue({ baseSalary: new Decimal(20000) });
    mocks.getValue.mockResolvedValue(2.0);
    const pay = await overtimeService.calculateOvertimePay('emp-1', 4.0, 'weekend');
    expect(pay).toBeCloseTo(919.54, 1);
  });

  it('baseSalary 缺失 → 72110', async () => {
    mocks.salaryFindFirst.mockResolvedValue(null);
    await expect(overtimeService.calculateOvertimePay('emp-1', 2.0, 'weekday'))
      .rejects.toMatchObject({ code: 72110 });
  });
});

describe('calculateOvertimeCompDays', () => {
  it('8 小时 → 1 天', () => {
    expect(overtimeService.calculateOvertimeCompDays(8)).toBe(1.0);
  });

  it('12 小时 → 1.5 天', () => {
    expect(overtimeService.calculateOvertimeCompDays(12)).toBe(1.5);
  });

  it('4 小时 → 0.5 天', () => {
    expect(overtimeService.calculateOvertimeCompDays(4)).toBe(0.5);
  });
});

describe('determineOvertimeType', () => {
  it('2026-09-01（周二）→ weekday', () => {
    expect(overtimeService.determineOvertimeType(new Date('2026-09-01T19:00:00+08:00'))).toBe('weekday');
  });

  it('2026-09-05（周六）→ weekend', () => {
    expect(overtimeService.determineOvertimeType(new Date('2026-09-05T19:00:00+08:00'))).toBe('weekend');
  });

  it('2026-09-06（周日）→ weekend', () => {
    expect(overtimeService.determineOvertimeType(new Date('2026-09-06T19:00:00+08:00'))).toBe('weekend');
  });
});
