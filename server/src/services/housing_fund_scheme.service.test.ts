// M4-C2: housing_fund_scheme.service 单元测试
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
  fundFindUnique: vi.fn(),
  fundCreate: vi.fn(),
  fundUpdate: vi.fn(),
  fundFindMany: vi.fn(),
  fundCount: vi.fn(),
  regCount: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    housingFundScheme: {
      findUnique: mocks.fundFindUnique,
      create: mocks.fundCreate,
      update: mocks.fundUpdate,
      findMany: mocks.fundFindMany,
      count: mocks.fundCount,
    },
    employeeInsuranceRegistration: {
      count: mocks.regCount,
    },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as fundService from './housing_fund_scheme.service';

const XIAN_FUND = {
  city: 'xi_an',
  companyRate: 0.05,
  personalRate: 0.05,
  baseMin: 4500,
  baseMax: 24000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'housing_fund.cities': ['xi_an', 'bei_jing', 'si_chuan'],
      'housing_fund.rate_range': { min: 0.05, max: 0.12 },
      'insurance.batch_size': 200,
    };
    return map[key] ?? null;
  });
  mocks.fundFindUnique.mockResolvedValue(null);
  mocks.fundCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'fund-1',
    ...data,
  }));
  mocks.fundUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'fund-1',
    city: 'xi_an',
    ...data,
  }));
  mocks.regCount.mockResolvedValue(0);
});

describe('housing_fund_scheme.service', () => {
  describe('createFund', () => {
    it('创建西安 公积金 5%/5% 方案成功', async () => {
      const result = await fundService.createFund('admin-1', XIAN_FUND);
      expect(result.city).toBe('xi_an');
      expect(Number(result.companyRate)).toBe(0.05);
      expect(result.status).toBe('active');
      expect(mocks.auditLog).toHaveBeenCalled();
    });

    it('创建北京 公积金 12%/12% 方案成功', async () => {
      const result = await fundService.createFund('admin-1', {
        city: 'bei_jing',
        companyRate: 0.12,
        personalRate: 0.12,
        baseMin: 6300,
        baseMax: 34000,
      });
      expect(Number(result.companyRate)).toBe(0.12);
    });

    it('city 重复抛 73107', async () => {
      mocks.fundFindUnique.mockResolvedValue({ id: 'exists', city: 'xi_an' });
      await expect(fundService.createFund('admin-1', XIAN_FUND))
        .rejects.toMatchObject({ statusCode: 400, code: 73107 });
    });

    it('companyRate < 0.05 抛 73108', async () => {
      await expect(fundService.createFund('admin-1', {
        ...XIAN_FUND, companyRate: 0.03,
      })).rejects.toMatchObject({ statusCode: 400, code: 73108 });
    });

    it('companyRate > 0.12 抛 73108', async () => {
      await expect(fundService.createFund('admin-1', {
        ...XIAN_FUND, companyRate: 0.15,
      })).rejects.toMatchObject({ statusCode: 400, code: 73108 });
    });
  });

  describe('updateFund', () => {
    it('active 可改 rate + base', async () => {
      mocks.fundFindUnique.mockResolvedValue({
        id: 'fund-1',
        status: 'active',
        city: 'xi_an',
        companyRate: new Decimal(0.05),
        personalRate: new Decimal(0.05),
        baseMin: new Decimal(4500),
        baseMax: new Decimal(24000),
      });
      const result = await fundService.updateFund('admin-1', 'fund-1', { companyRate: 0.08 });
      expect(Number(result.companyRate)).toBe(0.08);
    });
  });

  describe('archiveFund', () => {
    it('无 active registration 关联时归档成功', async () => {
      mocks.fundFindUnique.mockResolvedValue({
        id: 'fund-1', status: 'active', city: 'xi_an',
      });
      mocks.regCount.mockResolvedValue(0);
      const result = await fundService.archiveFund('admin-1', 'fund-1');
      expect(result.status).toBe('archived');
    });
  });
});
