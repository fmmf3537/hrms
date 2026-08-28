// M4-C8: 调薪记录查询 + 取消 + 统计（仅读/更新 salary_adjustments 状态机）| HRMS

import type {
  Prisma, SalaryAdjustment, SalaryAdjustmentStatus, SalaryAdjustmentType,
} from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';

const RESOURCE_TYPE = 'salary_adjustment';
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const PRIVILEGED_ROLES = new Set(['admin', 'hr', 'executive']);
const CANCELABLE = new Set(['draft', 'pending']);

export interface ListAdjustmentFilter {
  employeeId?: string;
  status?: string;
  adjustmentType?: string;
  period?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedAdjustments {
  items: SalaryAdjustment[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdjustmentSummary {
  period: string;
  byStatus: Record<string, { count: number; totalDelta: number }>;
  byType: Record<string, { count: number; totalDelta: number }>;
  totalDelta: number;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null && 'toString' in v) {
    const n = Number((v as { toString(): string }).toString());
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function assertPeriod(period: string): void {
  if (!PERIOD_RE.test(period)) {
    throw new AppError('period 格式错，应为 YYYY-MM', 400, 73805);
  }
}

function periodRange(period: string): { start: Date; end: Date } {
  const [ys, ms] = period.split('-');
  const y = Number(ys);
  const m = Number(ms);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
  };
}

interface ActorScope {
  unrestricted: boolean;
  deptId?: string;
  selfEmployeeId?: string;
}

async function actorScope(actorId: string): Promise<ActorScope> {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    include: {
      userRoles: { include: { role: { select: { code: true } } } },
      employee: { select: { id: true, departmentId: true } },
    },
  });
  if (!user) return { unrestricted: false };
  const codes = user.userRoles.map((ur) => ur.role.code);
  if (codes.some((c) => PRIVILEGED_ROLES.has(c))) {
    return { unrestricted: true };
  }
  if (codes.includes('dept_head')) {
    return { unrestricted: false, deptId: user.employee?.departmentId ?? undefined };
  }
  return { unrestricted: false, selfEmployeeId: user.employee?.id };
}

async function applyScope(
  scope: ActorScope,
  where: Prisma.SalaryAdjustmentWhereInput,
): Promise<Prisma.SalaryAdjustmentWhereInput> {
  if (scope.unrestricted) return where;
  if (scope.selfEmployeeId) {
    return { ...where, employeeId: scope.selfEmployeeId };
  }
  if (scope.deptId) {
    const emps = await prisma.employee.findMany({
      where: { departmentId: scope.deptId },
      select: { id: true },
    });
    const ids = emps.map((e) => e.id);
    return { ...where, employeeId: { in: ids } };
  }
  return { ...where, employeeId: { in: [] } };
}

/**
 * 调薪记录列表查询
 * @param actorId 操作人 ID
 * @param filter { employeeId?, status?, adjustmentType?, period?, page?, pageSize? }
 * @returns { items, total, page, pageSize }
 * 校验链：分页 → 过滤 → 权限（employee 仅看自己 / dept_head 仅看本部门）→ 排序 → audit
 */
export async function listAdjustments(
  actorId: string,
  filter: ListAdjustmentFilter,
): Promise<PaginatedAdjustments> {
  const page = filter.page && filter.page >= 1 ? filter.page : 1;
  const pageSize = filter.pageSize && filter.pageSize >= 1 && filter.pageSize <= 100
    ? filter.pageSize
    : 20;

  let where: Prisma.SalaryAdjustmentWhereInput = {};
  if (filter.employeeId) where.employeeId = filter.employeeId;
  if (filter.status) where.status = filter.status as SalaryAdjustmentStatus;
  if (filter.adjustmentType) {
    where.adjustmentType = filter.adjustmentType as SalaryAdjustmentType;
  }
  if (filter.period) {
    assertPeriod(filter.period);
    const { start, end } = periodRange(filter.period);
    where.effectiveDate = { gte: start, lt: end };
  }

  const scope = await actorScope(actorId);
  where = await applyScope(scope, where);

  const [items, total] = await Promise.all([
    prisma.salaryAdjustment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.salaryAdjustment.count({ where }),
  ]);

  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_ADJUSTMENT_QUERY',
    resourceType: RESOURCE_TYPE,
    description: '调薪记录列表',
    newValue: {
      employeeId: filter.employeeId,
      status: filter.status,
      adjustmentType: filter.adjustmentType,
      period: filter.period,
      total,
    },
  });

  return {
    items, total, page, pageSize,
  };
}

