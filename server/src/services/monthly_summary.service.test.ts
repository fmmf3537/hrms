// M2-B6: monthly_summary.service 单元测试 | HRMS
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  empFindMany: vi.fn(),
  empFindFirst: vi.fn(),
  arFindMany: vi.fn(),
  lrFindMany: vi.fn(),
  otFindMany: vi.fn(),
  btFindMany: vi.fn(),
  msFindFirst: vi.fn(),
  msFindUnique: vi.fn(),
  msFindMany: vi.fn(),
  msCreate: vi.fn(),
  msUpdate: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: {
      findMany: mocks.empFindMany,
      findFirst: mocks.empFindFirst,
    },
    attendanceRecord: { findMany: mocks.arFindMany },
    leaveRequest: { findMany: mocks.lrFindMany },
    overtimeRequest: { findMany: mocks.otFindMany },
    businessTrip: { findMany: mocks.btFindMany },
    monthlySummary: {
      findFirst: mocks.msFindFirst,
      findUnique: mocks.msFindUnique,
      findMany: mocks.msFindMany,
      create: mocks.msCreate,
      update: mocks.msUpdate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

vi.mock('./notification.service', () => ({
  sendNotification: mocks.sendNotification.mockResolvedValue({ logId: 'l1' }),
}));

import * as summaryService from './monthly_summary.service';

const employees = [
  {
    id: 'emp-1',
    name: '张三',
    companyId: 'co-1',
    departmentId: 'dept-1',
    userId: 'u-1',
    status: 'active',
    deletedAt: null,
  },
  {
    id: 'emp-2',
    name: '李四',
    companyId: 'co-1',
    departmentId: 'dept-1',
    userId: 'u-2',
    status: 'active',
    deletedAt: null,
  },
  {
    id: 'emp-3',
    name: '王五',
    companyId: 'co-1',
    departmentId: 'dept-2',
    userId: 'u-3',
    status: 'active',
    deletedAt: null,
  },
];

function defaultConfig(_cat: string, key: string): unknown {
  const map: Record<string, unknown> = {
    auto_generate_day: 1,
    employee_confirm_deadline: 3,
    hr_lock_day: 5,
    default_confirm_strategy: 'auto_confirm',
    work_days_per_month: 21.75,
  };
  return map[key] ?? null;
}

function emptyAggregates() {
  mocks.arFindMany.mockResolvedValue([]);
  mocks.lrFindMany.mockResolvedValue([]);
  mocks.otFindMany.mockResolvedValue([]);
  mocks.btFindMany.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  mocks.getValue.mockImplementation(defaultConfig);
  mocks.empFindMany.mockResolvedValue(employees);
  emptyAggregates();
  mocks.msFindFirst.mockResolvedValue(null);
  mocks.msFindMany.mockResolvedValue([]);
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      monthlySummary: {
        findFirst: mocks.msFindFirst,
        create: mocks.msCreate,
      },
    };
    return fn(tx);
  });
  mocks.msCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: `ms-${String(data.employeeId)}`,
    ...data,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('generateMonthlySummary', () => {
  it('正常路径：2026-08 全员生成 + 调休余额正确计算', async () => {
    mocks.otFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.compensationType === 'comp') {
        return [{ totalHours: 16, compDays: 2 }];
      }
      return [{ totalHours: 4 }];
    });
    mocks.lrFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.leaveType === 'compensatory') {
        return [{ totalDays: 1 }];
      }
      return [{ totalDays: 2 }];
    });

    const result = await summaryService.generateMonthlySummary(
      { year: 2026, month: 8 },
      'user-hr-1',
    );

    expect(result.generated).toBe(3);
    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.auditLog).toHaveBeenCalled();
    expect(mocks.sendNotification).toHaveBeenCalled();
  });

  it('同员工同月已生成 → 72302', async () => {
    mocks.empFindMany.mockResolvedValue([employees[0]]);
    mocks.msFindFirst.mockResolvedValue({
      id: 'ms-existing', year: 2026, month: 8, employeeId: 'emp-1', status: 'draft',
    });

    await expect(
      summaryService.generateMonthlySummary(
        { year: 2026, month: 8, employeeId: 'emp-1' },
        'user-1',
      ),
    ).rejects.toMatchObject({ code: 72302 });
  });

  it('month=0 → 72303', async () => {
    await expect(
      summaryService.generateMonthlySummary({ year: 2026, month: 0 }, 'user-1'),
    ).rejects.toMatchObject({ code: 72303 });
  });

  it('month=13 → 72303', async () => {
    await expect(
      summaryService.generateMonthlySummary({ year: 2026, month: 13 }, 'user-1'),
    ).rejects.toMatchObject({ code: 72303 });
  });
});

