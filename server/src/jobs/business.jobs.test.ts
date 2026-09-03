// M5-10: business.jobs 单元测试（日期工具 + 调度操作人解析）
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any,
   @typescript-eslint/no-unsafe-member-access */

import {
  afterEach, describe, expect, it, vi,
} from 'vitest';

import {
  CRON_PATTERNS, QUEUE_NAMES, prevQuarter, resolveSystemUserId, shiftMonth, ymdOf,
} from './business.jobs';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    user: { findUnique: mocks.userFindUnique },
  },
}));

describe('shiftMonth（YYYY-MM 月偏移）', () => {
  it('正常跨月', () => {
    expect(shiftMonth(new Date(Date.UTC(2026, 2, 15)), 1)).toBe('2026-04');
    expect(shiftMonth(new Date(Date.UTC(2026, 7, 1)), -1)).toBe('2026-07');
  });

  it('跨年正向', () => {
    expect(shiftMonth(new Date(Date.UTC(2026, 11, 25)), 1)).toBe('2027-01');
  });

  it('跨年反向', () => {
    expect(shiftMonth(new Date(Date.UTC(2026, 0, 10)), -1)).toBe('2025-12');
  });
});

describe('prevQuarter（上一季度）', () => {
  it('季中日期正确回退', () => {
    expect(prevQuarter(new Date(Date.UTC(2026, 1, 15)))).toEqual({ year: 2025, quarter: 4 });
    expect(prevQuarter(new Date(Date.UTC(2026, 5, 30)))).toEqual({ year: 2026, quarter: 1 });
    expect(prevQuarter(new Date(Date.UTC(2026, 8, 1)))).toEqual({ year: 2026, quarter: 2 });
    expect(prevQuarter(new Date(Date.UTC(2026, 10, 20)))).toEqual({ year: 2026, quarter: 3 });
  });

  it('跨年边界', () => {
    expect(prevQuarter(new Date(Date.UTC(2026, 0, 5)))).toEqual({ year: 2025, quarter: 4 });
  });
});

describe('ymdOf（YYYY-MM-DD）', () => {
  it('补零正确', () => {
    expect(ymdOf(new Date(Date.UTC(2026, 0, 9)))).toBe('2026-01-09');
    expect(ymdOf(new Date(Date.UTC(2026, 11, 31)))).toBe('2026-12-31');
  });
});

describe('resolveSystemUserId', () => {
  afterEach(() => vi.clearAllMocks());

  it('system 账号存在 → 返回 system id', async () => {
    mocks.userFindUnique.mockResolvedValueOnce({ id: 'sys-id' });
    await expect(resolveSystemUserId()).resolves.toBe('sys-id');
  });

  it('system 缺失 → fallback admin', async () => {
    mocks.userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'admin-id' });
    await expect(resolveSystemUserId()).resolves.toBe('admin-id');
  });

  it('两者皆无 → 抛 500', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    await expect(resolveSystemUserId()).rejects.toMatchObject({ code: 99999 });
  });
});

describe('调度常量完整性', () => {
  it('5 个任务：queue 名 / cron / 全量对齐', () => {
    expect(Object.keys(QUEUE_NAMES)).toHaveLength(5);
    expect(CRON_PATTERNS.PAYROLL_MONTHLY).toBe('0 5 25 * *'); // 每月 25 日
    expect(CRON_PATTERNS.COST_ALERT_DAILY).toBe('0 2 * * *'); // 每日 02:00（V1.2 约定）
  });
});
