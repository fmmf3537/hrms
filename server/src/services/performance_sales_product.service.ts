// M3-D5: 销售产品字典 service | HRMS
// 仅 import audit/config + prisma

import type { PerformanceSalesProduct, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'performance_sales_product';
const VALID_CATEGORIES = ['product', 'service', 'training'] as const;
const MAX_BASE_RATE = 0.5;

export type SalesProductCategory = (typeof VALID_CATEGORIES)[number];

export interface CreateProductInput {
  code: string;
  name: string;
  category: string;
  baseRate?: number;
  description?: string;
}

export interface UpdateProductInput {
  name?: string;
  category?: string;
  baseRate?: number;
  description?: string;
}

export interface ListProductFilter {
  category?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedProducts {
  items: PerformanceSalesProduct[];
  total: number;
  page: number;
  pageSize: number;
}

async function getPerfConfigNumber(key: string, fallback: number): Promise<number> {
  try {
    const v = await configService.getValue('performance', key);
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    // TODO: configs.performance.{key} 未配置时 fallback
    return fallback;
  }
}

async function getRateTiers(): Promise<Record<string, number>> {
  const fallback = { product: 0.05, service: 0.08, training: 0.03 };
  try {
    const v = await configService.getValue('performance', 'sales.commission.rate_tiers');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, number>;
    }
    return fallback;
  } catch {
    // TODO: configs.performance.sales.commission.rate_tiers 未配置时 fallback
    return fallback;
  }
}

function assertCategory(category: string): asserts category is SalesProductCategory {
  if (!VALID_CATEGORIES.includes(category as SalesProductCategory)) {
    throw new AppError('产品类别不合法，应为 product / service / training', 400);
  }
}

function assertBaseRate(baseRate: number): void {
  if (!(baseRate > 0 && baseRate <= MAX_BASE_RATE)) {
    throw new AppError('提成比例超出范围，须 > 0 且 ≤ 0.5', 400, 72803);
  }
}

/**
 * 创建销售产品/项目字典
 * @param actorId 操作人 ID（hr/admin）
 * @param input { code, name, category, baseRate, description? }
 * @returns 新创建的 performance_sales_products 记录
 * @throws AppError(400, 72802) code 重复
 * @throws AppError(400) category 不在 product / service / training
 * @throws AppError(400, 72803) baseRate ≤0 或 > 0.5
 * 校验链：
 *  1. 校验 code 唯一 → 重复抛 72802
 *  2. 校验 category ∈ {product, service, training} → 否则抛 400
 *  3. 校验 baseRate > 0 且 ≤ 0.5 → 否则抛 72803
 *  4. 创建记录（status = active）
 *  5. 写 audit（SALES_PRODUCT_CREATE）
 */
export async function createProduct(
  actorId: string,
  input: CreateProductInput,
): Promise<PerformanceSalesProduct> {
  const existing = await prisma.performanceSalesProduct.findUnique({
    where: { code: input.code },
  });
  if (existing) {
    throw new AppError('产品 code 重复', 400, 72802);
  }

  assertCategory(input.category);

  const defaultRate = await getPerfConfigNumber('sales.commission.default_rate', 0.05);
  const rateTiers = await getRateTiers();
  const baseRate = input.baseRate ?? rateTiers[input.category] ?? defaultRate;
  assertBaseRate(baseRate);

  const created = await prisma.performanceSalesProduct.create({
    data: {
      code: input.code,
      name: input.name,
      category: input.category,
      baseRate: new Decimal(baseRate),
      description: input.description ?? null,
      status: 'active',
      createdById: actorId,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALES_PRODUCT_CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: created.id,
    description: `创建销售产品 ${created.code} category=${created.category} rate=${baseRate}`,
    newValue: { code: created.code, category: created.category, baseRate },
  });

  return created;
}

/**
 * 列出销售产品（分页 + 过滤）
 * @param actorId 操作人 ID
 * @param filter { category?, status?, page, pageSize }
 * @returns { items, total, page, pageSize }
 */
export async function listProducts(
  actorId: string,
  filter: ListProductFilter,
): Promise<PaginatedProducts> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  if (page < 1 || pageSize < 1 || pageSize > 100) {
    throw new AppError('分页参数不合法', 400);
  }

  const where: Prisma.PerformanceSalesProductWhereInput = {};
  if (filter.category) {
    assertCategory(filter.category);
    where.category = filter.category;
  }
  if (filter.status) where.status = filter.status as 'active' | 'archived';

  const [items, total] = await Promise.all([
    prisma.performanceSalesProduct.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.performanceSalesProduct.count({ where }),
  ]);

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALES_LIST',
    resourceType: RESOURCE_TYPE,
    description: `查询销售产品列表 total=${total}`,
    newValue: { filter, total },
  });

  return {
    items, total, page, pageSize,
  };
}

/**
 * 更新销售产品
 * @param actorId 操作人 ID
 * @param id product ID
 * @param input { name?, category?, baseRate?, description? }
 * @returns 更新后的记录
 * @throws AppError(400, 72801) product 不存在
 * @throws AppError(400, 72803) baseRate 越界
 * 校验链：
 *  1. 查询 product → 不存在抛 72801
 *  2. status=active：可改 name/category/baseRate/description
 *  3. status=archived：所有字段不可改
 *  4. 不可改 code（code 唯一键，修改会破坏外键）
 *  5. 校验 baseRate 范围（若改）
 *  6. update + 写 audit（SALES_PRODUCT_UPDATE）
 */
export async function updateProduct(
  actorId: string,
  id: string,
  input: UpdateProductInput,
): Promise<PerformanceSalesProduct> {
  const existing = await prisma.performanceSalesProduct.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('销售产品不存在', 400, 72801);
  }
  if (existing.status === 'archived') {
    throw new AppError('已归档产品不可修改', 400);
  }

  if (input.category != null) {
    assertCategory(input.category);
  }
  if (input.baseRate != null) {
    assertBaseRate(input.baseRate);
  }

  const updated = await prisma.performanceSalesProduct.update({
    where: { id },
    data: {
      ...(input.name != null ? { name: input.name } : {}),
      ...(input.category != null ? { category: input.category } : {}),
      ...(input.baseRate != null ? { baseRate: new Decimal(input.baseRate) } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALES_PRODUCT_UPDATE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `更新销售产品 ${existing.code}`,
    oldValue: { name: existing.name, baseRate: Number(existing.baseRate) },
    newValue: input as object,
  });

  return updated;
}

/**
 * 归档销售产品（active → archived）
 * @param actorId 操作人 ID
 * @param id product ID
 * @returns 归档后的记录
 * @throws AppError(400, 72801) product 不存在
 * @throws AppError(400) 已是 archived
 */
export async function archiveProduct(
  actorId: string,
  id: string,
): Promise<PerformanceSalesProduct> {
  const existing = await prisma.performanceSalesProduct.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('销售产品不存在', 400, 72801);
  }
  if (existing.status === 'archived') {
    throw new AppError('产品已归档', 400);
  }

  const updated = await prisma.performanceSalesProduct.update({
    where: { id },
    data: { status: 'archived' },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALES_PRODUCT_UPDATE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `归档销售产品 ${existing.code}`,
    oldValue: { status: 'active' },
    newValue: { status: 'archived' },
  });

  return updated;
}