describe('calculateCompBalance', () => {
  it('加班转调休 2 天 - 调休已用 1 天 → 1 天', async () => {
    mocks.otFindMany.mockResolvedValue([{ totalHours: 16, compDays: 2 }]);
    mocks.lrFindMany.mockResolvedValue([{ totalDays: 1 }]);

    const balance = await summaryService.calculateCompBalance('emp-1', 2026, 8);
    expect(balance).toBe(1);
  });

  it('加班转调休 0 天 → 0', async () => {
    mocks.otFindMany.mockResolvedValue([]);
    mocks.lrFindMany.mockResolvedValue([]);

    const balance = await summaryService.calculateCompBalance('emp-1', 2026, 8);
    expect(balance).toBe(0);
  });

  it('调休已用 > 加班转调休 → 0（clamp 不允许负）', async () => {
    mocks.otFindMany.mockResolvedValue([]);
    mocks.lrFindMany.mockResolvedValue([{ totalDays: 5 }]);

    const balance = await summaryService.calculateCompBalance('emp-1', 2026, 8);
    expect(balance).toBe(0);
  });

  it('跨月查询：8月加班但 9月调休 → 8 月余额 = 加班 - 0', async () => {
    mocks.otFindMany.mockImplementation(async ({ where }: { where: { startTime?: { gte: Date } } }) => {
      const gte = where.startTime?.gte;
      if (gte && gte.getMonth() === 7) {
        return [{ totalHours: 8, compDays: 1 }];
      }
      return [];
    });
    mocks.lrFindMany.mockImplementation(async ({ where }: { where: { startDate?: { gte: Date } } }) => {
      const gte = where.startDate?.gte;
      if (gte && gte.getMonth() === 8) {
        return [{ totalDays: 1 }];
      }
      return [];
    });

    const balance = await summaryService.calculateCompBalance('emp-1', 2026, 8);
    expect(balance).toBe(1);
  });
});

describe('confirmMonthlySummary', () => {
  it('正常路径：draft → employee_confirmed + 审计', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T10:00:00Z'));

    mocks.msFindUnique.mockResolvedValue({
      id: 'ms-1', status: 'draft', year: 2026, month: 8,
    });
    mocks.msUpdate.mockResolvedValue({
      id: 'ms-1', status: 'employee_confirmed',
    });

    const result = await summaryService.confirmMonthlySummary('ms-1', 'user-1');
    expect(result.status).toBe('employee_confirmed');
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('已确认状态 → 72305', async () => {
    mocks.msFindUnique.mockResolvedValue({
      id: 'ms-1', status: 'employee_confirmed',
    });

    await expect(summaryService.confirmMonthlySummary('ms-1', 'user-1'))
      .rejects.toMatchObject({ code: 72305 });
  });

  it('超出确认窗口期 → 72307', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T10:00:00Z'));

    mocks.msFindUnique.mockResolvedValue({
      id: 'ms-1', status: 'draft', year: 2026, month: 8,
    });

    await expect(summaryService.confirmMonthlySummary('ms-1', 'user-1'))
      .rejects.toMatchObject({ code: 72307 });
  });

  it('已锁定报表确认 → 72310', async () => {
    mocks.msFindUnique.mockResolvedValue({
      id: 'ms-1', status: 'hr_locked', year: 2026, month: 8,
    });

    await expect(summaryService.confirmMonthlySummary('ms-1', 'user-1'))
      .rejects.toMatchObject({ code: 72310 });
  });
});

