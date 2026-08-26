// M3-D1: 指标库 service | HRMS
// 仅 import audit/config + prisma

import type { PerformanceIndicator, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'performance_indicator';

const DEFAULT_INDICATOR_TYPES = ['KPI', 'OKR', 'BSC', '360'];
const DEFAULT_MAX_WEIGHT = 100;

export interface CreateIndicatorInput {
  code: string;
  name: string;
  type: string;
  category?: string;
  description?: string;
  defaultWeight?: number;
  target?: string;
  unit?: string;
  scoringRule?: string;
}

export interface UpdateIndicatorInput {
  name?: string;
  category?: string;
  description?: string;
  defaultWeight?: number;
  target?: string;
  unit?: string;
  scoringRule?: string;
}

export interface ListIndicatorFilter {
  type?: string;
  status?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

async function getIndicatorTypes(): Promise<string[]> {
  try {
    const v = await configService.getValue('performance', 'indicator.types');
    if (Array.isArray(v) && v.length > 0) return v.map(String);
    return [...DEFAULT_INDICATOR_TYPES];
  } catch {
    return [...DEFAULT_INDICATOR_TYPES];
  }
}

async function getMaxWeight(): Promise<number> {
  try {
    const v = await configService.getValue('performance', 'indicator.max_weight');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : DEFAULT_MAX_WEIGHT;
  } catch {
    return DEFAULT_MAX_WEIGHT;
  }
}

function assertWeight(weight: number, maxWeight: number): void {
  if (weight <= 0 || weight > maxWeight) {
    throw new AppError('权重超出范围', 400, 72408);
  }
}

/**
 * 创建绩效指标
 */
export async function createPerformanceIndicator(
  actorId: string,
  input: CreateIndicatorInput,
): Promise<PerformanceIndicator> {
  const existing = await prisma.performanceIndicator.findUnique({
    where: { code: input.code },
  });
  if (existing) {
    throw new AppError('指标 code 重复', 400, 72406);
  }

  const allowedTypes = await getIndicatorTypes();
  if (!allowedTypes.includes(input.type)) {
    throw new AppError('指标类型不合法', 400, 72407);
  }

  const maxWeight = await getMaxWeight();
  if (input.defaultWeight != null) {
    assertWeight(input.defaultWeight, maxWeight);
  }

  const created = await prisma.performanceIndicator.create({
    data: {
      code: input.code,
      name: input.name,
      type: input.type,
      category: input.category ?? null,
      description: input.description ?? null,
      defaultWeight: input.defaultWeight != null ? new Decimal(input.defaultWeight) : null,
      target: input.target ?? null,
      unit: input.unit ?? null,
      scoringRule: input.scoringRule ?? null,
      status: 'active',
      createdBy: actorId,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: created.id,
    description: `创建绩效指标 ${created.code}`,
    newValue: { code: created.code, type: created.type },
  });

  return created;
}

/**
 * 列出绩效指标
 */
export async function listPerformanceIndicators(
  _actorId: string,
  filter: ListIndicatorFilter,
): Promise<{ items: PerformanceIndicator[]; total: number; page: number; pageSize: number }> {
  const page = filter.page && filter.page >= 1 ? filter.page : 1;
  const pageSize = filter.pageSize && filter.pageSize >= 1 && filter.pageSize <= 100
    ? filter.pageSize
    : 20;

  const where: Prisma.PerformanceIndicatorWhereInput = {
    status: filter.status ?? 'active',
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.category ? { category: filter.category } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.performanceIndicator.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.performanceIndicator.count({ where }),
  ]);

  return {
    items, total, page, pageSize,
  };
}

/**
 * 更新绩效指标
 */
export async function updatePerformanceIndicator(
  actorId: string,
  id: string,
  input: UpdateIndicatorInput,
): Promise<PerformanceIndicator> {
  const existing = await prisma.performanceIndicator.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('绩效指标不存在', 404, 72407);
  }
  if (existing.status === 'archived') {
    throw new AppError('指标已归档，不可修改', 400, 72404);
  }

  const maxWeight = await getMaxWeight();
  if (input.defaultWeight != null) {
    assertWeight(input.defaultWeight, maxWeight);
  }

  const updated = await prisma.performanceIndicator.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.defaultWeight != null ? { defaultWeight: new Decimal(input.defaultWeight) } : {}),
      ...(input.target !== undefined ? { target: input.target } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.scoringRule !== undefined ? { scoringRule: input.scoringRule } : {}),
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'UPDATE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `更新绩效指标 ${existing.code}`,
    newValue: input as object,
  });

  return updated;
}

/**
 * 归档指标（active → archived）
 */
export async function archivePerformanceIndicator(
  actorId: string,
  id: string,
): Promise<PerformanceIndicator> {
  const existing = await prisma.performanceIndicator.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('绩效指标不存在', 404, 72407);
  }
  if (existing.status === 'archived') {
    throw new AppError('指标已归档', 400, 72404);
  }

  const updated = await prisma.performanceIndicator.update({
    where: { id },
    data: { status: 'archived' },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'ARCHIVE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `归档绩效指标 ${existing.code}`,
    oldValue: { status: 'active' },
    newValue: { status: 'archived' },
  });

  return updated;
}
