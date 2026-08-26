// M2-B5: business_trip.service 单元测试 | HRMS
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
  posHistoryFindFirst: vi.fn(),
  btFindUnique: vi.fn(),
  btFindMany: vi.fn(),
  btCreate: vi.fn(),
  btUpdate: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  sendNotification: vi.fn(),
  submitApproval: vi.fn(),
  withdraw: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: { findFirst: mocks.empFindFirst },
    employeePositionHistory: { findFirst: mocks.posHistoryFindFirst },
    businessTrip: {
      findUnique: mocks.btFindUnique,
      findMany: mocks.btFindMany,
      create: mocks.btCreate,
      update: mocks.btUpdate,
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

import * as tripService from './business_trip.service';

const employee = {
  id: 'emp-1',
  name: '张三',
  companyId: 'co-1',
  departmentId: 'dept-1',
  userId: 'u-1',
  position: '工程师',
  status: 'active',
  deletedAt: null,
};

const TRIP_START = '2026-09-08';
const TRIP_END_3 = '2026-09-10';
const TRIP_END_5 = '2026-09-14';

let lastRecord: Record<string, unknown> = {};

function defaultConfig(_cat: string, key: string): unknown {
  const map: Record<string, unknown> = {
    allowance_standard: 200,
    city_tier_rates: { tier1: 1.5, tier2: 1.2, tier3: 1.0 },
    level_tier_rates: { executive: 1.5, manager: 1.2, employee: 1.0 },
    city_tier_mapping: {
      北京: 'tier1', 上海: 'tier1', 深圳: 'tier1', 广州: 'tier1', 成都: 'tier2',
    },
    approval_flow_key: 'trip:trip_approval',
    min_advance_days: 3,
    weekend_inclusive: false,
  };
  return map[key] ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  lastRecord = {};
  mocks.getValue.mockImplementation(defaultConfig);
  mocks.empFindFirst.mockResolvedValue(employee);
  mocks.posHistoryFindFirst.mockResolvedValue({ toPosition: '工程师' });
  mocks.btFindMany.mockResolvedValue([]);
  mocks.btCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    lastRecord = { id: 'bt-new', status: 'draft', ...data };
    return lastRecord;
  });
  mocks.btUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    lastRecord = { ...lastRecord, ...data };
    return lastRecord;
  });
  mocks.auditLog.mockResolvedValue(undefined);
});

describe('createBusinessTrip', () => {
  it('正常路径：北京出差 3 天 + 补助 200 * 1.5 * 1.0 * 3 = 900', async () => {
    const result = await tripService.createBusinessTrip({
      employeeId: 'emp-1',
      destination: '北京',
      startDate: TRIP_START,
      endDate: TRIP_END_3,
      reason: '客户拜访',
    }, 'user-1');

    expect(result.status).toBe('submitted');
    expect(Number(result.allowanceAmount)).toBe(900);
    expect(result.cityTier).toBe('tier1');
    expect(mocks.submitApproval).toHaveBeenCalled();
  });

  it('三线城市（成都）出差 5 天 + 补助 200 * 1.2 * 1.0 * 5 = 1200', async () => {
    const result = await tripService.createBusinessTrip({
      employeeId: 'emp-1',
      destination: '成都',
      startDate: TRIP_START,
      endDate: TRIP_END_5,
      reason: '项目支持',
    }, 'user-1');

    expect(Number(result.allowanceAmount)).toBe(1200);
    expect(result.cityTier).toBe('tier2');
  });

  it('destination 不在映射 → 72206', async () => {
    await expect(tripService.createBusinessTrip({
      employeeId: 'emp-1',
      destination: '某未知城市',
      startDate: TRIP_START,
      endDate: TRIP_END_3,
      reason: 'test',
    }, 'user-1')).rejects.toMatchObject({ code: 72206 });
  });

  it('destination 必填且非空 → 72210', async () => {
    await expect(tripService.createBusinessTrip({
      employeeId: 'emp-1',
      destination: '   ',
      startDate: TRIP_START,
      endDate: TRIP_END_3,
      reason: 'test',
    }, 'user-1')).rejects.toMatchObject({ code: 72210 });
  });

  it('startDate >= endDate → 72202', async () => {
    await expect(tripService.createBusinessTrip({
      employeeId: 'emp-1',
      destination: '北京',
      startDate: TRIP_END_3,
      endDate: TRIP_START,
      reason: 'test',
    }, 'user-1')).rejects.toMatchObject({ code: 72202 });
  });

  it('未提前 3 天申请 → 72203', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await expect(tripService.createBusinessTrip({
      employeeId: 'emp-1',
      destination: '北京',
      startDate: tomorrow,
      endDate: dayAfter,
      reason: 'test',
    }, 'user-1')).rejects.toMatchObject({ code: 72203 });
  });

  it('出差区间重叠 → 72208', async () => {
    mocks.btFindMany.mockResolvedValue([
      { id: 'bt-existing', startDate: TRIP_START, endDate: TRIP_END_5 },
    ]);
    await expect(tripService.createBusinessTrip({
      employeeId: 'emp-1',
      destination: '北京',
      startDate: '2026-09-10',
      endDate: '2026-09-18',
      reason: 'test',
    }, 'user-1')).rejects.toMatchObject({ code: 72208 });
  });
});

