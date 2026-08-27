// M3-D5: performance_sales_payment.service 单元测试
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
  productFindUnique: vi.fn(),
  employeeFindFirst: vi.fn(),
  paymentFindUnique: vi.fn(),
  paymentCreate: vi.fn(),
  paymentUpdate: vi.fn(),
  paymentFindMany: vi.fn(),
  paymentCount: vi.fn(),
  commissionFindUnique: vi.fn(),
  commissionCreate: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    performanceSalesProduct: { findUnique: mocks.productFindUnique },
    employee: { findFirst: mocks.employeeFindFirst },
    performanceSalesPayment: {
      findUnique: mocks.paymentFindUnique,
      create: mocks.paymentCreate,
      update: mocks.paymentUpdate,
      findMany: mocks.paymentFindMany,
      count: mocks.paymentCount,
    },
    performanceSalesCommission: {
      findUnique: mocks.commissionFindUnique,
      create: mocks.commissionCreate,
    },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as paymentService from './performance_sales_payment.service';

const activeProduct = {
  id: 'prod-1', code: 'UAV-01', category: 'product', baseRate: new Decimal(0.05), status: 'active',
};
const activeEmployee = { id: 'emp-1', status: 'active', deletedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'sales.payment.auto_confirm': false,
      'sales.commission.payment_lock_days': 7,
      'sales.commission.calculation_strategy': 'auto_on_confirm',
      'sales.commission.target_period': 'monthly',
      'sales.commission.batch_size': 200,
      'sales.commission.target_completion_bonus': { threshold: 1.2, bonus_rate: 0.2 },
    };
    return map[key] ?? null;
  });
  mocks.productFindUnique.mockResolvedValue(activeProduct);
  mocks.employeeFindFirst.mockResolvedValue(activeEmployee);
  mocks.paymentCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'pay-1',
    ...data,
  }));
  mocks.paymentUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'pay-1',
    employeeId: 'emp-1',
    productId: 'prod-1',
    amount: new Decimal(100000),
    period: '2026-09',
    ...data,
  }));
  mocks.commissionFindUnique.mockResolvedValue(null);
  mocks.commissionCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'comm-1',
    ...data,
  }));
});

describe('performance_sales_payment.service', () => {
  describe('createPayment', () => {
    it('登记回款 status=draft 成功', async () => {
      const result = await paymentService.createPayment('admin-1', {
        employeeId: 'emp-1',
        productId: 'prod-1',
        customerName: '某局',
        amount: 100000,
        paymentDate: new Date(2026, 8, 15),
      });
      expect(result.status).toBe('draft');
      expect(result.period).toBe('2026-09');
      expect(mocks.auditLog).toHaveBeenCalled();
    });

    it('amount=0 抛 72806', async () => {
      await expect(
        paymentService.createPayment('admin-1', {
          employeeId: 'emp-1',
          productId: 'prod-1',
          customerName: '某局',
          amount: 0,
          paymentDate: new Date(2026, 8, 15),
        }),
      ).rejects.toMatchObject({ code: 72806 });
    });

    it('amount=-100 抛 72806', async () => {
      await expect(
        paymentService.createPayment('admin-1', {
          employeeId: 'emp-1',
          productId: 'prod-1',
          customerName: '某局',
          amount: -100,
          paymentDate: new Date(2026, 8, 15),
        }),
      ).rejects.toMatchObject({ code: 72806 });
    });

    it('product 不存在抛 72801', async () => {
      mocks.productFindUnique.mockResolvedValue(null);
      await expect(
        paymentService.createPayment('admin-1', {
          employeeId: 'emp-1',
          productId: 'missing',
          customerName: '某局',
          amount: 100000,
          paymentDate: new Date(2026, 8, 15),
        }),
      ).rejects.toMatchObject({ code: 72801 });
    });

    it('employee 非销售岗抛 72807', async () => {
      mocks.employeeFindFirst.mockResolvedValue({ id: 'emp-2', status: 'probation', deletedAt: null });
      await expect(
        paymentService.createPayment('admin-1', {
          employeeId: 'emp-2',
          productId: 'prod-1',
          customerName: '某局',
          amount: 100000,
          paymentDate: new Date(2026, 8, 15),
        }),
      ).rejects.toMatchObject({ code: 72807 });
    });
  });

  describe('confirmPayment', () => {
    it('draft → confirmed 成功 + 调 commission.calculate', async () => {
      mocks.paymentFindUnique
        .mockResolvedValueOnce({
          id: 'pay-1', status: 'draft', employeeId: 'emp-1', productId: 'prod-1',
        })
        .mockResolvedValueOnce({
          id: 'pay-1',
          status: 'confirmed',
          employeeId: 'emp-1',
          productId: 'prod-1',
          amount: new Decimal(100000),
          period: '2026-09',
          product: activeProduct,
        });

      const result = await paymentService.confirmPayment('hr-1', 'pay-1', {});
      expect(result.status).toBe('confirmed');
      expect(mocks.commissionCreate).toHaveBeenCalledTimes(1);
      expect(mocks.auditLog).toHaveBeenCalled();
    });

    it('已 confirmed 抛 72805', async () => {
      mocks.paymentFindUnique.mockResolvedValue({ id: 'pay-1', status: 'confirmed' });
      await expect(
        paymentService.confirmPayment('hr-1', 'pay-1', {}),
      ).rejects.toMatchObject({ code: 72805 });
    });

    it('payment 不存在抛 72804', async () => {
      mocks.paymentFindUnique.mockResolvedValue(null);
      await expect(
        paymentService.confirmPayment('hr-1', 'missing', {}),
      ).rejects.toMatchObject({ code: 72804 });
    });
  });

  describe('cancelPayment', () => {
    it('draft 状态可取消', async () => {
      mocks.paymentFindUnique.mockResolvedValue({ id: 'pay-1', status: 'draft' });
      const result = await paymentService.cancelPayment('admin-1', 'pay-1', {
        reason: '客户取消订单',
      });
      expect(result.status).toBe('cancelled');
    });

    it('confirmed 状态不可取消', async () => {
      mocks.paymentFindUnique.mockResolvedValue({ id: 'pay-1', status: 'confirmed' });
      await expect(
        paymentService.cancelPayment('admin-1', 'pay-1', { reason: '客户取消订单' }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('reason 缺失抛 400', async () => {
      await expect(
        paymentService.cancelPayment('admin-1', 'pay-1', { reason: '' }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('listPayments', () => {
    it('filter employeeId 只返指定员工的', async () => {
      mocks.paymentFindMany.mockResolvedValue([{ id: 'pay-1', employeeId: 'emp-1' }]);
      mocks.paymentCount.mockResolvedValue(1);
      const result = await paymentService.listPayments('admin-1', {
        employeeId: 'emp-1', page: 1, pageSize: 20,
      });
      expect(result.total).toBe(1);
      expect(result.items[0].employeeId).toBe('emp-1');
    });

    it('filter period=2026-09', async () => {
      mocks.paymentFindMany.mockResolvedValue([{ id: 'pay-1', period: '2026-09' }]);
      mocks.paymentCount.mockResolvedValue(1);
      const result = await paymentService.listPayments('admin-1', { period: '2026-09' });
      expect(result.items[0].period).toBe('2026-09');
    });
  });
});
