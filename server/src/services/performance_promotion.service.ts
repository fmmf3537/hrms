// M3-D6: 晋升评估 service | HRMS
// 0 新表：记录走 audit_logs；不写 employee_position_history（留 M4）

import type { AuditLog } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RECORD_RESOURCE = 'promotion';
const AUDIT_RESOURCE = 'performance_promotion';

export interface ProposePromotionInput {
  employeeId: string;
  proposedPosition: string;
  lookbackYears?: number;
}

export interface PromotionEval {
  employeeId: string;
  aCount: number;
  sCount: number;
  requirementMet: boolean;
  lookbackYears: number;
  recordCount: number;
}

export interface PromotionResult extends PromotionEval {
  proposedPosition: string;
  auditLogId: string;
}

export interface ListPromotionFilter {
  employeeId?: string;
  id?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedPromotions {
  items: AuditLog[];
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

/**
 * 评估晋升资格（近 lookbackYears 年 archived 绩效）
 * @param actorId 操作人 ID
 * @param employeeId 员工 ID
 * @param lookbackYears 回溯年数，默认走 configs
 * @returns aCount / sCount / requirementMet
 */
export async function evaluatePromotion(
  actorId: string,
  employeeId: string,
  lookbackYears?: number,
): Promise<PromotionEval> {
  const years = lookbackYears
    ?? await getPerfConfigNumber('promotion.lookback_years', 2);
  const minA = await getPerfConfigNumber('promotion.min_a_count', 2);
  const minS = await getPerfConfigNumber('promotion.min_s_count', 1);

  const since = new Date();
  since.setFullYear(since.getFullYear() - years);

  const records = await prisma.performanceRecord.findMany({
    where: {
      employeeId,
      status: 'archived',
      createdAt: { gte: since },
    },
  });

  const aCount = records.filter((r) => r.finalGrade === 'A').length;
  const sCount = records.filter((r) => r.finalGrade === 'S').length;
  const requirementMet = aCount >= minA || sCount >= minS;

  const evalPayload = {
    employeeId, aCount, sCount, requirementMet, lookbackYears: years, recordCount: records.length,
  };

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PROMOTION_EVALUATE',
    resourceType: AUDIT_RESOURCE,
    resourceId: employeeId,
    description: `评估晋升 employee=${employeeId} met=${requirementMet}`,
    newValue: evalPayload,
  });

  return evalPayload;
}

/**
 * HR 提议晋升（基于近 2 年绩效）
 * @param actorId 操作人 ID（hr/admin）
 * @param input { employeeId, proposedPosition, lookbackYears? }
 * @throws AppError(404) employee 不存在
 * @throws AppError(400, 72905) 不满足晋升要求
 * 注：实际写入 employee_position_history 留 M4 联调
 */
export async function proposePromotion(
  actorId: string,
  input: ProposePromotionInput,
): Promise<PromotionResult> {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404);
  }

  const evaluation = await evaluatePromotion(actorId, input.employeeId, input.lookbackYears);
  if (!evaluation.requirementMet) {
    throw new AppError('不满足晋升要求（需至少 2 个 A 或 1 个 S）', 400, 72905);
  }

  const payload = {
    ...evaluation,
    proposedPosition: input.proposedPosition,
  };

  const created = await prisma.auditLog.create({
    data: {
      userId: actorId,
      actorType: 'USER',
      action: 'PROMOTION_PROPOSE',
      resourceType: RECORD_RESOURCE,
      resourceId: input.employeeId,
      description: `提议晋升 employee=${input.employeeId} → ${input.proposedPosition}`,
      newValue: payload,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PROMOTION_PROPOSE',
    resourceType: AUDIT_RESOURCE,
    resourceId: created.id,
    description: `提议晋升 employee=${input.employeeId}`,
    newValue: payload,
  });

  return {
    ...evaluation,
    proposedPosition: input.proposedPosition,
    auditLogId: created.id,
  };
}

/**
 * 列出晋升记录（从 audit_logs 查 PROMOTION_PROPOSE）
 * @throws AppError(400, 72904) 指定 id 不存在
 */
export async function listPromotions(
  actorId: string,
  filter: ListPromotionFilter,
): Promise<PaginatedPromotions> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  if (page < 1 || pageSize < 1 || pageSize > 100) {
    throw new AppError('分页参数不合法', 400);
  }

  if (filter.id) {
    const one = await prisma.auditLog.findUnique({ where: { id: filter.id } });
    if (!one || one.action !== 'PROMOTION_PROPOSE' || one.resourceType !== RECORD_RESOURCE) {
      throw new AppError('晋升记录不存在', 400, 72904);
    }
    return {
      items: [one], total: 1, page, pageSize,
    };
  }

  const where = {
    action: 'PROMOTION_PROPOSE',
    resourceType: RECORD_RESOURCE,
    ...(filter.employeeId ? { resourceId: filter.employeeId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PROMOTION_PROPOSE',
    resourceType: AUDIT_RESOURCE,
    description: `查询晋升提议列表 total=${total}`,
    newValue: { filter, total },
  });

  return {
    items, total, page, pageSize,
  };
}
