// M1-A1: company.service 单元测试 | HRMS
/* eslint-disable import/first */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  companyFindFirst: vi.fn(),
  companyCreate: vi.fn(),
  companyFindMany: vi.fn(),
  companyCount: vi.fn(),
  companyUpdate: vi.fn(),
  departmentCount: vi.fn(),
  employeeCount: vi.fn(),
  departmentFindMany: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    company: {
      findFirst: mocks.companyFindFirst,
      create: mocks.companyCreate,
      findMany: mocks.companyFindMany,
      count: mocks.companyCount,
      update: mocks.companyUpdate,
    },
    department: {
      count: mocks.departmentCount,
      findMany: mocks.departmentFindMany,
    },
    employee: { count: mocks.employeeCount },
  },
}));

vi.mock('./audit.service', () => ({
  AUDIT_ACTIONS: {
    CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE', EXPORT: 'EXPORT',
  },
  AUDIT_RESOURCE_TYPES: { COMPANY: 'Company' },
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

import { AppError } from '../middleware/errorHandler';

import * as companyService from './company.service';

const baseCompany = {
  id: 'c-1',
  code: 'XACH',
  name: '西安辰航卓越科技有限公司',
  shortName: '辰航',
  city: '西安',
  address: null,
  contact: null,
  status: 'active',
  legalRep: null,
  taxNo: null,
  createdBy: 'u-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('company.service', () => {
  it('createCompany 成功并写审计', async () => {
    mocks.companyFindFirst.mockResolvedValue(null);
    mocks.companyCreate.mockResolvedValue(baseCompany);

    const result = await companyService.createCompany({
      code: 'xach',
      name: '西安辰航卓越科技有限公司',
      createdBy: 'u-1',
    });

    expect(result.code).toBe('XACH');
    expect(mocks.companyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: 'XACH' }) }),
    );
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('createCompany 代码重复 → 71002', async () => {
    mocks.companyFindFirst.mockResolvedValue(baseCompany);
    await expect(
      companyService.createCompany({ code: 'XACH', name: 'x' }),
    ).rejects.toMatchObject({ code: 71002 });
  });

  it('getCompanyById 不存在 → 71001', async () => {
    mocks.companyFindFirst.mockResolvedValue(null);
    await expect(companyService.getCompanyById('missing')).rejects.toBeInstanceOf(AppError);
    await expect(companyService.getCompanyById('missing')).rejects.toMatchObject({ code: 71001 });
  });

  it('listCompanies 分页', async () => {
    mocks.companyFindMany.mockResolvedValue([baseCompany]);
    mocks.companyCount.mockResolvedValue(1);
    const result = await companyService.listCompanies({ page: 1, pageSize: 10 });
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it('updateCompany 成功', async () => {
    mocks.companyFindFirst.mockResolvedValue(baseCompany);
    mocks.companyUpdate.mockResolvedValue({ ...baseCompany, name: '新名称' });
    const result = await companyService.updateCompany('c-1', { name: '新名称' }, 'u-1');
    expect(result.name).toBe('新名称');
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('deleteCompany 有部门 → 71003', async () => {
    mocks.companyFindFirst.mockResolvedValue(baseCompany);
    mocks.departmentCount.mockResolvedValue(2);
    mocks.employeeCount.mockResolvedValue(0);
    await expect(companyService.deleteCompany('c-1')).rejects.toMatchObject({ code: 71003 });
  });

  it('deleteCompany 有员工 → 71004', async () => {
    mocks.companyFindFirst.mockResolvedValue(baseCompany);
    mocks.departmentCount.mockResolvedValue(0);
    mocks.employeeCount.mockResolvedValue(3);
    await expect(companyService.deleteCompany('c-1')).rejects.toMatchObject({ code: 71004 });
  });

  it('getCompanyStatistics 返回编制汇总', async () => {
    mocks.companyFindFirst.mockResolvedValue(baseCompany);
    mocks.departmentCount.mockResolvedValue(4);
    mocks.employeeCount.mockResolvedValue(5);
    mocks.departmentFindMany.mockResolvedValue([
      { headcount: 10 }, { headcount: 5 },
    ]);
    const stats = await companyService.getCompanyStatistics('c-1');
    expect(stats.departmentCount).toBe(4);
    expect(stats.headcountTotal).toBe(15);
    expect(stats.headcountUsed).toBe(5);
    expect(stats.warningLevel).toBe('ok');
  });
});
