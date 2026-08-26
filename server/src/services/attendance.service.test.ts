// M2-B2: attendance.service 单元测试 | HRMS
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
  saFindFirst: vi.fn(),
  stFindUnique: vi.fn(),
  arFindFirst: vi.fn(),
  arFindUnique: vi.fn(),
  arFindMany: vi.fn(),
  arCount: vi.fn(),
  arCreate: vi.fn(),
  arUpdate: vi.fn(),
  arCreateMany: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  sendNotification: vi.fn(),
  submitApproval: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: { findFirst: mocks.empFindFirst },
    shiftAssignment: { findFirst: mocks.saFindFirst },
    shiftTemplate: { findUnique: mocks.stFindUnique },
    attendanceRecord: {
      findFirst: mocks.arFindFirst,
      findUnique: mocks.arFindUnique,
      findUniqueOrThrow: mocks.arFindUnique,
      findMany: mocks.arFindMany,
      count: mocks.arCount,
      create: mocks.arCreate,
      update: mocks.arUpdate,
      createMany: mocks.arCreateMany,
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
}));

import * as attendanceService from './attendance.service';

const employee = {
  id: 'emp-1',
  name: 'HR 专员',
  companyId: 'co-1',
  departmentId: 'dept-1',
  status: 'active',
  deletedAt: null,
};

const shift = {
  id: 'sh-1',
  startTime: '09:00',
  endTime: '18:00',
  flexMinutes: 30,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_cat: string, key: string) => {
    const map: Record<string, unknown> = {
      wifi_ssids: ['Office-WiFi-XACH', 'Office-WiFi-XACX'],
      gps_max_distance: 100,
      late_threshold: 30,
      early_leave_threshold: 30,
      missing_threshold: 4,
      import_formats: ['deli-e-plus-v1'],
      manual_clock_flow_key: 'attendance:manual_clock_approval',
      monthly_max_manual: 3,
    };
    return map[key] ?? null;
  });
  mocks.empFindFirst.mockResolvedValue(employee);
  mocks.arFindFirst.mockResolvedValue(null);
  mocks.saFindFirst.mockResolvedValue({ id: 'as-1', shiftId: 'sh-1' });
  mocks.stFindUnique.mockResolvedValue(shift);
  mocks.arCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'ar-new',
    status: data.status ?? 'approved',
    isLate: data.isLate ?? false,
    lateMinutes: data.lateMinutes ?? 0,
    isEarlyLeave: data.isEarlyLeave ?? false,
    earlyLeaveMinutes: data.earlyLeaveMinutes ?? 0,
    isMissing: data.isMissing ?? false,
    ...data,
  }));
  mocks.arUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'ar-1',
    ...data,
  }));
  mocks.arFindUnique.mockResolvedValue({
    id: 'ar-1',
    employeeId: 'emp-1',
    status: 'pending',
    clockInTime: new Date('2026-08-25T09:00:00.000Z'),
    clockOutTime: null,
  });
  mocks.auditLog.mockResolvedValue(undefined);
});

const CLOCK_DAY = '2026-08-25';

