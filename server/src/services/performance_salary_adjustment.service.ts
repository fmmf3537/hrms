// M3-D6: 调薪建议 service | HRMS
// 0 新表：记录走 audit_logs；不写 employee_salary_history（留 M4）

import type { AuditLog } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RECORD_RESOURCE = 'salary_adjustment';
const AUDIT_RESOURCE = 'performance_salary_adjustment';
const PERIOD_RE = /^\d{4}-Q[1-4]$/;

export interface ProposeAdjustmentInput {
  employeeId: string;
  period: string;
}

export interface AdjustmentResult {
  employeeId: string;
  evaluationQuarters: number;
  sRatio: number;
  aRatio: number;
  adjustmentRate: number;
  totalRecords: number;
  period: string;
  auditLogId: string;
}

export interface ListAdjustmentFilter {
  employeeId?: string;
  period?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedAdjustments {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdjustmentApprovalResult {
  auditLogId: string;
  approved: boolean;
  newAuditLogId: string;
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

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * HR 提议调薪（基于近 4 季度绩效）
 * @param actorId 操作人 ID（hr/admin）
 * @param input { employeeId, period: 'YYYY-Q' }
 * @returns { employeeId, evaluationQuarters, sRatio, aRatio, adjustmentRate, auditLogId }
 * @throws AppError(404) employee 不存在
 * @throws AppError(400, 72902) period 格式错
 * 校验链：
 *  1. 校验 employee 存在 → 不存在抛 404
 *  2. 校验 period 格式（YYYY-Qn，n ∈ {1,2,3,4}）→ 否则抛 72902
 *  3. 查近 evaluation_quarters 条 archived performance_records
 *  4. 记录不足抛 400
 *  5. sRatio / aRatio 判定：≥ s_threshold → S 调 10% 优先，否则 A 调 5%，否则 0
 *  6. 写 audit_logs（SALARY_ADJUSTMENT_PROPOSE）；实际写入 employee_salary_history 留 M4
 */
export async function proposeAdjustment(
  actorId: string,
  input: ProposeAdjustmentInput,
): Promise<AdjustmentResult> {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404);
  }
  if (!PERIOD_RE.test(input.period)) {
    throw new AppError('调薪周期格式错误，应为 YYYY-Q1~Q4', 400, 72902);
  }

  const evaluationQuarters = await getPerfConfigNumber('salary_adjustment.evaluation_quarters', 4);
  const sThreshold = await getPerfConfigNumber('salary_adjustment.s_threshold', 0.5);
  const sAdjustment = await getPerfConfigNumber('salary_adjustment.s_adjustment', 0.1);
  const aAdjustment = await getPerfConfigNumber('salary_adjustment.a_adjustment', 0.05);

  const records = await prisma.performanceRecord.findMany({
    where: { employeeId: input.employeeId, status: 'archived' },
    orderBy: { archivedAt: 'desc' },
    take: evaluationQuarters,
  });
  if (records.length < evaluationQuarters) {
    throw new AppError(`归档绩效不足 ${evaluationQuarters} 个季度，无法提议调薪`, 400);
  }

  const totalRecords = records.length;
  const sCount = records.filter((r) => r.finalGrade === 'S').length;
  const aCount = records.filter((r) => r.finalGrade === 'A').length;
  const sRatio = sCount / totalRecords;
  const aRatio = aCount / totalRecords;

  let adjustmentRate = 0;
  if (sRatio >= sThreshold) {
    adjustmentRate = sAdjustment;
  } else if (aRatio >= sThreshold) {
    adjustmentRate = aAdjustment;
  }

  const payload = {
    employeeId: input.employeeId,
    period: input.period,
    evaluationQuarters,
    sRatio,
    aRatio,
    adjustmentRate,
    totalRecords,
    approvalStatus: 'proposed',
  };

  const created = await prisma.auditLog.create({
    data: {
      userId: actorId,
      actorType: 'USER',
      action: 'SALARY_ADJUSTMENT_PROPOSE',
      resourceType: RECORD_RESOURCE,
      resourceId: input.employeeId,
      description: `提议调薪 employee=${input.employeeId} rate=${adjustmentRate} period=${input.period}`,
      newValue: payload,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_ADJUSTMENT_PROPOSE',
    resourceType: AUDIT_RESOURCE,
    resourceId: created.id,
    description: `提议调薪 employee=${input.employeeId} rate=${adjustmentRate}`,
    newValue: payload,
  });

  return {
    employeeId: input.employeeId,
    evaluationQuarters,
    sRatio,
    aRatio,
    adjustmentRate,
    totalRecords,
    period: input.period,
    auditLogId: created.id,
  };
}

/**
 * 列出调薪记录（从 audit_logs 查 SALARY_ADJUSTMENT_PROPOSE）
 * @param actorId 操作人 ID
 * @param filter { employeeId?, period?, page, pageSize }
 */
export async function listAdjustments(
  actorId: string,
  filter: ListAdjustmentFilter,
): Promise<PaginatedAdjustments> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  if (page < 1 || pageSize < 1 || pageSize > 100) {
    throw new AppError('分页参数不合法', 400);
  }
  if (filter.period && !PERIOD_RE.test(filter.period)) {
    throw new AppError('调薪周期格式错误，应为 YYYY-Q1~Q4', 400, 72902);
  }

  const where = {
    action: 'SALARY_ADJUSTMENT_PROPOSE',
    resourceType: RECORD_RESOURCE,
    ...(filter.employeeId ? { resourceId: filter.employeeId } : {}),
  };

  const [rawItems, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const items = filter.period
    ? rawItems.filter((row) => asRecord(row.newValue).period === filter.period)
    : rawItems;

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_ADJUSTMENT_PROPOSE',
    resourceType: AUDIT_RESOURCE,
    description: `查询调薪提议列表 total=${total}`,
    newValue: { filter, total },
  });

