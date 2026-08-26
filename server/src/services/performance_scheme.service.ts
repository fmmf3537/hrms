// M3-D1: 考核方案 service | HRMS
// 仅 import audit/config + prisma

import type { PerformanceScheme, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'performance_scheme';

const DEFAULT_SCOPES = ['company', 'department', 'position'];

export interface SchemeIndicatorInput {
  indicatorId: string;
  weight: number;
  target?: string;
  sortOrder?: number;
}

export interface CreateSchemeInput {
  code: string;
  name: string;
  cycleId?: string;
  applicableScope: string;
  applicableDeptId?: string;
  applicablePositionLevel?: string;
  description?: string;
  indicators: SchemeIndicatorInput[];
}

export interface UpdateSchemeInput {
  name?: string;
  cycleId?: string | null;
  description?: string;
  indicators?: SchemeIndicatorInput[];
}

export interface ListSchemeFilter {
  cycleId?: string;
  status?: string;
  applicableScope?: string;
  page?: number;
  pageSize?: number;
}

export type PerformanceSchemeWithIndicators = PerformanceScheme & {
  indicators: Array<{
    id: string;
    indicatorId: string;
    weight: Decimal;
    target: string | null;
    sortOrder: number;
  }>;
};

async function getApplicableScopes(): Promise<string[]> {
  try {
    const v = await configService.getValue('performance', 'scheme.applicable_scope');
    if (Array.isArray(v) && v.length > 0) return v.map(String);
    return [...DEFAULT_SCOPES];
  } catch {
    return [...DEFAULT_SCOPES];
  }
}

function assertWeightSum100(weights: number[]): void {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 0.01) {
    throw new AppError('方案指标权重之和必须等于 100', 400, 72409);
  }
}

function validateScopeFields(
  scope: string,
  applicableDeptId?: string | null,
  applicablePositionLevel?: string | null,
): void {
  if (scope === 'company') {
    if (applicableDeptId || applicablePositionLevel) {
      throw new AppError('公司范围方案不可指定部门或岗位', 400, 72411);
    }
    return;
  }
  if (scope === 'department') {
    if (!applicableDeptId || applicablePositionLevel) {
      throw new AppError('部门范围方案必须指定部门', 400, 72411);
    }
    return;
  }
  if (scope === 'position') {
    if (!applicablePositionLevel || applicableDeptId) {
      throw new AppError('岗位范围方案必须指定岗位级别', 400, 72411);
    }
    return;
  }
  throw new AppError('方案适用范围不合法', 400, 72411);
}

async function validateIndicators(indicatorIds: string[]): Promise<void> {
  if (indicatorIds.length === 0) {
    throw new AppError('方案至少包含 1 个指标', 400, 72412);
  }
  const indicators = await prisma.performanceIndicator.findMany({
    where: { id: { in: indicatorIds }, status: 'active' },
  });
  if (indicators.length !== indicatorIds.length) {
    throw new AppError('指标不存在或已归档', 400, 72412);
  }
}

/**
 * 创建考核方案（含指标 + 权重）
 */
export async function createPerformanceScheme(
  actorId: string,
  input: CreateSchemeInput,
): Promise<PerformanceSchemeWithIndicators> {
  const scopes = await getApplicableScopes();
  if (!scopes.includes(input.applicableScope)) {
    throw new AppError('方案适用范围不合法', 400, 72411);
  }

  validateScopeFields(
    input.applicableScope,
    input.applicableDeptId,
    input.applicablePositionLevel,
  );

  const dup = await prisma.performanceScheme.findUnique({ where: { code: input.code } });
  if (dup) {
    throw new AppError('方案 code 重复', 400, 72406);
  }

  if (input.cycleId) {
    const cycle = await prisma.performanceCycle.findUnique({ where: { id: input.cycleId } });
    if (!cycle) throw new AppError('考核周期不存在', 404, 72404);
  }

  if (input.applicableDeptId) {
    const dept = await prisma.department.findUnique({ where: { id: input.applicableDeptId } });
    if (!dept) throw new AppError('部门不存在', 404, 72411);
  }

  assertWeightSum100(input.indicators.map((i) => i.weight));
  await validateIndicators(input.indicators.map((i) => i.indicatorId));

  const created = await prisma.$transaction(async (tx) => {
    const scheme = await tx.performanceScheme.create({
      data: {
        code: input.code,
        name: input.name,
        cycleId: input.cycleId ?? null,
        applicableScope: input.applicableScope,
        applicableDeptId: input.applicableDeptId ?? null,
        applicablePositionLevel: input.applicablePositionLevel ?? null,
        status: 'draft',
        description: input.description ?? null,
        version: 1,
        createdBy: actorId,
      },
    });

    await tx.performanceSchemeIndicator.createMany({
      data: input.indicators.map((ind, idx) => ({
        schemeId: scheme.id,
        indicatorId: ind.indicatorId,
        weight: new Decimal(ind.weight),
        target: ind.target ?? null,
        sortOrder: ind.sortOrder ?? idx,
      })),
    });

    const indicators = await tx.performanceSchemeIndicator.findMany({
      where: { schemeId: scheme.id },
      orderBy: { sortOrder: 'asc' },
    });

    return { ...scheme, indicators };
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: created.id,
    description: `创建考核方案 ${created.code}`,
    newValue: { code: created.code, indicatorCount: input.indicators.length },
  });

  return created;
}

