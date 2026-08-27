// M3-D5: performance_sales_commission.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import { Decimal } from '@prisma/client/runtime/library';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  paymentFindUnique: vi.fn(),
  commissionFindUnique: vi.fn(),
  commissionCreate: vi.fn(),
  commissionUpdate: vi.fn(),
  commissionFindMany: vi.fn(),
  commissionCount: vi.fn(),
  userFindUnique: vi.fn(),
  employeeFindFirst: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    performanceSalesPayment: { findUnique: mocks.paymentFindUnique },
    performanceSalesCommission: {
      findUnique: mocks.commissionFindUnique,
      create: mocks.commissionCreate,
      update: mocks.commissionUpdate,
      findMany: mocks.commissionFindMany,
      count: mocks.commissionCount,
    },
    user: { findUnique: mocks.userFindUnique },
    employee: { findFirst: mocks.employeeFindFirst },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as commissionService from './performance_sales_commission.service';

function confirmedPayment(amount: number, baseRate: number) {
  return {
    id: 'pay-1',
    status: 'confirmed',
    employeeId: 'emp-1',
    productId: 'prod-1',
    amount: new Decimal(amount),
    period: '2026-09',
    product: { id: 'prod-1', baseRate: new Decimal(baseRate) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'sales.commission.calculation_strategy': 'auto_on_confirm',
      'sales.commission.target_period': 'monthly',
      'sales.commission.batch_size': 200,
      'sales.commission.target_completion_bonus': { threshold: 1.2, bonus_rate: 0.2 },
    };
    return map[key] ?? null;
  });
  mocks.commissionFindUnique.mockResolvedValue(null);
  mocks.commissionCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'comm-1',
    ...data,
  }));
  mocks.commissionUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'comm-1',
    ...data,
  }));
  mocks.userFindUnique.mockResolvedValue({
    userRoles: [{ role: { code: 'hr' } }],
  });
});

describe('performance_sales_commission.service', () => {
  describe('calculateCommission', () => {
    it('payment amount=100000 + product baseRate=0.05 → finalAmount=5000', async () => {
      mocks.paymentFindUnique.mockResolvedValue(confirmedPayment(100000, 0.05));
      const result = await commissionService.calculateCommission('hr-1', 'pay-1');
      expect(Number(result.finalAmount)).toBe(5000);
      expect(Number(result.commissionRate)).toBe(0.05);
      expect(Number(result.targetBonusRate)).toBe(0);
      expect(result.status).toBe('calculated');
    });

    it('payment amount=80000 + product baseRate=0.08 → finalAmount=6400', async () => {
      mocks.paymentFindUnique.mockResolvedValue(confirmedPayment(80000, 0.08));
      const result = await commissionService.calculateCommission('hr-1', 'pay-1');
      expect(Number(result.finalAmount)).toBe(6400);
    });

    it('payment.status !== confirmed 抛 72805', async () => {
      mocks.paymentFindUnique.mockResolvedValue({
        id: 'pay-1', status: 'draft', product: { baseRate: new Decimal(0.05) },
      });
      await expect(
        commissionService.calculateCommission('hr-1', 'pay-1'),
      ).rejects.toMatchObject({ code: 72805 });
    });

    it('commission 已存在抛 72808', async () => {
      mocks.paymentFindUnique.mockResolvedValue(confirmedPayment(100000, 0.05));
      mocks.commissionFindUnique.mockResolvedValue({ id: 'comm-exist' });
      await expect(
        commissionService.calculateCommission('hr-1', 'pay-1'),
      ).rejects.toMatchObject({ code: 72808 });
    });

    it('payment 不存在抛 72804', async () => {
      mocks.paymentFindUnique.mockResolvedValue(null);
      await expect(
        commissionService.calculateCommission('hr-1', 'missing'),
      ).rejects.toMatchObject({ code: 72804 });
    });
  });

  describe('payoutCommission', () => {
    it('calculated → paid 成功', async () => {
      mocks.commissionFindUnique.mockResolvedValue({
        id: 'comm-1',
        status: 'calculated',
        period: '2026-09',
        finalAmount: new Decimal(5000),
      });
      const result = await commissionService.payoutCommission('hr-1', 'comm-1');
      expect(result.status).toBe('paid');
    });

    it('已 paid 抛 400', async () => {
      mocks.commissionFindUnique.mockResolvedValue({
        id: 'comm-1', status: 'paid', period: '2026-09', finalAmount: new Decimal(5000),
      });
      await expect(
        commissionService.payoutCommission('hr-1', 'comm-1'),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('listCommissions', () => {
    it('filter period=2026-09', async () => {
      mocks.commissionFindMany.mockResolvedValue([{ id: 'comm-1', period: '2026-09' }]);
      mocks.commissionCount.mockResolvedValue(1);
      const result = await commissionService.listCommissions('hr-1', { period: '2026-09' });
      expect(result.items[0].period).toBe('2026-09');
    });

    it('filter status=paid', async () => {
      mocks.commissionFindMany.mockResolvedValue([{ id: 'comm-1', status: 'paid' }]);
      mocks.commissionCount.mockResolvedValue(1);
      const result = await commissionService.listCommissions('hr-1', { status: 'paid' });
      expect(result.items[0].status).toBe('paid');
    });

    it('period 格式错抛 72809', async () => {
      await expect(
        commissionService.listCommissions('hr-1', { period: '2026/09' }),
      ).rejects.toMatchObject({ code: 72809 });
    });

    it('目标完成率 < 1.0 抛 72810', () => {
      expect(() => commissionService.assertTargetCompletionRate(0.8)).toThrow();
      try {
        commissionService.assertTargetCompletionRate(0.8);
      } catch (err: any) {
        expect(err.code).toBe(72810);
      }
    });
  });
});
