// M4-C2: 三地公积金方案 service | HRMS
// 仅 import audit/config + prisma；不实现实际算扣；不写 employee_salary_history

import type { HousingFundScheme, Prisma, SocialInsuranceCity } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'housing_fund_scheme';
const FALLBACK_CITIES = ['xi_an', 'bei_jing', 'si_chuan'];
const FALLBACK_RANGE = { min: 0.05, max: 0.12 };

export interface CreateFundInput {
  city: string;
  companyRate: number;
  personalRate: number;
  baseMin: number;
  baseMax: number;
}

export interface UpdateFundInput {
  companyRate?: number;
  personalRate?: number;
  baseMin?: number;
  baseMax?: number;
}

export interface ListFundFilter {
  city?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedFunds {
  items: HousingFundScheme[];
  total: number;
  page: number;
  pageSize: number;
}

async function getCities(): Promise<string[]> {
  try {
    const v = await configService.getValue('salary', 'housing_fund.cities');
    if (Array.isArray(v) && v.every((x): x is string => typeof x === 'string')) return v;
    return FALLBACK_CITIES;
  } catch {
    // TODO: configs.salary.housing_fund.cities 未配置时 fallback
    return FALLBACK_CITIES;
  }
}

async function getRateRange(): Promise<{ min: number; max: number }> {
  try {
    const v = await configService.getValue('salary', 'housing_fund.rate_range');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      const min = Number(obj.min);
      const max = Number(obj.max);
      if (Number.isFinite(min) && Number.isFinite(max)) return { min, max };
    }
    return FALLBACK_RANGE;
  } catch {
    // TODO: configs.salary.housing_fund.rate_range 未配置时 fallback
    return FALLBACK_RANGE;
  }
}

async function getBatchSize(): Promise<number> {
  try {
    const v = await configService.getValue('salary', 'insurance.batch_size');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : 200;
  } catch {
    // TODO: configs.salary.insurance.batch_size 未配置时 fallback
    return 200;
  }
}

function toNumber(v: Decimal | number): number {
  return typeof v === 'number' ? v : Number(v);
}

async function assertFundRate(rate: number, label: string): Promise<void> {
  const range = await getRateRange();
  if (rate < range.min || rate > range.max) {
    throw new AppError(`${label} 须在 ${range.min * 100}%-${range.max * 100}% 之间`, 400, 73108);
  }
}

/**
 * 创建三地公积金方案（V1.2 §二.4.3 公积金 5%-12%）
 * @param actorId 操作人 ID（hr/admin）
 * @param input { city, companyRate, personalRate, baseMin, baseMax }
 * @returns 新创建的 housing_fund_schemes 记录
 * @throws AppError(400, 73103) city 不在白名单
 * @throws AppError(400, 73107) city 重复
 * @throws AppError(400, 73108) companyRate/personalRate 不在 5%-12%
 * 校验链：
 *  1. 校验 city ∈ configs.salary.housing_fund.cities → 否则抛 73103
 *  2. 校验 city 唯一 → 重复抛 73107
 *  3. 校验 rate ∈ [0.05, 0.12]（configs.salary.housing_fund.rate_range）→ 否则抛 73108
 *  4. 校验 baseMin < baseMax 且 baseMin > 0 → 否则抛 400
 *  5. 创建记录（status = active）
 *  6. 写 audit（HOUSING_FUND_CREATE）
 */
