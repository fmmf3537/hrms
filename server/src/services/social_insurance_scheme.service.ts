// M4-C2: 三地社保方案 service | HRMS
// 仅 import audit/config + prisma；不实现实际算扣；不写 employee_salary_history

import type {
  Prisma, SocialInsuranceCity, SocialInsuranceScheme, SocialInsuranceType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'social_insurance_scheme';
const FALLBACK_CITIES = ['xi_an', 'bei_jing', 'si_chuan'];
const FALLBACK_TYPES = ['pension', 'medical', 'unemployment', 'work_injury', 'maternity'];
const FALLBACK_ADJUST: Record<string, number> = { xi_an: 7, bei_jing: 7, si_chuan: 7 };

export interface CreateSchemeInput {
  city: string;
  insuranceType: string;
  companyRate: number;
  personalRate: number;
  baseMin: number;
  baseMax: number;
  baseAdjustmentMonth?: number;
}

export interface UpdateSchemeInput {
  companyRate?: number;
  personalRate?: number;
  baseMin?: number;
  baseMax?: number;
  baseAdjustmentMonth?: number;
}

export interface ListSchemeFilter {
  city?: string;
  insuranceType?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedSchemes {
  items: SocialInsuranceScheme[];
  total: number;
  page: number;
  pageSize: number;
}

async function getCities(): Promise<string[]> {
  try {
    const v = await configService.getValue('salary', 'insurance.cities');
    if (Array.isArray(v) && v.every((x): x is string => typeof x === 'string')) return v;
    return FALLBACK_CITIES;
  } catch {
    // TODO: configs.salary.insurance.cities 未配置时 fallback
    return FALLBACK_CITIES;
  }
}

async function getTypes(): Promise<string[]> {
  try {
    const v = await configService.getValue('salary', 'insurance.types');
    if (Array.isArray(v) && v.every((x): x is string => typeof x === 'string')) return v;
    return FALLBACK_TYPES;
  } catch {
    // TODO: configs.salary.insurance.types 未配置时 fallback
    return FALLBACK_TYPES;
  }
}

async function getAdjustMonth(city: string): Promise<number> {
  try {
    const v = await configService.getValue('salary', 'insurance.base_adjustment_month');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const n = Number((v as Record<string, unknown>)[city]);
      if (Number.isFinite(n)) return n;
    }
    return FALLBACK_ADJUST[city] ?? 7;
  } catch {
    // TODO: configs.salary.insurance.base_adjustment_month 未配置时 fallback
    return FALLBACK_ADJUST[city] ?? 7;
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

function assertRate(rate: number, label: string): void {
  if (!(rate >= 0 && rate <= 1)) {
    throw new AppError(`${label} 超出 [0, 1] 范围`, 400, 73105);
  }
}

/**
 * 创建三地社保方案（V1.2 §二.4.3）
 * @param actorId 操作人 ID（hr/admin）
 * @param input { city, insuranceType, companyRate, personalRate, baseMin, baseMax, baseAdjustmentMonth? }
 * @returns 新创建的 social_insurance_schemes 记录
 * @throws AppError(400, 73103) city 不在白名单
 * @throws AppError(400, 73104) insuranceType 不在 5 险白名单
 * @throws AppError(400, 73102) city + insuranceType 重复
 * @throws AppError(400, 73105) companyRate/personalRate 越界
 * 校验链：
 *  1. 校验 city ∈ configs.salary.insurance.cities → 否则抛 73103
 *  2. 校验 insuranceType ∈ configs.salary.insurance.types → 否则抛 73104
 *  3. 校验 city + insuranceType 唯一 → 重复抛 73102
 *  4. 校验 companyRate/personalRate ∈ [0, 1] → 否则抛 73105
 *  5. 校验 baseMin < baseMax 且 baseMin > 0 → 否则抛 400
 *  6. 校验 baseAdjustmentMonth ∈ [1, 12]，不传则用 configs 默认 7
 *  7. 创建记录（status = active）
 *  8. 写 audit（INSURANCE_SCHEME_CREATE）
 *  注：C2 仅建配置表，不实现实际算扣（留 C3）
 */
export async function createScheme(
  actorId: string,
  input: CreateSchemeInput,
): Promise<SocialInsuranceScheme> {
  const {
    city, insuranceType, companyRate, personalRate, baseMin, baseMax,
  } = input;

  const cities = await getCities();
  if (!cities.includes(city)) {
    throw new AppError('参保城市不合法，应为 xi_an / bei_jing / si_chuan', 400, 73103);
  }
  const types = await getTypes();
  if (!types.includes(insuranceType)) {
    throw new AppError('险种不合法，应为 pension / medical / unemployment / work_injury / maternity', 400, 73104);
  }

  const existing = await prisma.socialInsuranceScheme.findUnique({
    where: {
      city_insuranceType: {
        city: city as SocialInsuranceCity,
        insuranceType: insuranceType as SocialInsuranceType,
      },
    },
  });
  if (existing) {
    throw new AppError('同城市同险种方案已存在', 400, 73102);
  }

  assertRate(companyRate, '单位比例');
  assertRate(personalRate, '个人比例');
  if (!(baseMin > 0 && baseMin < baseMax)) {
    throw new AppError('缴费基数范围不合法：baseMin 须 > 0 且 < baseMax', 400);
  }

  const month = input.baseAdjustmentMonth ?? await getAdjustMonth(city);
  if (month < 1 || month > 12) {
    throw new AppError('调基月须在 1-12 之间', 400);
  }

  const created = await prisma.socialInsuranceScheme.create({
    data: {
      city: city as SocialInsuranceCity,
      insuranceType: insuranceType as SocialInsuranceType,
      companyRate: new Decimal(companyRate),
      personalRate: new Decimal(personalRate),
      baseMin: new Decimal(baseMin),
      baseMax: new Decimal(baseMax),
      baseAdjustmentMonth: month,
      status: 'active',
      createdById: actorId,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'INSURANCE_SCHEME_CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: created.id,
    description: `创建社保方案 ${city}/${insuranceType}`,
    newValue: {
      city, insuranceType, companyRate, personalRate, baseMin, baseMax, baseAdjustmentMonth: month,
    },
  });

  return created;
}

/**
 * 列出社保方案（city / insuranceType / status 过滤 + 分页）
 */
export async function listSchemes(
  _actorId: string,
  filter: ListSchemeFilter,
): Promise<PaginatedSchemes> {
  const page = filter.page ?? 1;
  const batch = await getBatchSize();
  const pageSize = Math.min(filter.pageSize ?? 20, batch);
  if (page < 1 || pageSize < 1) {
    throw new AppError('分页参数不合法', 400);
  }

  const where: Prisma.SocialInsuranceSchemeWhereInput = {};
  if (filter.city) where.city = filter.city as SocialInsuranceCity;
  if (filter.insuranceType) where.insuranceType = filter.insuranceType as SocialInsuranceType;
  if (filter.status) {
    where.status = filter.status as Prisma.EnumSocialInsuranceStatusFilter['equals'];
  }

  const [items, total] = await Promise.all([
    prisma.socialInsuranceScheme.findMany({
      where,
      orderBy: [{ city: 'asc' }, { insuranceType: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.socialInsuranceScheme.count({ where }),
  ]);

  return {
    items, total, page, pageSize,
  };
}

/**
 * 更新社保方案（仅 active 可改 rate/base；city + insuranceType 不可改）
 * @throws AppError(400, 73101) scheme 不存在
 */
export async function updateScheme(
  actorId: string,
  id: string,
  input: UpdateSchemeInput,
): Promise<SocialInsuranceScheme> {
  const scheme = await prisma.socialInsuranceScheme.findUnique({ where: { id } });
  if (!scheme) {
    throw new AppError('社保方案不存在', 400, 73101);
  }
  if (scheme.status !== 'active') {
    throw new AppError('已归档方案不可修改', 400);
  }

  const companyRate = input.companyRate ?? toNumber(scheme.companyRate);
  const personalRate = input.personalRate ?? toNumber(scheme.personalRate);
  const baseMin = input.baseMin ?? toNumber(scheme.baseMin);
  const baseMax = input.baseMax ?? toNumber(scheme.baseMax);
  const month = input.baseAdjustmentMonth ?? scheme.baseAdjustmentMonth;
  assertRate(companyRate, '单位比例');
  assertRate(personalRate, '个人比例');
  if (!(baseMin > 0 && baseMin < baseMax)) {
    throw new AppError('缴费基数范围不合法：baseMin 须 > 0 且 < baseMax', 400);
  }
  if (month < 1 || month > 12) {
    throw new AppError('调基月须在 1-12 之间', 400);
  }

  const updated = await prisma.socialInsuranceScheme.update({
    where: { id },
    data: {
      companyRate: new Decimal(companyRate),
      personalRate: new Decimal(personalRate),
      baseMin: new Decimal(baseMin),
      baseMax: new Decimal(baseMax),
      baseAdjustmentMonth: month,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'INSURANCE_SCHEME_UPDATE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `更新社保方案 ${scheme.city}/${scheme.insuranceType}`,
    newValue: {
      companyRate, personalRate, baseMin, baseMax,
    },
  });

  return updated;
}

/**
 * 归档社保方案（active → archived，需无 active registration 关联）
 * @throws AppError(400, 73101) scheme 不存在
 * 注：不写 employee_salary_history
 */
export async function archiveScheme(actorId: string, id: string): Promise<SocialInsuranceScheme> {
  const scheme = await prisma.socialInsuranceScheme.findUnique({ where: { id } });
  if (!scheme) {
    throw new AppError('社保方案不存在', 400, 73101);
  }
  if (scheme.status !== 'active') {
    throw new AppError('方案状态非 active，无法归档', 400);
  }

  const activeRegs = await prisma.employeeInsuranceRegistration.count({
    where: { socialInsuranceSchemeId: id, status: 'active' },
  });
  if (activeRegs > 0) {
    throw new AppError('存在未失效员工登记，无法归档社保方案', 400);
  }

  const archived = await prisma.socialInsuranceScheme.update({
    where: { id },
    data: { status: 'archived' },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'INSURANCE_SCHEME_ARCHIVE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `归档社保方案 ${scheme.city}/${scheme.insuranceType}`,
  });

  return archived;
}
