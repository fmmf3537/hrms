// M2-B1: shift.service 单元测试 | HRMS
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  companyFindUnique: vi.fn(),
  empFindFirst: vi.fn(),
  deptFindUnique: vi.fn(),
  stFindFirst: vi.fn(),
  stFindUnique: vi.fn(),
  stFindMany: vi.fn(),
  stCount: vi.fn(),
  stCreate: vi.fn(),
  stUpdate: vi.fn(),
  saFindFirst: vi.fn(),
  saFindMany: vi.fn(),
  saCreateMany: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    company: { findUnique: mocks.companyFindUnique },
    employee: { findFirst: mocks.empFindFirst },
    department: { findUnique: mocks.deptFindUnique },
    shiftTemplate: {
      findFirst: mocks.stFindFirst,
      findUnique: mocks.stFindUnique,
      findMany: mocks.stFindMany,
      count: mocks.stCount,
      create: mocks.stCreate,
      update: mocks.stUpdate,
    },
    shiftAssignment: {
      findFirst: mocks.saFindFirst,
      findMany: mocks.saFindMany,
      createMany: mocks.saCreateMany,
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

import { Decimal } from '@prisma/client/runtime/library';

import * as shiftService from './shift.service';

const baseInput = {
  code: 'STD-DAY',
  name: '标准白班',
  shiftType: 'standard',
  startTime: '09:00',
  endTime: '18:00',
  breakStart: '12:00',
  breakEnd: '13:30',
  workHours: 8.0,
  flexMinutes: 30,
  effectiveFrom: '2026-09-01',
  companyId: 'co-1',
};

const activeShift = {
  id: 'sh-1',
  code: 'STD-DAY',
  name: '标准白班',
  shiftType: 'standard',
  startTime: '09:00',
  endTime: '18:00',
  status: 'active',
  flexMinutes: 30,
  companyId: 'co-1',
  effectiveFrom: new Date('2026-09-01'),
  effectiveTo: null,
  breakStart: '12:00',
  breakEnd: '13:30',
  breakDuration: 90,
  workHours: new Decimal(8),
  createdBy: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
  archivedBy: null,
  description: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_cat: string, key: string) => {
    const map: Record<string, unknown> = {
      types: ['standard', 'comprehensive', 'flexible'],
      max_consecutive_days: 6,
      min_rest_hours: 12,
      break_duration: 90,
      flex_minutes: 30,
      default_work_hours: 8,
      assignment_strategy: 'department',
      late_threshold: 30,
      early_leave_threshold: 30,
    };
    return map[key] ?? null;
  });
  mocks.companyFindUnique.mockResolvedValue({ id: 'co-1', code: 'XACH', name: '辰航卓越' });
  mocks.stFindFirst.mockResolvedValue(null);
  mocks.stFindUnique.mockResolvedValue(null);
  mocks.saFindFirst.mockResolvedValue(null);
  mocks.saFindMany.mockResolvedValue([]);
  mocks.auditLog.mockResolvedValue(undefined);
});

describe('createShift', () => {
  it('正常路径：标准白班 + 完整字段 + 审计', async () => {
    mocks.stCreate.mockResolvedValue({
      id: 'sh-new',
      status: 'draft',
      ...baseInput,
      effectiveFrom: new Date('2026-09-01'),
      workHours: new Decimal(8),
    });

    const result = await shiftService.createShift(baseInput, 'user-1');

    expect(result.status).toBe('draft');
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'ShiftTemplate',
        resourceId: 'sh-new',
      }),
    );
  });

  it('code 重复 → 71802', async () => {
    mocks.stFindFirst.mockResolvedValue({ id: 'sh-existing' });
    await expect(shiftService.createShift(baseInput, 'user-1'))
      .rejects.toMatchObject({ code: 71802 });
  });

  it('shiftType 非法 → 71810', async () => {
    await expect(shiftService.createShift({
      ...baseInput,
      shiftType: 'invalid',
    }, 'user-1')).rejects.toMatchObject({ code: 71810 });
  });

  it('startTime >= endTime → 71803', async () => {
    await expect(shiftService.createShift({
      ...baseInput,
      startTime: '18:00',
      endTime: '09:00',
    }, 'user-1')).rejects.toMatchObject({ code: 71803 });
  });

  it('午休时间在工作范围外 → 71804', async () => {
    await expect(shiftService.createShift({
      ...baseInput,
      breakStart: '08:00',
      breakEnd: '08:30',
    }, 'user-1')).rejects.toMatchObject({ code: 71804 });
  });

  it('flexMinutes > 60 → 71805', async () => {
    await expect(shiftService.createShift({
      ...baseInput,
      flexMinutes: 90,
    }, 'user-1')).rejects.toMatchObject({ code: 71805 });
  });

  it('effectiveFrom > effectiveTo → 71806', async () => {
    await expect(shiftService.createShift({
      ...baseInput,
      effectiveFrom: '2026-12-31',
      effectiveTo: '2026-01-01',
    }, 'user-1')).rejects.toMatchObject({ code: 71806 });
  });
});