describe('clockIn', () => {
  it('正常路径：WiFi 打卡 + 班次关联 + 异常判定', async () => {
    const result = await attendanceService.clockIn({
      employeeId: 'emp-1',
      clockType: 'wifi',
      clockInTime: `${CLOCK_DAY}T09:05:00.000Z`,
      wifiSsid: 'Office-WiFi-XACH',
    }, 'user-1');

    expect(result.status).toBe('approved');
    expect(result.isLate).toBe(false);
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLOCK_IN' }),
    );
  });

  it('WiFi SSID 不在白名单 → 71903', async () => {
    await expect(attendanceService.clockIn({
      employeeId: 'emp-1',
      clockType: 'wifi',
      clockInTime: `${CLOCK_DAY}T09:00:00.000Z`,
      wifiSsid: 'Home-WiFi',
    }, 'user-1')).rejects.toMatchObject({ code: 71903 });
  });

  it('GPS 距离 > 100m → 71904', async () => {
    await expect(attendanceService.clockIn({
      employeeId: 'emp-1',
      clockType: 'gps',
      clockInTime: `${CLOCK_DAY}T09:00:00.000Z`,
      gpsLat: 39.9,
      gpsLng: 116.4,
    }, 'user-1')).rejects.toMatchObject({ code: 71904 });
  });

  it('同员工同 clockInTime 重复 → 71902', async () => {
    mocks.arFindFirst.mockResolvedValue({ id: 'ar-existing' });
    await expect(attendanceService.clockIn({
      employeeId: 'emp-1',
      clockType: 'wifi',
      clockInTime: `${CLOCK_DAY}T09:00:00.000Z`,
      wifiSsid: 'Office-WiFi-XACH',
    }, 'user-1')).rejects.toMatchObject({ code: 71902 });
  });

  it('clockInTime 未来 > 5min → 71906', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000);
    await expect(attendanceService.clockIn({
      employeeId: 'emp-1',
      clockType: 'wifi',
      clockInTime: future.toISOString(),
      wifiSsid: 'Office-WiFi-XACH',
    }, 'user-1')).rejects.toMatchObject({ code: 71906 });
  });

  it('迟到 35 分钟 → isLate=true, lateMinutes=35', async () => {
    mocks.arCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'ar-late',
      ...data,
    }));
    const result = await attendanceService.clockIn({
      employeeId: 'emp-1',
      clockType: 'wifi',
      clockInTime: `${CLOCK_DAY}T09:35:00.000Z`,
      wifiSsid: 'Office-WiFi-XACH',
    }, 'user-1');
    expect(result.isLate).toBe(true);
    expect(result.lateMinutes).toBe(35);
  });

  it('早退 → isEarlyLeave=true', async () => {
    mocks.arCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'ar-early',
      ...data,
    }));
    const result = await attendanceService.clockIn({
      employeeId: 'emp-1',
      clockType: 'wifi',
      clockInTime: `${CLOCK_DAY}T09:00:00.000Z`,
      clockOutTime: `${CLOCK_DAY}T17:00:00.000Z`,
      wifiSsid: 'Office-WiFi-XACH',
    }, 'user-1');
    expect(result.isEarlyLeave).toBe(true);
  });
});

describe('submitManualClock', () => {
  it('正常路径：补卡申请 + 审批流', async () => {
    mocks.arCount.mockResolvedValue(1);
    mocks.arFindUnique.mockResolvedValue({
      id: 'ar-manual',
      status: 'pending',
      approvalInstanceId: 'instance-1',
    });

    const result = await attendanceService.submitManualClock({
      employeeId: 'emp-1',
      clockInTime: '2026-08-25T09:00:00.000Z',
      clockType: 'manual',
      manualReason: '因外出办事忘记上午打卡需要补卡',
    }, 'user-1');

    expect(result?.status).toBe('pending');
    expect(mocks.submitApproval).toHaveBeenCalled();
  });

  it('当月补卡 >= 3 → 71909', async () => {
    mocks.arCount.mockResolvedValue(3);
    await expect(attendanceService.submitManualClock({
      employeeId: 'emp-1',
      clockInTime: '2026-08-25T09:00:00.000Z',
      clockType: 'manual',
      manualReason: '因外出办事忘记上午打卡需要补卡',
    }, 'user-1')).rejects.toMatchObject({ code: 71909 });
  });

  it('manualReason 太短 → 验证失败', async () => {
    await expect(attendanceService.submitManualClock({
      employeeId: 'emp-1',
      clockInTime: '2026-08-25T09:00:00.000Z',
      clockType: 'manual',
      manualReason: '忘',
    }, 'user-1')).rejects.toMatchObject({ code: 71906 });
  });
});

describe('confirmManualClock', () => {
  const pendingRecord = {
    id: 'ar-1',
    employeeId: 'emp-1',
    status: 'pending',
    clockInTime: new Date('2026-08-25T09:00:00.000Z'),
    clockOutTime: null,
  };

  it('approved → 重新跑异常判定 + 通知', async () => {
    mocks.arFindUnique.mockResolvedValue(pendingRecord);
    mocks.empFindFirst.mockResolvedValue({
      id: 'emp-1', name: 'HR 专员', userId: 'u-1', deletedAt: null,
    });

    const result = await attendanceService.confirmManualClock(
      'ar-1',
      { approved: true },
      'user-hr',
    );
    expect(result.status).toBe('approved');
    expect(mocks.sendNotification).toHaveBeenCalled();
  });

  it('rejected → 状态 rejected + 通知', async () => {
    mocks.arFindUnique.mockResolvedValue(pendingRecord);
    mocks.empFindFirst.mockResolvedValue({
      id: 'emp-1', name: 'HR 专员', userId: 'u-1', deletedAt: null,
    });
    mocks.arUpdate.mockResolvedValue({ id: 'ar-1', status: 'rejected' });

    const result = await attendanceService.confirmManualClock(
      'ar-1',
      { approved: false },
      'user-hr',
    );
    expect(result.status).toBe('rejected');
  });

  it('非 pending 状态 → 71908', async () => {
    mocks.arFindUnique.mockResolvedValue({ id: 'ar-1', status: 'approved' });
    await expect(attendanceService.confirmManualClock(
      'ar-1',
      { approved: true },
      'user-1',
    )).rejects.toMatchObject({ code: 71908 });
  });
});