/**
 * 列出考核方案
 */
export async function listPerformanceSchemes(
  _actorId: string,
  filter: ListSchemeFilter,
): Promise<{ items: PerformanceSchemeWithIndicators[]; total: number; page: number; pageSize: number }> {
  const page = filter.page && filter.page >= 1 ? filter.page : 1;
  const pageSize = filter.pageSize && filter.pageSize >= 1 && filter.pageSize <= 100
    ? filter.pageSize
    : 20;

  const where: Prisma.PerformanceSchemeWhereInput = {
    ...(filter.cycleId ? { cycleId: filter.cycleId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.applicableScope ? { applicableScope: filter.applicableScope } : {}),
  };

  const [schemes, total] = await Promise.all([
    prisma.performanceScheme.findMany({
      where,
      include: { indicators: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.performanceScheme.count({ where }),
  ]);

  return {
    items: schemes, total, page, pageSize,
  };
}

/**
 * 更新考核方案
 */
export async function updatePerformanceScheme(
  actorId: string,
  id: string,
  input: UpdateSchemeInput,
): Promise<PerformanceSchemeWithIndicators> {
  const existing = await prisma.performanceScheme.findUnique({
    where: { id },
    include: { indicators: true },
  });
  if (!existing) {
    throw new AppError('考核方案不存在', 404, 72404);
  }
  if (existing.status === 'archived') {
    throw new AppError('方案已归档，不可修改', 400, 72404);
  }
  if (existing.status === 'active' && input.indicators) {
    throw new AppError('生效方案不可修改指标', 400, 72404);
  }

  if (input.indicators) {
    assertWeightSum100(input.indicators.map((i) => i.weight));
    await validateIndicators(input.indicators.map((i) => i.indicatorId));
  }

  if (input.cycleId) {
    const cycle = await prisma.performanceCycle.findUnique({ where: { id: input.cycleId } });
    if (!cycle) throw new AppError('考核周期不存在', 404, 72404);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.indicators && existing.status === 'draft') {
      await tx.performanceSchemeIndicator.deleteMany({ where: { schemeId: id } });
      await tx.performanceSchemeIndicator.createMany({
        data: input.indicators.map((ind, idx) => ({
          schemeId: id,
          indicatorId: ind.indicatorId,
          weight: new Decimal(ind.weight),
          target: ind.target ?? null,
          sortOrder: ind.sortOrder ?? idx,
        })),
      });
    }

    const scheme = await tx.performanceScheme.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.cycleId !== undefined ? { cycleId: input.cycleId } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      include: { indicators: { orderBy: { sortOrder: 'asc' } } },
    });

    return scheme;
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'UPDATE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `更新考核方案 ${existing.code}`,
    newValue: input as object,
  });

  return updated;
}

/**
 * 复制考核方案（deep copy 含中间表）
 */
export async function clonePerformanceScheme(
  actorId: string,
  id: string,
  newCode: string,
  newName: string,
): Promise<PerformanceSchemeWithIndicators> {
  const source = await prisma.performanceScheme.findUnique({
    where: { id },
    include: { indicators: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!source) {
    throw new AppError('源方案不存在', 404, 72404);
  }

  const dup = await prisma.performanceScheme.findUnique({ where: { code: newCode } });
  if (dup) {
    throw new AppError('方案 code 重复', 400, 72406);
  }

  // TODO: configs.performance.scheme.clone_strategy shallow 策略留 D2
  const cloned = await prisma.$transaction(async (tx) => {
    const scheme = await tx.performanceScheme.create({
      data: {
        code: newCode,
        name: newName,
        cycleId: source.cycleId,
        applicableScope: source.applicableScope,
        applicableDeptId: source.applicableDeptId,
        applicablePositionLevel: source.applicablePositionLevel,
        status: 'draft',
        description: source.description,
        version: 1,
        sourceSchemeId: source.id,
        createdBy: actorId,
      },
    });

    await tx.performanceSchemeIndicator.createMany({
      data: source.indicators.map((ind) => ({
        schemeId: scheme.id,
        indicatorId: ind.indicatorId,
        weight: ind.weight,
        target: ind.target,
        sortOrder: ind.sortOrder,
      })),
    });

    const indicators = await tx.performanceSchemeIndicator.findMany({
      where: { schemeId: scheme.id },
      orderBy: { sortOrder: 'asc' },
    });

    return { ...scheme, indicators };
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'CLONE',
    resourceType: RESOURCE_TYPE,
    resourceId: cloned.id,
    description: `复制考核方案 ${source.code} → ${newCode}`,
    newValue: { sourceSchemeId: id, newCode },
  });

  return cloned;
}