describe('archiveShift', () => {
  it('存在 active assignment → 71807', async () => {
    mocks.stFindUnique.mockResolvedValue({ id: 'sh-1', status: 'active', code: 'STD' });
    mocks.saFindFirst.mockResolvedValue({ id: 'as-1', effectiveTo: null });
    await expect(shiftService.archiveShift('sh-1', 'user-1'))
      .rejects.toMatchObject({ code: 71807 });
  });

  it('无 active assignment → archived + 审计', async () => {
    mocks.stFindUnique.mockResolvedValue({ id: 'sh-1', status: 'active', code: 'STD' });
    mocks.saFindFirst.mockResolvedValue(null);
    mocks.stUpdate.mockResolvedValue({ id: 'sh-1', status: 'archived', code: 'STD' });
    const result = await shiftService.archiveShift('sh-1', 'user-1');
    expect(result.status).toBe('archived');
    expect(mocks.auditLog).toHaveBeenCalled();
  });
});

describe('assignShifts', () => {
  it('正常路径：3 个员工批量排班 + 通知 + 审计', async () => {
    mocks.stFindUnique.mockResolvedValue(activeShift);
    mocks.empFindFirst.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      name: `员工${where.id}`,
      userId: `u-${where.id}`,
      deletedAt: null,
    }));
    mocks.saCreateMany.mockResolvedValue({ count: 3 });

    const result = await shiftService.assignShifts({
      shiftId: 'sh-1',
      assigneeType: 'employee',
      employeeIds: ['emp-1', 'emp-2', 'emp-3'],
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-09-06',
    }, 'user-1');

    expect(result.created).toBe(3);
    expect(result.conflicts).toEqual([]);
    expect(mocks.sendNotification).toHaveBeenCalled();
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ASSIGN' }),
    );
  });

  it('employee 和 department 同时传 → 71810', async () => {
    mocks.stFindUnique.mockResolvedValue(activeShift);
    await expect(shiftService.assignShifts({
      shiftId: 'sh-1',
      assigneeType: 'employee',
      employeeIds: ['emp-1'],
      departmentIds: ['dept-1'],
      effectiveFrom: '2026-09-01',
    }, 'user-1')).rejects.toMatchObject({ code: 71810 });
  });

  it('员工不存在 → 71201', async () => {
    mocks.stFindUnique.mockResolvedValue(activeShift);
    mocks.empFindFirst.mockResolvedValue(null);
    await expect(shiftService.assignShifts({
      shiftId: 'sh-1',
      assigneeType: 'employee',
      employeeIds: ['emp-x'],
      effectiveFrom: '2026-09-01',
    }, 'user-1')).rejects.toMatchObject({ code: 71201 });
  });

  it('排班冲突：连续工作 > 6 天 → 71809', async () => {
    mocks.stFindUnique.mockResolvedValue(activeShift);
    mocks.empFindFirst.mockResolvedValue({
      id: 'emp-1', name: '张三', userId: 'u-1', deletedAt: null,
    });
    mocks.saFindMany.mockResolvedValue([
      {
        employeeId: 'emp-1',
        effectiveFrom: new Date('2026-08-25'),
        effectiveTo: new Date('2026-08-31'),
        shift: { startTime: '09:00', endTime: '18:00' },
      },
    ]);

    await expect(shiftService.assignShifts({
      shiftId: 'sh-1',
      assigneeType: 'employee',
      employeeIds: ['emp-1'],
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-09-05',
    }, 'user-1')).rejects.toMatchObject({ code: 71809 });
  });

  it('同员工同日期范围已有 assignment → 71808', async () => {
    mocks.stFindUnique.mockResolvedValue(activeShift);
    mocks.empFindFirst.mockResolvedValue({
      id: 'emp-1', name: '张三', deletedAt: null,
    });
    mocks.saFindFirst.mockResolvedValue({
      id: 'as-existing',
      employeeId: 'emp-1',
      effectiveFrom: new Date('2026-09-01'),
      effectiveTo: new Date('2026-09-30'),
    });
    await expect(shiftService.assignShifts({
      shiftId: 'sh-1',
      assigneeType: 'employee',
      employeeIds: ['emp-1'],
      effectiveFrom: '2026-09-15',
    }, 'user-1')).rejects.toMatchObject({ code: 71808 });
  });
});

describe('validateShiftAssignmentConflict', () => {
  it('无冲突 → 返回空数组', async () => {
    mocks.stFindUnique.mockResolvedValue(activeShift);
    mocks.saFindMany.mockResolvedValue([]);
    const conflicts = await shiftService.validateShiftAssignmentConflict(
      'emp-1',
      'sh-1',
      new Date('2026-09-01'),
      new Date('2026-09-06'),
    );
    expect(conflicts).toEqual([]);
  });

  it('连续工作 > 6 天 → 返回冲突', async () => {
    mocks.stFindUnique.mockResolvedValue(activeShift);
    mocks.saFindMany.mockResolvedValue([
      {
        effectiveFrom: new Date('2026-08-25'),
        effectiveTo: new Date('2026-08-31'),
        shift: { startTime: '09:00', endTime: '18:00' },
      },
    ]);
    const conflicts = await shiftService.validateShiftAssignmentConflict(
      'emp-1',
      'sh-1',
      new Date('2026-09-01'),
      new Date('2026-09-05'),
    );
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.some((c) => c.code === 71809)).toBe(true);
  });

  it('单次排班跨度 > 6 天 → 返回冲突', async () => {
    mocks.stFindUnique.mockResolvedValue(activeShift);
    mocks.saFindMany.mockResolvedValue([]);
    const conflicts = await shiftService.validateShiftAssignmentConflict(
      'emp-1',
      'sh-1',
      new Date('2026-09-01'),
      new Date('2026-09-10'),
    );
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0]?.code).toBe(71809);
  });
});
