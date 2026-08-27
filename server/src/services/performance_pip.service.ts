// M3-D6: PIP 触发 service | HRMS
// 仅 import audit/config + prisma；失败不调 A6 离职 service

import type { PerformancePip, PerformancePipReview, Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'performance_pip';
const VALID_RATINGS = ['improved', 'no_change', 'worsened'] as const;

export type PipReviewRating = (typeof VALID_RATINGS)[number];

export interface ListPipFilter {
  employeeId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedPips {
  items: PerformancePip[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReviewPipResult {
  review: PerformancePipReview;
  pip: PerformancePip;
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

async function getPerfConfigString(key: string, fallback: string): Promise<string> {
  try {
    const v = await configService.getValue('performance', key);
    return typeof v === 'string' && v.length > 0 ? v : fallback;
  } catch {
    // TODO: configs.performance.{key} 未配置时 fallback
    return fallback;
  }
}

async function getPerfConfigBoolean(key: string, fallback: boolean): Promise<boolean> {
  try {
    const v = await configService.getValue('performance', key);
    if (typeof v === 'boolean') return v;
    return fallback;
  } catch {
    // TODO: configs.performance.{key} 未配置时 fallback
    return fallback;
  }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

/**
 * 触发 PIP（连续 N 季度 D 档）
 * @param actorId 操作人 ID（hr/admin）
 * @param employeeId 员工 ID
 * @param reason 触发原因
 * @throws AppError(404) employee 不存在
 * @throws AppError(400, 72907) 已有 active PIP
 * @throws AppError(400, 72908) 连续 D 档不满足
 * 注：自动 PIP 触发留 BullMQ；D6 仅手动触发
 */
export async function triggerPip(
  actorId: string,
  employeeId: string,
  reason: string,
): Promise<PerformancePip> {
  if (!reason || reason.trim().length < 5) {
    throw new AppError('PIP 触发原因必填且不少于 5 个字符', 400);
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404);
  }

  const activePip = await prisma.performancePip.findFirst({
    where: { employeeId, status: 'active' },
  });
  if (activePip) {
    throw new AppError('员工已有进行中的 PIP', 400, 72907);
  }

  const dGradeQuarters = await getPerfConfigNumber('pip.d_grade_quarters', 2);
  const durationMonths = await getPerfConfigNumber('pip.duration_months', 3);
  await getPerfConfigString('pip.review_frequency', 'monthly');
  await getPerfConfigBoolean('pip.training_required', true);

  const records = await prisma.performanceRecord.findMany({
    where: { employeeId, status: 'archived' },
    orderBy: { archivedAt: 'desc' },
    take: dGradeQuarters,
  });

  const allD = records.length === dGradeQuarters && records.every((r) => r.finalGrade === 'D');
  if (!allD) {
    throw new AppError('连续 D 档不满足，无法触发 PIP', 400, 72908);
  }

  const startDate = startOfDay(new Date());
  const endDate = addMonths(startDate, durationMonths);

  const pip = await prisma.performancePip.create({
    data: {
      employeeId,
      startDate,
      endDate,
      status: 'active',
      reason: reason.trim(),
      triggeredBy: actorId,
      createdById: actorId,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PIP_TRIGGER',
    resourceType: RESOURCE_TYPE,
    resourceId: pip.id,
    description: `触发 PIP employee=${employeeId}`,
    newValue: {
      employeeId, dGradeQuarters, recordCount: records.length, startDate, endDate, reason: reason.trim(),
    },
  });

  return pip;
}

/**
 * 列出 PIP 记录（分页 + 过滤）
 */
export async function listPips(
  actorId: string,
  filter: ListPipFilter,
): Promise<PaginatedPips> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  if (page < 1 || pageSize < 1 || pageSize > 100) {
    throw new AppError('分页参数不合法', 400);
  }

  const where: Prisma.PerformancePipWhereInput = {};
  if (filter.employeeId) where.employeeId = filter.employeeId;
  if (filter.status) {
    where.status = filter.status as 'active' | 'completed' | 'failed' | 'cancelled';
  }

  const [items, total] = await Promise.all([
    prisma.performancePip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { reviews: true },
    }),
    prisma.performancePip.count({ where }),
  ]);

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PIP_TRIGGER',
    resourceType: RESOURCE_TYPE,
    description: `查询 PIP 列表 total=${total}`,
    newValue: { filter, total },
  });

  return {
    items, total, page, pageSize,
  };
}

/**
 * PIP 月度评审
 * @throws AppError(400, 72906) pip 不存在
 * @throws AppError(400, 72910) 状态非 active
 * @throws AppError(400, 72909) 逾期漏评审
 * 注：rating=worsened 仅 audit + 标记 failed，不调 A6 离职 service
 */
export async function reviewPip(
  actorId: string,
  pipId: string,
  input: { rating: string; comment?: string },
): Promise<ReviewPipResult> {
  if (!VALID_RATINGS.includes(input.rating as PipReviewRating)) {
    throw new AppError('评审评级不合法', 400);
  }
  const rating = input.rating as PipReviewRating;

  const pip = await prisma.performancePip.findUnique({ where: { id: pipId } });
  if (!pip) {
    throw new AppError('PIP 记录不存在', 400, 72906);
  }
  if (pip.status !== 'active') {
    throw new AppError('PIP 状态不允许评审', 400, 72910);
  }

  const now = new Date();
  if (now > pip.endDate) {
    throw new AppError('PIP 期间漏评审或已逾期', 400, 72909);
  }

  const reviewCount = await prisma.performancePipReview.count({ where: { pipId } });
  if (reviewCount >= 3) {
    const completed = await prisma.performancePip.update({
      where: { id: pipId },
      data: { status: 'completed', outcome: 'PIP 通过' },
    });
    const last = await prisma.performancePipReview.findFirst({
      where: { pipId },
      orderBy: { reviewMonth: 'desc' },
    });
    if (!last) {
      throw new AppError('PIP 评审记录缺失', 400, 72909);
    }
    return { review: last, pip: completed };
  }

  const nextMonth = reviewCount + 1;
  const review = await prisma.performancePipReview.create({
    data: {
      pipId,
      reviewMonth: nextMonth,
      reviewDate: startOfDay(now),
      rating,
      comment: input.comment ?? null,
      reviewerId: actorId,
    },
  });

  let nextStatus: 'active' | 'completed' | 'failed' = 'active';
  let { outcome } = pip;
  if (rating === 'worsened') {
    nextStatus = 'failed';
    outcome = `reviewMonth ${nextMonth} 评级 worsened`;
  } else if (nextMonth === 3) {
    nextStatus = 'completed';
    outcome = 'PIP 通过';
  }

  const updated = await prisma.performancePip.update({
    where: { id: pipId },
    data: { status: nextStatus, outcome },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PIP_REVIEW',
    resourceType: 'performance_pip_review',
    resourceId: review.id,
    description: `PIP 月度评审 month=${nextMonth} rating=${rating}`,
    newValue: {
      pipId, reviewMonth: nextMonth, rating, comment: input.comment ?? null, reviewerId: actorId,
    },
  });

  if (rating === 'worsened') {
    await auditService.auditLog({
      userId: actorId,
      actorType: 'SYSTEM',
      action: 'PIP_FAIL_TRIGGER_OFFBOARDING',
      resourceType: 'offboarding',
      resourceId: pip.employeeId,
      description: 'PIP 失败，建议启动离职流程（实际启动留独立任务）',
      newValue: { pipId, employeeId: pip.employeeId, reviewMonth: nextMonth },
    });
  }

  return { review, pip: updated };
}

/**
 * 手动完成 PIP（active → completed）
 */
export async function completePip(
  actorId: string,
  pipId: string,
  outcome: string,
): Promise<PerformancePip> {
  const pip = await prisma.performancePip.findUnique({ where: { id: pipId } });
  if (!pip) {
    throw new AppError('PIP 记录不存在', 400, 72906);
  }
  if (pip.status !== 'active') {
    throw new AppError('PIP 状态不允许完成', 400, 72910);
  }

  const updated = await prisma.performancePip.update({
    where: { id: pipId },
    data: { status: 'completed', outcome: outcome || 'PIP 通过' },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PIP_REVIEW',
    resourceType: RESOURCE_TYPE,
    resourceId: pipId,
    description: `手动完成 PIP ${pipId}`,
    newValue: { outcome: updated.outcome },
  });

  return updated;
}

/**
 * 手动标记 PIP 失败（active → failed）
 * 注：仅 audit + 标记，启动离职流程留独立任务
 */
export async function failPip(
  actorId: string,
  pipId: string,
  reason: string,
): Promise<PerformancePip> {
  const pip = await prisma.performancePip.findUnique({ where: { id: pipId } });
  if (!pip) {
    throw new AppError('PIP 记录不存在', 400, 72906);
  }
  if (pip.status !== 'active') {
    throw new AppError('PIP 状态不允许标记失败', 400, 72910);
  }

  const updated = await prisma.performancePip.update({
    where: { id: pipId },
    data: { status: 'failed', outcome: reason },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'SYSTEM',
    action: 'PIP_FAIL_TRIGGER_OFFBOARDING',
    resourceType: 'offboarding',
    resourceId: pip.employeeId,
    description: 'PIP 失败，建议启动离职流程（实际启动留独立任务）',
    newValue: { pipId, employeeId: pip.employeeId, reason },
  });

  return updated;
}
