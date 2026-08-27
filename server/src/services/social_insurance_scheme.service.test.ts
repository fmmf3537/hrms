// M4-C2: social_insurance_scheme.service 单元测试
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
  schemeFindUnique: vi.fn(),
  schemeCreate: vi.fn(),
  schemeUpdate: vi.fn(),
  schemeFindMany: vi.fn(),
  schemeCount: vi.fn(),
  regCount: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    socialInsuranceScheme: {
      findUnique: mocks.schemeFindUnique,
      create: mocks.schemeCreate,
      update: mocks.schemeUpdate,
      findMany: mocks.schemeFindMany,
      count: mocks.schemeCount,
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

import * as schemeService from './social_insurance_scheme.service';

const XIAN_PENSION = {
  city: 'xi_an',
  insuranceType: 'pension',
  companyRate: 0.16,
  personalRate: 0.08,
  baseMin: 4500,
  baseMax: 24000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'insurance.cities': ['xi_an', 'bei_jing', 'si_chuan'],
      'insurance.types': ['pension', 'medical', 'unemployment', 'work_injury', 'maternity'],
      'insurance.base_adjustment_month': { xi_an: 7, bei_jing: 7, si_chuan: 7 },
      'insurance.batch_size': 200,
    };
    return map[key] ?? null;
  });
  mocks.schemeFindUnique.mockResolvedValue(null);
  mocks.schemeCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'scheme-1',
    ...data,
  }));
  mocks.schemeUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'scheme-1',
    city: 'xi_an',
    insuranceType: 'pension',
    ...data,
  }));
  mocks.regCount.mockResolvedValue(0);
});

describe('social_insurance_scheme.service', () => {
  describe('createScheme', () => {
    it('创建西安 养老 16%/8% 方案成功', async () => {
      const result = await schemeService.createScheme('admin-1', XIAN_PENSION);
      expect(result.city).toBe('xi_an');
      expect(result.insuranceType).toBe('pension');
      expect(Number(result.companyRate)).toBe(0.16);
      expect(result.status).toBe('active');
      expect(mocks.auditLog).toHaveBeenCalled();
    });

    it('创建北京 医疗 9.0%+1%/2% 方案成功', async () => {
      const result = await schemeService.createScheme('admin-1', {
        city: 'bei_jing',
        insuranceType: 'medical',
        companyRate: 0.1,
        personalRate: 0.02,
        baseMin: 6300,
        baseMax: 34000,
      });
      expect(result.city).toBe('bei_jing');
      expect(Number(result.companyRate)).toBe(0.1);
    });

    it('city 不在白名单抛 73103', async () => {
      await expect(schemeService.createScheme('admin-1', {
        ...XIAN_PENSION, city: 'shang_hai',
      })).rejects.toMatchObject({ statusCode: 400, code: 73103 });
    });

    it('insuranceType 不在 5 险白名单抛 73104', async () => {
      await expect(schemeService.createScheme('admin-1', {
        ...XIAN_PENSION, insuranceType: 'critical',
      })).rejects.toMatchObject({ statusCode: 400, code: 73104 });
    });

    it('city+insuranceType 重复抛 73102', async () => {
      mocks.schemeFindUnique.mockResolvedValue({ id: 'exists', ...XIAN_PENSION });
      await expect(schemeService.createScheme('admin-1', XIAN_PENSION))
        .rejects.toMatchObject({ statusCode: 400, code: 73102 });
    });

    it('companyRate > 1 抛 73105', async () => {
      await expect(schemeService.createScheme('admin-1', {
        ...XIAN_PENSION, companyRate: 1.2,
      })).rejects.toMatchObject({ statusCode: 400, code: 73105 });
    });
  });

  describe('updateScheme', () => {
    it('active 可改 rate + base', async () => {
      mocks.schemeFindUnique.mockResolvedValue({
        id: 'scheme-1',
        status: 'active',
        city: 'xi_an',
        insuranceType: 'pension',
        companyRate: new Decimal(0.16),
        personalRate: new Decimal(0.08),
        baseMin: new Decimal(4500),
        baseMax: new Decimal(24000),
        baseAdjustmentMonth: 7,
      });
      const result = await schemeService.updateScheme('admin-1', 'scheme-1', {
        companyRate: 0.16, baseMax: 25000,
      });
      expect(Number(result.baseMax)).toBe(25000);
    });
  });

  describe('archiveScheme', () => {
    it('无 active registration 关联时归档成功', async () => {
      mocks.schemeFindUnique.mockResolvedValue({
        id: 'scheme-1', status: 'active', city: 'xi_an', insuranceType: 'pension',
      });
      mocks.regCount.mockResolvedValue(0);
      const result = await schemeService.archiveScheme('admin-1', 'scheme-1');
      expect(result.status).toBe('archived');
    });

    it('有 active registration 关联抛 400', async () => {
      mocks.schemeFindUnique.mockResolvedValue({
        id: 'scheme-1', status: 'active', city: 'xi_an', insuranceType: 'pension',
      });
      mocks.regCount.mockResolvedValue(1);
      await expect(schemeService.archiveScheme('admin-1', 'scheme-1'))
        .rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('listSchemes', () => {
    it('filter city=xi_an 只返西安', async () => {
      mocks.schemeFindMany.mockResolvedValue([{ id: 's1', city: 'xi_an' }]);
      mocks.schemeCount.mockResolvedValue(1);
      const result = await schemeService.listSchemes('admin-1', { city: 'xi_an' });
      expect(result.items).toHaveLength(1);
      expect(mocks.schemeFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ city: 'xi_an' }) }),
      );
    });
  });
});
