// M3-D5: performance_sales_product.service 单元测试
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
  productCreate: vi.fn(),
  productUpdate: vi.fn(),
  productFindMany: vi.fn(),
  productCount: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    performanceSalesProduct: {
      findUnique: mocks.productFindUnique,
      create: mocks.productCreate,
      update: mocks.productUpdate,
      findMany: mocks.productFindMany,
      count: mocks.productCount,
    },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as productService from './performance_sales_product.service';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'sales.commission.default_rate': 0.05,
      'sales.commission.rate_tiers': { product: 0.05, service: 0.08, training: 0.03 },
    };
    return map[key] ?? null;
  });
  mocks.productFindUnique.mockResolvedValue(null);
  mocks.productCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'prod-1',
    ...data,
  }));
  mocks.productUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'prod-1',
    code: 'UAV-01',
    ...data,
  }));
});

describe('performance_sales_product.service', () => {
  describe('createProduct', () => {
    it('创建 product 类别 baseRate=0.05 成功', async () => {
      const result = await productService.createProduct('admin-1', {
        code: 'UAV-01', name: '无人机整机', category: 'product', baseRate: 0.05,
      });
      expect(result.category).toBe('product');
      expect(Number(result.baseRate)).toBe(0.05);
      expect(result.status).toBe('active');
      expect(mocks.auditLog).toHaveBeenCalled();
    });

    it('创建 service 类别 baseRate=0.08 成功', async () => {
      const result = await productService.createProduct('admin-1', {
        code: 'SVC-01', name: '运维服务', category: 'service', baseRate: 0.08,
      });
      expect(result.category).toBe('service');
      expect(Number(result.baseRate)).toBe(0.08);
    });

    it('创建 training 类别 baseRate=0.03 成功', async () => {
      const result = await productService.createProduct('admin-1', {
        code: 'TRN-01', name: '操作培训', category: 'training', baseRate: 0.03,
      });
      expect(result.category).toBe('training');
      expect(Number(result.baseRate)).toBe(0.03);
    });

    it('code 重复抛 72802', async () => {
      mocks.productFindUnique.mockResolvedValue({ id: 'exist', code: 'UAV-01' });
      await expect(
        productService.createProduct('admin-1', {
          code: 'UAV-01', name: '重复', category: 'product', baseRate: 0.05,
        }),
      ).rejects.toMatchObject({ code: 72802 });
    });

    it('category 非法抛 400', async () => {
      await expect(
        productService.createProduct('admin-1', {
          code: 'X-01', name: '非法', category: 'hardware', baseRate: 0.05,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('baseRate=0 抛 72803', async () => {
      await expect(
        productService.createProduct('admin-1', {
          code: 'X-02', name: '零比例', category: 'product', baseRate: 0,
        }),
      ).rejects.toMatchObject({ code: 72803 });
    });

    it('baseRate=0.51 抛 72803', async () => {
      await expect(
        productService.createProduct('admin-1', {
          code: 'X-03', name: '超限', category: 'product', baseRate: 0.51,
        }),
      ).rejects.toMatchObject({ code: 72803 });
    });
  });

  describe('updateProduct', () => {
    it('active 状态可改 baseRate', async () => {
      mocks.productFindUnique.mockResolvedValue({
        id: 'prod-1', code: 'UAV-01', status: 'active', name: '无人机整机', baseRate: new Decimal(0.05),
      });
      const result = await productService.updateProduct('admin-1', 'prod-1', { baseRate: 0.06 });
      expect(Number(result.baseRate)).toBe(0.06);
    });

    it('archived 状态所有字段不可改', async () => {
      mocks.productFindUnique.mockResolvedValue({
        id: 'prod-1', code: 'UAV-01', status: 'archived', name: '无人机整机',
      });
      await expect(
        productService.updateProduct('admin-1', 'prod-1', { name: '改名' }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('archiveProduct', () => {
    it('active → archived 成功', async () => {
      mocks.productFindUnique.mockResolvedValue({
        id: 'prod-1', code: 'UAV-01', status: 'active',
      });
      const result = await productService.archiveProduct('admin-1', 'prod-1');
      expect(result.status).toBe('archived');
    });

    it('已是 archived 抛 400', async () => {
      mocks.productFindUnique.mockResolvedValue({
        id: 'prod-1', code: 'UAV-01', status: 'archived',
      });
      await expect(
        productService.archiveProduct('admin-1', 'prod-1'),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