  return {
    items, total, page, pageSize,
  };
}

/**
 * executive 审批调薪（approved=true/false）
 * @param actorId 操作人 ID
 * @param auditLogId 提议 audit_logs.id
 * @param input { approved, comment? }
 * @throws AppError(400, 72901) 不存在
 * @throws AppError(400, 72903) 已审批
 * 注：实际写入 employee_salary_history 留 M4 联调
 */
export async function approveAdjustment(
  actorId: string,
  auditLogId: string,
  input: { approved: boolean; comment?: string },
): Promise<AdjustmentApprovalResult> {
  const original = await prisma.auditLog.findUnique({ where: { id: auditLogId } });
  if (!original || original.action !== 'SALARY_ADJUSTMENT_PROPOSE') {
    throw new AppError('调薪记录不存在', 400, 72901);
  }

  const already = await prisma.auditLog.findFirst({
    where: {
      resourceId: auditLogId,
      action: { in: ['SALARY_ADJUSTMENT_APPROVE', 'SALARY_ADJUSTMENT_REJECT'] },
      resourceType: RECORD_RESOURCE,
    },
  });
  if (already) {
    throw new AppError('该调薪提议已审批', 400, 72903);
  }

  const action = input.approved ? 'SALARY_ADJUSTMENT_APPROVE' : 'SALARY_ADJUSTMENT_REJECT';
  const payload = {
    originalAuditLogId: auditLogId,
    approved: input.approved,
    comment: input.comment ?? null,
    approvalStatus: input.approved ? 'approved' : 'rejected',
    employeeId: original.resourceId,
  };

  const created = await prisma.auditLog.create({
    data: {
      userId: actorId,
      actorType: 'USER',
      action,
      resourceType: RECORD_RESOURCE,
      resourceId: auditLogId,
      description: `${input.approved ? '批准' : '拒绝'}调薪提议 ${auditLogId}`,
      newValue: payload,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action,
    resourceType: AUDIT_RESOURCE,
    resourceId: created.id,
    description: `${input.approved ? '批准' : '拒绝'}调薪提议`,
    newValue: payload,
  });

  return {
    auditLogId,
    approved: input.approved,
    newAuditLogId: created.id,
  };
}

/**
 * executive 拒绝调薪（复用 approveAdjustment）
 */
export async function rejectAdjustment(
  actorId: string,
  auditLogId: string,
  input: { comment?: string },
): Promise<AdjustmentApprovalResult> {
  return approveAdjustment(actorId, auditLogId, { approved: false, comment: input.comment });
}