export async function createFund(
  actorId: string,
  input: CreateFundInput,
): Promise<HousingFundScheme> {
  const {
    city, companyRate, personalRate, baseMin, baseMax,
  } = input;

  const cities = await getCities();
  if (!cities.includes(city)) {
    throw new AppError('参保城市不合法，应为 xi_an / bei_jing / si_chuan', 400, 73103);
  }

  const existing = await prisma.housingFundScheme.findUnique({
    where: { city: city as SocialInsuranceCity },
  });
  if (existing) {
    throw new AppError('该城市公积金方案已存在', 400, 73107);
  }

  await assertFundRate(companyRate, '单位公积金比例');
  await assertFundRate(personalRate, '个人公积金比例');
  if (!(baseMin > 0 && baseMin < baseMax)) {
    throw new AppError('缴费基数范围不合法：baseMin 须 > 0 且 < baseMax', 400);
  }

  const created = await prisma.housingFundScheme.create({
    data: {
      city: city as SocialInsuranceCity,
      companyRate: new Decimal(companyRate),
      personalRate: new Decimal(personalRate),
      baseMin: new Decimal(baseMin),
      baseMax: new Decimal(baseMax),
      status: 'active',
      createdById: actorId,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'HOUSING_FUND_CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: created.id,
    description: `创建公积金方案 ${city}`,
    newValue: {
      city, companyRate, personalRate, baseMin, baseMax,
    },
  });

  return created;
}

/**
 * 列出公积金方案（city / status 过滤 + 分页）
 */
export async function listFunds(
  _actorId: string,
  filter: ListFundFilter,
): Promise<PaginatedFunds> {
  const page = filter.page ?? 1;
  const batch = await getBatchSize();
  const pageSize = Math.min(filter.pageSize ?? 20, batch);
  if (page < 1 || pageSize < 1) {
    throw new AppError('分页参数不合法', 400);
  }

  const where: Prisma.HousingFundSchemeWhereInput = {};
  if (filter.city) where.city = filter.city as SocialInsuranceCity;
  if (filter.status) {
    where.status = filter.status as Prisma.EnumHousingFundStatusFilter['equals'];
  }

  const [items, total] = await Promise.all([
    prisma.housingFundScheme.findMany({
      where,
      orderBy: { city: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.housingFundScheme.count({ where }),
  ]);

  return {
    items, total, page, pageSize,
  };
}

/**
 * 更新公积金方案（仅 active 可改 rate/base；city 不可改）
 * @throws AppError(400, 73106) fund 不存在
 */
export async function updateFund(
  actorId: string,
  id: string,
  input: UpdateFundInput,
): Promise<HousingFundScheme> {
  const fund = await prisma.housingFundScheme.findUnique({ where: { id } });
  if (!fund) {
    throw new AppError('公积金方案不存在', 400, 73106);
  }
  if (fund.status !== 'active') {
    throw new AppError('已归档方案不可修改', 400);
  }

  const companyRate = input.companyRate ?? toNumber(fund.companyRate);
  const personalRate = input.personalRate ?? toNumber(fund.personalRate);
  const baseMin = input.baseMin ?? toNumber(fund.baseMin);
  const baseMax = input.baseMax ?? toNumber(fund.baseMax);
  await assertFundRate(companyRate, '单位公积金比例');
  await assertFundRate(personalRate, '个人公积金比例');
  if (!(baseMin > 0 && baseMin < baseMax)) {
    throw new AppError('缴费基数范围不合法：baseMin 须 > 0 且 < baseMax', 400);
  }

  const updated = await prisma.housingFundScheme.update({
    where: { id },
    data: {
      companyRate: new Decimal(companyRate),
      personalRate: new Decimal(personalRate),
      baseMin: new Decimal(baseMin),
      baseMax: new Decimal(baseMax),
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'HOUSING_FUND_UPDATE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `更新公积金方案 ${fund.city}`,
    newValue: {
      companyRate, personalRate, baseMin, baseMax,
    },
  });

  return updated;
}

/**
 * 归档公积金方案（active → archived，需无 active registration 关联）
 * @throws AppError(400, 73106) fund 不存在
 */
export async function archiveFund(actorId: string, id: string): Promise<HousingFundScheme> {
  const fund = await prisma.housingFundScheme.findUnique({ where: { id } });
  if (!fund) {
    throw new AppError('公积金方案不存在', 400, 73106);
  }
  if (fund.status !== 'active') {
    throw new AppError('方案状态非 active，无法归档', 400);
  }

  const activeRegs = await prisma.employeeInsuranceRegistration.count({
    where: { housingFundSchemeId: id, status: 'active' },
  });
  if (activeRegs > 0) {
    throw new AppError('存在未失效员工登记，无法归档公积金方案', 400);
  }

  const archived = await prisma.housingFundScheme.update({
    where: { id },
    data: { status: 'archived' },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'HOUSING_FUND_ARCHIVE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `归档公积金方案 ${fund.city}`,
  });

  return archived;
}
