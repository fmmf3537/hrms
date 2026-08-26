// M3-D1: 考核周期 service | HRMS
// 仅 import audit/config + prisma

import type { PerformanceCycle, Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'performance_cycle';

const DEFAULT_CYCLE_TYPES = ['monthly', 'quarterly', 'yearly'];

export interface CreateCycleInput {
  code: string;
  name: string;
  type: string;
  startDate: Date | string;
  endDate: Date | string;
  description?: string;
}

export interface UpdateCycleInput {
  code?: string;
  name?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  description?: string;
  status?: string;
}

export interface ListCycleFilter {
  type?: string;
  status?: string;
  year?: number;
  page?: number;
  pageSize?: number;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

async function getCycleTypes(): Promise<string[]> {
  try {
    const v = await configService.getValue('performance', 'cycle.types');
    if (Array.isArray(v) && v.length > 0) return v.map(String);
    return [...DEFAULT_CYCLE_TYPES];
  } catch {
    // TODO: performance.cycle.types 入库后去掉 fallback
    return [...DEFAULT_CYCLE_TYPES];
  }
}

function assertDateRange(start: Date, end: Date): void {
  if (start.getTime() >= end.getTime()) {
    throw new AppError('日期范围错误', 400, 72402);
  }
}

/**
 * 创建考核周期
 */
export async function createPerformanceCycle(
  actorId: string,
  input: CreateCycleInput,
): Promise<PerformanceCycle> {
  const existing = await prisma.performanceCycle.findUnique({
    where: { code: input.code },
  });
  if (existing) {
    throw new AppError('周期 code 重复', 400, 72401);
  }

  const allowedTypes = await getCycleTypes();
  if (!allowedTypes.includes(input.type)) {
    throw new AppError('周期类型不合法', 400, 72403);
  }

  const startDate = toDate(input.startDate);
  const endDate = toDate(input.endDate);
  assertDateRange(startDate, endDate);

  const created = await prisma.performanceCycle.create({
    data: {
      code: input.code,
      name: input.name,
      type: input.type,
      startDate,
      endDate,
      status: 'draft',
      description: input.description ?? null,
      createdBy: actorId,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: created.id,
    description: `创建考核周期 ${created.code}`,
    newValue: { code: created.code, type: created.type },
  });

  return created;
}

/**
 * 列出考核周期（分页 + 过滤）
 */
export async function listPerformanceCycles(
  _actorId: string,
  filter: ListCycleFilter,
): Promise<{ items: PerformanceCycle[]; total: number; page: number; pageSize: number }> {
  const page = filter.page && filter.page >= 1 ? filter.page : 1;
  const pageSize = filter.pageSize && filter.pageSize >= 1 && filter.pageSize <= 100
    ? filter.pageSize
    : 20;

  const where: Prisma.PerformanceCycleWhereInput = {
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.year
      ? {
        startDate: {
          gte: new Date(filter.year, 0, 1),
          lte: new Date(filter.year, 11, 31),
        },
      }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.performanceCycle.findMany({
      where,
      orderBy: { startDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.performanceCycle.count({ where }),
  ]);

  return {
    items, total, page, pageSize,
  };
}

/**
 * 关闭考核周期（active → closed）
 */
export async function closePerformanceCycle(
  actorId: string,
  id: string,
): Promise<PerformanceCycle> {
  const existing = await prisma.performanceCycle.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('考核周期不存在', 404, 72404);
  }
  if (existing.status !== 'active') {
    throw new AppError('当前状态不允许此操作', 400, 72404);
  }

  // TODO: D2 关闭前校验 performance_scores 归档

  const updated = await prisma.performanceCycle.update({
    where: { id },
    data: { status: 'closed' },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'CLOSE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `关闭考核周期 ${existing.code}`,
    oldValue: { status: 'active' },
    newValue: { status: 'closed' },
  });

  return updated;
}

/**
 * 更新考核周期
 */
export async function updatePerformanceCycle(
  actorId: string,
  id: string,
  input: UpdateCycleInput,
): Promise<PerformanceCycle> {
  const existing = await prisma.performanceCycle.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('考核周期不存在', 404, 72404);
  }

  if (existing.status === 'closed') {
    throw new AppError('当前状态不允许此操作', 400, 72404);
  }

  if (existing.status === 'active') {
    if (input.code || input.name || input.startDate || input.endDate || input.status) {
      if (input.status === 'closed') {
        return closePerformanceCycle(actorId, id);
      }
      throw new AppError('当前状态不允许此操作', 400, 72404);
    }
  }

  if (input.code && input.code !== existing.code) {
    const dup = await prisma.performanceCycle.findUnique({ where: { code: input.code } });
    if (dup) throw new AppError('周期 code 重复', 400, 72401);
  }

  const startDate = input.startDate ? toDate(input.startDate) : existing.startDate;
  const endDate = input.endDate ? toDate(input.endDate) : existing.endDate;
  if (input.startDate || input.endDate) {
    assertDateRange(startDate, endDate);
  }

  const updated = await prisma.performanceCycle.update({
    where: { id },
    data: {
      ...(input.code ? { code: input.code } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.startDate ? { startDate } : {}),
      ...(input.endDate ? { endDate } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status === 'active' && existing.status === 'draft' ? { status: 'active' } : {}),
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'UPDATE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `更新考核周期 ${updated.code}`,
    oldValue: { status: existing.status },
    newValue: input as object,
  });

  return updated;
}