describe('importAttendance', () => {
  const makeFile = (lines: string[]) => Buffer.from(
    ['DELI-E-PLUS-V1', ...lines].join('\n'),
    'utf-8',
  ).toString('base64');

  it('正常路径：3 行数据，3 条记录', async () => {
    mocks.empFindFirst.mockResolvedValue(employee);
    mocks.arCreateMany.mockResolvedValue({ count: 3 });

    const result = await attendanceService.importAttendance({
      fileContent: makeFile([
        'HR 专员,2026-08-30T09:00:00.000Z,in,deli-1',
        'HR 专员,2026-08-30T18:00:00.000Z,out,deli-2',
        'HR 专员,2026-08-31T09:00:00.000Z,in,deli-3',
      ]),
      format: 'deli-e-plus-v1',
    }, 'user-hr');

    expect(result.imported).toBe(3);
    expect(result.skipped).toBe(0);
    expect(mocks.sendNotification).toHaveBeenCalled();
  });

  it('格式不在白名单 → 71907', async () => {
    await expect(attendanceService.importAttendance({
      fileContent: makeFile([]),
      format: 'unknown',
    }, 'user-hr')).rejects.toMatchObject({ code: 71907 });
  });

  it('部分员工找不到 → 写入 errors 不抛错', async () => {
    mocks.empFindFirst
      .mockResolvedValueOnce(employee)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(employee)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(employee);
    mocks.arCreateMany.mockResolvedValue({ count: 3 });

    const result = await attendanceService.importAttendance({
      fileContent: makeFile([
        'HR 专员,2026-08-30T09:00:00.000Z,in,d1',
        '不存在,2026-08-30T09:00:00.000Z,in,d2',
        'HR 专员,2026-08-31T09:00:00.000Z,in,d3',
        '未知,2026-08-31T09:00:00.000Z,in,d4',
        'HR 专员,2026-09-01T09:00:00.000Z,in,d5',
      ]),
      format: 'deli-e-plus-v1',
    }, 'user-hr');

    expect(result.imported).toBe(3);
    expect(result.errors.length).toBe(2);
  });
});

describe('calculateAnomaly', () => {
  it('正常打卡 → 无异常', async () => {
    const result = await attendanceService.calculateAnomaly(
      new Date('2026-08-30T09:00:00.000Z'),
      new Date('2026-08-30T18:00:00.000Z'),
      { startTime: '09:00', endTime: '18:00' },
    );
    expect(result.isLate).toBe(false);
    expect(result.isEarlyLeave).toBe(false);
    expect(result.isMissing).toBe(false);
  });

  it('仅 clockIn 无 clockOut → isMissing=true', async () => {
    const result = await attendanceService.calculateAnomaly(
      new Date('2026-08-30T09:00:00.000Z'),
      null,
      null,
    );
    expect(result.isMissing).toBe(true);
  });
});

describe('haversineDistance', () => {
  it('同坐标距离 = 0', () => {
    const d = attendanceService.haversineDistance(39.9, 116.4, 39.9, 116.4);
    expect(d).toBe(0);
  });

  it('1 公里距离 ≈ 1000 米', () => {
    const d = attendanceService.haversineDistance(39.9, 116.4, 39.91, 116.4);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1200);
  });
});

describe('parseDeliEPlusExcel', () => {
  it('解析 deli-e-plus-v1 CSV 行', () => {
    const content = Buffer.from(
      'DELI-E-PLUS-V1\nHR 专员,2026-08-30T09:00:00.000Z,in,ext-1',
      'utf-8',
    ).toString('base64');
    const rows = attendanceService.parseDeliEPlusExcel(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.employeeName).toBe('HR 专员');
  });
});
