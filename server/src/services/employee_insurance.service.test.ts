// M4-C2: employee_insurance.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import { Decimal } from '@prisma/client/runtime/library';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  employeeFindFirst: vi.fn(),
  employeeFindUnique: vi.fn(),
  schemeFindUnique: vi.fn(),
  fundFindUnique: vi.fn(),
  planFindFirst: vi.fn(),
  regFindFirst: vi.fn(),
  regFindUnique: vi.fn(),
  regFindMany: vi.fn(),
  regCreate: vi.fn(),
  regUpdate: vi.fn(),
  regCount: vi.fn(),
  userFindUnique: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: {
      findFirst: mocks.employeeFindFirst,
      findUnique: mocks.employeeFindUnique,
    },
    socialInsuranceScheme: {
      findUnique: mocks.schemeFindUnique,
    },
    housingFundScheme: {
      findUnique: mocks.fundFindUnique,
    },
    employeeSalaryPlan: {
      findFirst: mocks.planFindFirst,
    },
    employeeInsuranceRegistration: {
      findFirst: mocks.regFindFirst,
      findUnique: mocks.regFindUnique,
      findMany: mocks.regFindMany,
      create: mocks.regCreate,
      update: mocks.regUpdate,
      count: mocks.regCount,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as insService from './employee_insurance.service';

const EMPLOYEE = { id: 'emp-1', departmentId: 'dept-1', deletedAt: null };
const SCHEME = {
  id: 'scheme-1',
  city: 'xi_an',
  insuranceType: 'pension',
  baseMin: new Decimal(4500),
  baseMax: new Decimal(24000),
};
const FUND = {
  id: 'fund-1',
  city: 'xi_an',
  baseMin: new Decimal(4500),
  baseMax: new Decimal(24000),
};
const INPUT = {
  employeeId: 'emp-1',
  city: 'xi_an',
  socialInsuranceSchemeId: 'scheme-1',
  housingFundSchemeId: 'fund-1',
  baseSalary: 10000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'insurance.cities': ['xi_an', 'bei_jing', 'si_chuan'],
      'insurance.batch_size': 200,
    };
    return map[key] ?? null;
  });
  mocks.employeeFindFirst.mockResolvedValue(EMPLOYEE);
  mocks.schemeFindUnique.mockResolvedValue(SCHEME);
  mocks.fundFindUnique.mockResolvedValue(FUND);
  mocks.regFindFirst.mockResolvedValue(null);
  mocks.planFindFirst.mockResolvedValue(null);
  mocks.regCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'reg-1',
    ...data,
  }));
  mocks.regUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'reg-1',
    status: 'active',
    ...data,
  }));
  mocks.userFindUnique.mockResolvedValue({
    id: 'admin-1',
    userRoles: [{ role: { code: 'hr' } }],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('employee_insurance.service', () => {
  describe('createRegistration', () => {
    it('员工登记 西安 养老 16%/8% + 公积金 5%/5% 成功', async () => {
      const result = await insService.createRegistration('admin-1', INPUT);
      expect(result.status).toBe('active');
      expect(result.city).toBe('xi_an');
      expect(Number(result.baseSalary)).toBe(10000);
      expect(mocks.auditLog).toHaveBeenCalled();
    });

    it('socialInsuranceSchemeId.city !== city 抛 400', async () => {
      mocks.schemeFindUnique.mockResolvedValue({ ...SCHEME, city: 'bei_jing' });
      await expect(insService.createRegistration('admin-1', INPUT))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('housingFundSchemeId.city !== city 抛 400', async () => {
      mocks.fundFindUnique.mockResolvedValue({ ...FUND, city: 'bei_jing' });
      await expect(insService.createRegistration('admin-1', INPUT))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('员工已有 active 登记抛 73110', async () => {
      mocks.regFindFirst.mockResolvedValue({ id: 'old', status: 'active' });
      await expect(insService.createRegistration('admin-1', INPUT))
        .rejects.toMatchObject({ statusCode: 400, code: 73110 });
    });

    it('baseSalary < scheme.baseMin 抛 400', async () => {
      await expect(insService.createRegistration('admin-1', {
        ...INPUT, baseSalary: 1000,
      })).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('listRegistrations', () => {
    it('filter employeeId 只返指定员工的', async () => {
      mocks.regFindMany.mockResolvedValue([{ id: 'reg-1', employeeId: 'emp-1' }]);
      mocks.regCount.mockResolvedValue(1);
      const result = await insService.listRegistrations('admin-1', { employeeId: 'emp-1' });
      expect(result.items).toHaveLength(1);
    });

    it('dept_head 仅看本部门员工', async () => {
      mocks.userFindUnique.mockResolvedValue({
        id: 'dh-1',
        userRoles: [{ role: { code: 'dept_head' } }],
      });
      mocks.employeeFindFirst.mockResolvedValue({ id: 'emp-dh', departmentId: 'dept-1' });
      mocks.regFindMany.mockResolvedValue([]);
      mocks.regCount.mockResolvedValue(0);
      await insService.listRegistrations('dh-1', {});
      expect(mocks.regFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ employee: { departmentId: 'dept-1' } }),
        }),
      );
    });
  });

  describe('getActiveRegistration', () => {
    it('返 effectiveFrom ≤ now < effectiveTo 的 active registration', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 15));
      mocks.regFindFirst.mockResolvedValue({
        id: 'reg-1',
        employeeId: 'emp-1',
        status: 'active',
        effectiveFrom: new Date(2026, 8, 1),
        effectiveTo: null,
      });
      const result = await insService.getActiveRegistration('admin-1', 'emp-1');
      expect(result.id).toBe('reg-1');
    });

    it('无当前生效登记抛 73109', async () => {
      mocks.regFindFirst.mockResolvedValue(null);
      await expect(insService.getActiveRegistration('admin-1', 'emp-1'))
        .rejects.toMatchObject({ statusCode: 400, code: 73109 });
    });

    it('employee 仅看本人', async () => {
      mocks.userFindUnique.mockResolvedValue({
        id: 'u-emp',
        userRoles: [{ role: { code: 'employee' } }],
      });
      mocks.employeeFindFirst
        .mockResolvedValueOnce(EMPLOYEE)
        .mockResolvedValueOnce({ id: 'emp-self', departmentId: 'dept-1' });
      mocks.regFindFirst.mockResolvedValue({
        id: 'reg-1', employeeId: 'emp-1', status: 'active',
      });
      await expect(insService.getActiveRegistration('u-emp', 'emp-1'))
        .rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('deactivateRegistration', () => {
    it('active → inactive 成功', async () => {
      mocks.regFindUnique.mockResolvedValue({
        id: 'reg-1', status: 'active', employeeId: 'emp-1',
      });
      const result = await insService.deactivateRegistration('admin-1', 'reg-1', {
        effectiveTo: new Date(2026, 8, 30),
      });
      expect(result.status).toBe('inactive');
    });

    it('已 inactive 抛 400', async () => {
      mocks.regFindUnique.mockResolvedValue({
        id: 'reg-1', status: 'inactive', employeeId: 'emp-1',
      });
      await expect(insService.deactivateRegistration('admin-1', 'reg-1', {
        effectiveTo: new Date(2026, 8, 30),
      })).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