/**
 * 调薪详情查询
 * @throws AppError(404, 73801) adjustment 不存在
 */
export async function getAdjustment(actorId: string, id: string): Promise<SalaryAdjustment> {
  const rec = await prisma.salaryAdjustment.findUnique({
    where: { id },
    include: { createdByUser: { select: { id: true, username: true } } },
  });
  if (!rec) {
    throw new AppError('调薪申请不存在', 404, 73801);
  }

  const scope = await actorScope(actorId);
  if (scope.selfEmployeeId && rec.employeeId !== scope.selfEmployeeId) {
    throw new AppError('调薪申请不存在', 404, 73801);
  }
  if (scope.deptId) {
    const emp = await prisma.employee.findUnique({
      where: { id: rec.employeeId },
      select: { departmentId: true },
    });
    if (emp?.departmentId !== scope.deptId) {
      throw new AppError('调薪申请不存在', 404, 73801);
    }
  }

  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_ADJUSTMENT_QUERY',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '调薪详情',
  });
  return rec;
}

/**
 * 取消调薪（status ∈ ['draft', 'pending'] → 'cancelled'）
 * @throws AppError(404, 73801) adjustment 不存在
 * @throws AppError(400, 73810) 取消失败（executed / rejected 不能 cancel）
 */
export async function cancelAdjustment(
  actorId: string,
  id: string,
  input: { reason: string },
): Promise<SalaryAdjustment> {
  if (!input.reason || input.reason.trim() === '') {
    throw new AppError('取消原因必填', 400, 73810);
  }
  const rec = await prisma.salaryAdjustment.findUnique({ where: { id } });
  if (!rec) {
    throw new AppError('调薪申请不存在', 404, 73801);
  }
  if (!CANCELABLE.has(rec.status)) {
    throw new AppError('取消失败，仅 draft/pending 可取消', 400, 73810);
  }

  const updated = await prisma.salaryAdjustment.update({
    where: { id },
    data: {
      status: 'cancelled',
      cancelledBy: actorId,
      cancelledAt: new Date(),
      cancelReason: input.reason.trim(),
    },
  });

  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_ADJUSTMENT_CANCEL',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '取消调薪',
    oldValue: { status: rec.status },
    newValue: { status: 'cancelled', reason: input.reason.trim() },
  });
  return updated;
}

/**
 * 调薪统计（按 status / adjustmentType / period 分组）
 * @throws AppError(400, 73805) period 格式错
 */
export async function getAdjustmentSummary(
  actorId: string,
  period: string,
): Promise<AdjustmentSummary> {
  assertPeriod(period);
  const { start, end } = periodRange(period);
  const scope = await actorScope(actorId);
  const where = await applyScope(scope, {
    effectiveDate: { gte: start, lt: end },
  });

  const rows = await prisma.salaryAdjustment.findMany({
    where,
    select: { status: true, adjustmentType: true, delta: true },
  });

  const group = (
    key: 'status' | 'adjustmentType',
  ): Record<string, { count: number; totalDelta: number }> => {
    const map = rows.reduce((acc, r) => {
      const k = String(r[key]);
      const cur = acc.get(k) ?? { count: 0, totalDelta: 0 };
      cur.count += 1;
      cur.totalDelta += toNum(r.delta);
      acc.set(k, cur);
      return acc;
    }, new Map<string, { count: number; totalDelta: number }>());
    return Object.fromEntries(map.entries());
  };

  const totalDelta = rows.reduce((sum, r) => sum + toNum(r.delta), 0);
  const summary: AdjustmentSummary = {
    period,
    byStatus: group('status'),
    byType: group('adjustmentType'),
    totalDelta,
  };

  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_ADJUSTMENT_QUERY',
    resourceType: RESOURCE_TYPE,
    description: '调薪统计',
    newValue: { period, totalDelta },
  });
  return summary;
}