describe('lockMonthlySummary', () => {
  it('正常路径：employee_confirmed → hr_locked + 审计', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T10:00:00Z'));

    mocks.msFindUnique.mockResolvedValue({
      id: 'ms-1', status: 'employee_confirmed', year: 2026, month: 8,
    });
    mocks.msUpdate.mockResolvedValue({ id: 'ms-1', status: 'hr_locked' });

    const result = await summaryService.lockMonthlySummary('ms-1', 'user-hr-1');
    expect(result.status).toBe('hr_locked');
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('已锁定状态 → 72306', async () => {
    mocks.msFindUnique.mockResolvedValue({ id: 'ms-1', status: 'hr_locked' });

    await expect(summaryService.lockMonthlySummary('ms-1', 'user-1'))
      .rejects.toMatchObject({ code: 72306 });
  });

  it('draft 状态 → 72304', async () => {
    mocks.msFindUnique.mockResolvedValue({ id: 'ms-1', status: 'draft' });

    await expect(summaryService.lockMonthlySummary('ms-1', 'user-1'))
      .rejects.toMatchObject({ code: 72304 });
  });

  it('超出 HR 锁定窗口期 → 72308', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T10:00:00Z'));

    mocks.msFindUnique.mockResolvedValue({
      id: 'ms-1', status: 'employee_confirmed', year: 2026, month: 8,
    });

    await expect(summaryService.lockMonthlySummary('ms-1', 'user-1'))
      .rejects.toMatchObject({ code: 72308 });
  });
});

describe('aggregateAttendanceSummary', () => {
  it('正常路径：8月 22 个工作日 + 2 次迟到 + 1 次缺卡', async () => {
    const records = [];
    for (let d = 3; d <= 24; d += 1) {
      records.push({
        clockInTime: new Date(`2026-08-${String(d).padStart(2, '0')}T09:00:00Z`),
        isLate: d === 4 || d === 5,
        isEarlyLeave: false,
        isMissing: d === 10,
      });
    }
    mocks.arFindMany.mockResolvedValue(records);

    const result = await summaryService.aggregateAttendanceSummary('emp-1', 2026, 8);
    expect(result.workDays).toBe(22);
    expect(result.lateCount).toBe(2);
    expect(result.missingCount).toBe(1);
  });
});

describe('aggregateLeaveSummary', () => {
  it('3 天年假 + 1 天事假 = 4 天', async () => {
    mocks.lrFindMany.mockResolvedValue([
      { leaveType: 'annual', totalDays: 3 },
      { leaveType: 'personal', totalDays: 1 },
    ]);

    const result = await summaryService.aggregateLeaveSummary('emp-1', 2026, 8);
    expect(result.leaveDays).toBe(4);
    expect(result.leaveHours).toBe(32);
  });
});

describe('getMonthlySummary', () => {
  it('员工查自己：返回单个对象', async () => {
    mocks.msFindFirst.mockResolvedValue({
      id: 'ms-1', employeeId: 'emp-1', year: 2026, month: 8,
    });

    const result = await summaryService.getMonthlySummary({
      employeeId: 'emp-1', year: 2026, month: 8,
    });
    expect((result as { id: string }).id).toBe('ms-1');
  });

  it('HR 查全公司：返回数组', async () => {
    mocks.msFindMany.mockResolvedValue([{ id: 'ms-1' }, { id: 'ms-2' }]);

    const result = await summaryService.getMonthlySummary({
      companyId: 'co-1', year: 2026, month: 8,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('员工查自己不存在 → 72301', async () => {
    mocks.msFindFirst.mockResolvedValue(null);

    await expect(summaryService.getMonthlySummary({
      employeeId: 'emp-1', year: 2026, month: 8,
    })).rejects.toMatchObject({ code: 72301 });
  });
});

describe('listEmployeesForSummary', () => {
  it('返回尚未生成报表的员工', async () => {
    mocks.msFindMany.mockResolvedValue([{ employeeId: 'emp-1' }]);

    const result = await summaryService.listEmployeesForSummary(2026, 8);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual(['emp-2', 'emp-3']);
  });
});
