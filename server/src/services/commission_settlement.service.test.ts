// M4-C6: commission_settlement.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  settlementFindFirst: vi.fn(),
  settlementFindUnique: vi.fn(),
  settlementFindMany: vi.fn(),
  settlementCount: vi.fn(),
  settlementCreate: vi.fn(),
  settlementUpdate: vi.fn(),
  commissionFindMany: vi.fn(),
  commissionCount: vi.fn(),
  payslipItemCreate: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    commissionSettlement: {
      findFirst: mocks.settlementFindFirst,
      findUnique: mocks.settlementFindUnique,
      findMany: mocks.settlementFindMany,
      count: mocks.settlementCount,
      create: mocks.settlementCreate,
      update: mocks.settlementUpdate,
    },
    performanceSalesCommission: {
      findMany: mocks.commissionFindMany,
      count: mocks.commissionCount,
    },
    payslipItem: { create: mocks.payslipItemCreate },
    $transaction: mocks.transaction,
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as settlement from './commission_settlement.service';

const ACTOR = 'hr-1';

const PAID = [
  {
    id: 'c1', employeeId: 'e1', productId: 'p1', finalAmount: 5000,
  },
  {
    id: 'c2', employeeId: 'e1', productId: 'p2', finalAmount: 6400,
  },
];

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    year: 2026,
    quarter: 1,
    status: 'pending_confirm',
    totalAmount: 11400,
    recordCount: 2,
    employeeCount: 1,
    productCount: 2,
    periodStart: new Date('2026-01-01T00:00:00.000Z'),
    periodEnd: new Date('2026-03-31T00:00:00.000Z'),
    createdBy: ACTOR,
    createdAt: new Date('2026-03-14T00:00:00.000Z'),
    remark: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date('2026-03-15T00:00:00.000Z') });
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    if (key === 'commission.settlement.fiscal_quarter_start') return 1;
    if (key === 'commission.settlement.confirm_window_days') return 7;
    if (key === 'commission.settlement.max_adjustment_ratio') return 0.5;
    if (key === 'commission.settlement.mock_mode') return true;
    return true;
  });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
    commissionSettlement: {
      create: mocks.settlementCreate,
      update: mocks.settlementUpdate,
    },
  }));
  mocks.settlementFindFirst.mockResolvedValue(null);
  mocks.commissionFindMany.mockResolvedValue(PAID);
  mocks.settlementCreate.mockResolvedValue(draftRow());
  mocks.settlementUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...draftRow(),
    ...data,
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('commission_settlement.service', () => {
  describe('createSettlement', () => {
    it('创建 Q1 2026 季度结算单成功（默认 pending_confirm）', async () => {
      const rec = await settlement.createSettlement(ACTOR, { year: 2026, quarter: 1 });
      expect(mocks.settlementCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            year: 2026,
            quarter: 1,
            status: 'pending_confirm',
            totalAmount: 11400,
            recordCount: 2,
            employeeCount: 1,
            productCount: 2,
          }),
        }),
      );
      expect(rec.status).toBe('pending_confirm');
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'COMMISSION_SETTLEMENT_CREATE' }),
      );
    });

    it('创建时 initialStatus=draft 成功', async () => {
      mocks.settlementCreate.mockResolvedValue(draftRow({ status: 'draft' }));
      await settlement.createSettlement(ACTOR, {
        year: 2026, quarter: 1, initialStatus: 'draft',
      });
      expect(mocks.settlementCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'draft' }),
        }),
      );
    });

    it('quarter 不在 1-4 抛 73605', async () => {
      await expect(settlement.createSettlement(ACTOR, { year: 2026, quarter: 5 as 1 }))
        .rejects.toMatchObject({ statusCode: 400, code: 73605 });
    });

    it('季度内无 paid commissions 抛 73606', async () => {
      mocks.commissionFindMany.mockResolvedValue([]);
      await expect(settlement.createSettlement(ACTOR, { year: 2026, quarter: 1 }))
        .rejects.toMatchObject({ statusCode: 400, code: 73606 });
    });

    it('同一 (year, quarter) 已存在 draft settlement 抛 73607', async () => {
      mocks.settlementFindFirst.mockResolvedValue(draftRow({ status: 'draft' }));
      await expect(settlement.createSettlement(ACTOR, { year: 2026, quarter: 1 }))
        .rejects.toMatchObject({ statusCode: 400, code: 73607 });
    });

    it('汇总 totalAmount / recordCount 且 periodStart/periodEnd 按自然年 Q1', async () => {
      await settlement.createSettlement(ACTOR, { year: 2026, quarter: 1 });
      const { data } = mocks.settlementCreate.mock.calls[0][0];
      expect(data.totalAmount).toBe(11400);
      expect(data.recordCount).toBe(2);
      expect(data.employeeCount).toBe(1);
      expect(data.productCount).toBe(2);
      expect(data.periodStart.toISOString().startsWith('2026-01-01')).toBe(true);
      expect(data.periodEnd.toISOString().startsWith('2026-03-31')).toBe(true);
    });
  });

  describe('listSettlements', () => {
    it('按 year + status 过滤列表', async () => {
      mocks.settlementFindMany.mockResolvedValue([draftRow()]);
      mocks.settlementCount.mockResolvedValue(1);
      const r = await settlement.listSettlements(ACTOR, {
        year: 2026,
        status: 'draft',
        page: 1,
        pageSize: 10,
      });
      expect(r.total).toBe(1);
      expect(r.page).toBe(1);
      expect(r.pageSize).toBe(10);
      expect(mocks.settlementFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { year: 2026, status: 'draft' },
        }),
      );
    });
  });

  describe('getSettlement', () => {
    it('详情查询（含关联 commissions 数量）', async () => {
      mocks.settlementFindUnique.mockResolvedValue(draftRow());
      mocks.commissionCount.mockResolvedValue(2);
      const r = await settlement.getSettlement(ACTOR, 's1');
      expect(r.commissionCount).toBe(2);
    });

    it('settlement 不存在抛 73602', async () => {
      mocks.settlementFindUnique.mockResolvedValue(null);
      await expect(settlement.getSettlement(ACTOR, 'missing'))
        .rejects.toMatchObject({ statusCode: 404, code: 73602 });
    });
  });

  describe('confirmSettlement', () => {
    it('pending_confirm → confirmed 成功（audit mockMode: true，不写 payslip_items）', async () => {
      mocks.settlementFindUnique.mockResolvedValue(draftRow());
      const rec = await settlement.confirmSettlement(ACTOR, 's1');
      expect(rec.status).toBe('confirmed');
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COMMISSION_SETTLEMENT_CONFIRM',
          newValue: expect.objectContaining({ mockMode: true }),
        }),
      );
      expect(mocks.payslipItemCreate).not.toHaveBeenCalled();
    });

    it('已 confirmed 抛 73603', async () => {
      mocks.settlementFindUnique.mockResolvedValue(draftRow({ status: 'confirmed' }));
      await expect(settlement.confirmSettlement(ACTOR, 's1'))
        .rejects.toMatchObject({ statusCode: 400, code: 73603 });
    });

    it('超 confirm_window（默认 7 天）抛 73609', async () => {
      mocks.settlementFindUnique.mockResolvedValue(draftRow({
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      }));
      await expect(settlement.confirmSettlement(ACTOR, 's1'))
        .rejects.toMatchObject({ statusCode: 400, code: 73609 });
    });
  });

  describe('cancelSettlement', () => {
    it('draft → cancelled 成功', async () => {
      mocks.settlementFindUnique.mockResolvedValue(draftRow({ status: 'draft' }));
      const rec = await settlement.cancelSettlement(ACTOR, 's1', { reason: '数据有误' });
      expect(rec.status).toBe('cancelled');
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'COMMISSION_SETTLEMENT_CANCEL' }),
      );
    });

    it('已 confirmed 抛 73608', async () => {
      mocks.settlementFindUnique.mockResolvedValue(draftRow({ status: 'confirmed' }));
      await expect(settlement.cancelSettlement(ACTOR, 's1', { reason: 'no' }))
        .rejects.toMatchObject({ statusCode: 400, code: 73608 });
    });
  });
});
