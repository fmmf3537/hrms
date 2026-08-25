// M1-A1: 法人公司 service | HRMS
import type { Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';

export interface CreateCompanyInput {
  code: string;
  name: string;
  shortName?: string;
  city?: string;
  address?: string;
  contact?: string;
  status?: string;
  legalRep?: string;
  taxNo?: string;
  createdBy?: string;
}

export interface UpdateCompanyInput {
  name?: string;
  shortName?: string;
  city?: string;
  address?: string;
  contact?: string;
  status?: string;
  legalRep?: string;
  taxNo?: string;
}

export interface ListCompaniesQuery {
  status?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 新增法人公司
 */
export async function createCompany(input: CreateCompanyInput) {
  const code = input.code.trim().toUpperCase();
  const existing = await prisma.company.findFirst({
    where: { code, deletedAt: null },
  });
  if (existing) {
    throw new AppError(`法人代码已存在: ${code}`, 409, 71002);
  }

  const company = await prisma.company.create({
    data: {
      code,
      name: input.name,
      shortName: input.shortName,
      city: input.city,
      address: input.address,
      contact: input.contact,
      status: input.status ?? 'active',
      legalRep: input.legalRep,
      taxNo: input.taxNo,
      createdBy: input.createdBy,
    },
  });

  await auditService.auditLog({
    userId: input.createdBy,
    action: auditService.AUDIT_ACTIONS.CREATE,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.COMPANY,
    resourceId: company.id,
    description: `创建法人 ${company.code}`,
    newValue: { code: company.code, name: company.name },
  });

  return company;
}

/**
 * 按 ID 查询法人（排除软删）
 */
export async function getCompanyById(id: string) {
  const company = await prisma.company.findFirst({
    where: { id, deletedAt: null },
  });
  if (!company) {
    throw new AppError('法人不存在', 404, 71001);
  }
  return company;
}

/**
 * 按代码查询法人
 */
export async function getCompanyByCode(code: string) {
  const company = await prisma.company.findFirst({
    where: { code: code.trim().toUpperCase(), deletedAt: null },
  });
  if (!company) {
    throw new AppError('法人不存在', 404, 71001);
  }
  return company;
}

/**
 * 分页列表
 */
export async function listCompanies(query: ListCompaniesQuery = {}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where: Prisma.CompanyWhereInput = {
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.company.count({ where }),
  ]);

  return {
    data, total, page, pageSize,
  };
}

/**
 * 更新法人
 */
export async function updateCompany(id: string, input: UpdateCompanyInput, operatorId?: string) {
  const existing = await getCompanyById(id);

  const company = await prisma.company.update({
    where: { id },
    data: {
      name: input.name,
      shortName: input.shortName,
      city: input.city,
      address: input.address,
      contact: input.contact,
      status: input.status,
      legalRep: input.legalRep,
      taxNo: input.taxNo,
    },
  });

  await auditService.auditLog({
    userId: operatorId,
    action: auditService.AUDIT_ACTIONS.UPDATE,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.COMPANY,
    resourceId: id,
    description: `更新法人 ${company.code}`,
    oldValue: { status: existing.status, name: existing.name },
    newValue: { status: company.status, name: company.name },
  });

  return company;
}

/**
 * 软删除法人（不可有部门或员工）
 */
export async function deleteCompany(id: string, operatorId?: string) {
  const company = await getCompanyById(id);

  const [deptCount, empCount] = await Promise.all([
    prisma.department.count({ where: { companyId: id, deletedAt: null } }),
    prisma.employee.count({ where: { companyId: id, deletedAt: null } }),
  ]);

  if (deptCount > 0) {
    throw new AppError('法人下仍有部门，无法删除', 400, 71003);
  }
  if (empCount > 0) {
    throw new AppError('法人下仍有员工，无法删除', 400, 71004);
  }

  const deleted = await prisma.company.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'suspended' },
  });

  await auditService.auditLog({
    userId: operatorId,
    action: auditService.AUDIT_ACTIONS.DELETE,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.COMPANY,
    resourceId: id,
    description: `软删除法人 ${company.code}`,
  });

  return deleted;
}

/**
 * 法人统计：部门数 / 员工数 / 编制汇总
 */
export async function getCompanyStatistics(companyId: string) {
  await getCompanyById(companyId);

  const [departmentCount, employeeCount, depts] = await Promise.all([
    prisma.department.count({ where: { companyId, deletedAt: null } }),
    prisma.employee.count({
      where: { companyId, deletedAt: null, status: { not: 'resigned' } },
    }),
    prisma.department.findMany({
      where: { companyId, deletedAt: null },
      select: { headcount: true },
    }),
  ]);

  const headcountTotal = depts.reduce((sum, d) => sum + d.headcount, 0);
  const headcountUsed = employeeCount;
  let warningLevel: 'ok' | 'warning' | 'critical' = 'ok';
  if (headcountTotal > 0) {
    const ratio = headcountUsed / headcountTotal;
    if (ratio > 1.2) warningLevel = 'critical';
    else if (ratio > 1.0) warningLevel = 'warning';
  }

  return {
    departmentCount,
    employeeCount,
    headcountTotal,
    headcountUsed,
    warningLevel,
  };
}