describe('cancelBusinessTrip', () => {
  it('draft 直接取消', async () => {
    mocks.btFindUnique.mockResolvedValue({ id: 'bt-1', status: 'draft' });
    mocks.btUpdate.mockResolvedValue({ id: 'bt-1', status: 'cancelled' });
    const result = await tripService.cancelBusinessTrip('bt-1', '撤回', 'user-1');
    expect(result.status).toBe('cancelled');
  });

  it('submitted 调 approval.withdraw', async () => {
    mocks.btFindUnique.mockResolvedValue({
      id: 'bt-1', status: 'submitted', approvalInstanceId: 'i-1',
    });
    mocks.btUpdate.mockResolvedValue({ id: 'bt-1', status: 'cancelled' });
    await tripService.cancelBusinessTrip('bt-1', '撤回', 'user-1');
    expect(mocks.withdraw).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'i-1' }),
    );
  });

  it('approved 状态 → 72205', async () => {
    mocks.btFindUnique.mockResolvedValue({ id: 'bt-1', status: 'approved' });
    await expect(tripService.cancelBusinessTrip('bt-1', '原因', 'user-1'))
      .rejects.toMatchObject({ code: 72205 });
  });
});

describe('confirmBusinessTrip', () => {
  it('approved → 通知 + 审计', async () => {
    mocks.btFindUnique.mockResolvedValue({
      id: 'bt-1', status: 'submitted', employeeId: 'emp-1', destination: '北京',
    });
    mocks.btUpdate.mockResolvedValue({ id: 'bt-1', status: 'approved' });
    const result = await tripService.confirmBusinessTrip('bt-1', { approved: true }, 'user-1');
    expect(result.status).toBe('approved');
    expect(mocks.sendNotification).toHaveBeenCalled();
  });

  it('rejected → 状态 rejected + 通知', async () => {
    mocks.btFindUnique.mockResolvedValue({
      id: 'bt-1', status: 'submitted', employeeId: 'emp-1', destination: '北京',
    });
    mocks.btUpdate.mockResolvedValue({ id: 'bt-1', status: 'rejected' });
    const result = await tripService.confirmBusinessTrip('bt-1', { approved: false }, 'user-1');
    expect(result.status).toBe('rejected');
  });

  it('非 submitted 状态 → 72204', async () => {
    mocks.btFindUnique.mockResolvedValue({ id: 'bt-1', status: 'approved' });
    await expect(tripService.confirmBusinessTrip('bt-1', { approved: true }, 'user-1'))
      .rejects.toMatchObject({ code: 72204 });
  });
});

describe('calculateTravelAllowance', () => {
  it('北京 + tier1 + 普通员工 + 3 天 → 200 * 1.5 * 1.0 * 3 = 900', async () => {
    mocks.getValue.mockImplementation(async (_cat: string, key: string) => {
      const map: Record<string, unknown> = {
        allowance_standard: 200,
        city_tier_mapping: { 北京: 'tier1' },
        city_tier_rates: { tier1: 1.5, tier2: 1.2, tier3: 1.0 },
        level_tier_rates: { executive: 1.5, manager: 1.2, employee: 1.0 },
      };
      return map[key] ?? null;
    });
    const result = await tripService.calculateTravelAllowance('emp-1', '北京', 3);
    expect(result.allowanceAmount).toBe(900);
    expect(result.cityTier).toBe('tier1');
  });

  it('上海 + tier1 + 经理 + 2 天 → 200 * 1.5 * 1.2 * 2 = 720', async () => {
    mocks.posHistoryFindFirst.mockResolvedValue({ toPosition: '部门经理' });
    mocks.getValue.mockImplementation(async (_cat: string, key: string) => {
      const map: Record<string, unknown> = {
        allowance_standard: 200,
        city_tier_mapping: { 上海: 'tier1' },
        city_tier_rates: { tier1: 1.5 },
        level_tier_rates: { manager: 1.2, employee: 1.0 },
      };
      return map[key] ?? null;
    });
    const result = await tripService.calculateTravelAllowance('emp-1', '上海', 2);
    expect(result.allowanceAmount).toBe(720);
  });

  it('destination 不在映射 → 72209', async () => {
    mocks.getValue.mockImplementation(async (_cat: string, key: string) => {
      if (key === 'allowance_standard') return 200;
      if (key === 'city_tier_mapping') return {};
      if (key === 'city_tier_rates') return { tier1: 1.5 };
      if (key === 'level_tier_rates') return { employee: 1.0 };
      return null;
    });
    await expect(tripService.calculateTravelAllowance('emp-1', '未知城市', 3))
      .rejects.toMatchObject({ code: 72209 });
  });
});

describe('calculateTripDays', () => {
  it('2026-09-10（周四）~ 2026-09-12（周六）→ 2 个工作日（排除周六）', () => {
    const days = tripService.calculateTripDays(
      new Date('2026-09-10'),
      new Date('2026-09-12'),
    );
    expect(days).toBe(2);
  });

  it('2026-09-10（周四）~ 2026-09-11（周五）→ 2 个工作日', () => {
    expect(tripService.calculateTripDays(new Date('2026-09-10'), new Date('2026-09-11'))).toBe(2);
  });

  it('2026-09-12（周六）单日 → 0 个工作日', () => {
    expect(tripService.calculateTripDays(new Date('2026-09-12'), new Date('2026-09-12'))).toBe(0);
  });
});
