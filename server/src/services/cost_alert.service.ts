// M4-C7: 人力成本预警记录处理（1 新表 hr_cost_alerts；不走审批流 / 不创建 BullMQ）| HRMS

import type { HrCostAlert } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as attritionService from './attrition.service';
import * as auditService from './audit.service';
import * as overtimeRatioService from './overtime_ratio.service';

const RESOURCE_TYPE = 'hr_cost_alert';
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const PRIVILEGED_ROLES = new Set(['admin', 'hr', 'executive']);

export type CostAlertScanType = 'overtime_ratio' | 'attrition_monthly' | 'all';

export interface ScanCostAlertsInput {
  period: string;
  alertType?: CostAlertScanType;
}

export interface ScanCostAlertsResult {
  period: string;
  alertCount: number;
  overtime: overtimeRatioService.OvertimeRatioScanResult | null;
  attrition: attritionService.AttritionScanResult | null;
}

export interface ListAlertFilter {
  alertType?: string;
  period?: string;
  status?: string;
  severity?: string;
  departmentId?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedAlerts {
  items: HrCostAlert[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AlertSummary {
  period: string;
  total: number;
  byAlertType: Record<string, { count: number; percentage: number }>;
  bySeverity: Record<string, { count: number; percentage: number }>;
  byStatus: Record<string, { count: number; percentage: number }>;
}

function assertPeriod(period: string): void {
  if (!PERIOD_RE.test(period)) {
    throw new AppError('period 格式错，应为 YYYY-MM', 400, 73707);
  }
}

function pct(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 10000) / 100;
}

async function deptScopeForActor(actorId: string): Promise<string | undefined> {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    include: {
      userRoles: { include: { role: { select: { code: true } } } },
      employee: { select: { departmentId: true } },
    },
  });
  if (!user) return undefined;
  const codes = user.userRoles.map((ur) => ur.role.code);
  const privileged = codes.some((c) => PRIVILEGED_ROLES.has(c));
  if (privileged) return undefined;
  if (codes.includes('dept_head')) {
    return user.employee?.departmentId ?? undefined;
  }
  return undefined;
}

/**
 * 手动触发人力成本预警扫描（加班费占比 + 离职率，默认 all）
 * @param actorId 操作人 ID
 * @param input { period, alertType?: overtime_ratio | attrition_monthly | all }
 * @returns 两类扫描结果汇总
 * 注：不创建 BullMQ；调度由 M0.5 独立任务接入本函数 / 两个 scan* 导出函数
 */
export async function scanCostAlerts(
  actorId: string,
  input: ScanCostAlertsInput,
): Promise<ScanCostAlertsResult> {
  assertPeriod(input.period);
  const type: CostAlertScanType = input.alertType ?? 'all';
  let overtime: overtimeRatioService.OvertimeRatioScanResult | null = null;
  let attrition: attritionService.AttritionScanResult | null = null;
  if (type === 'overtime_ratio' || type === 'all') {
    overtime = await overtimeRatioService.scanOvertimeRatioAlerts(actorId, input.period);
  }
  if (type === 'attrition_monthly' || type === 'all') {
    attrition = await attritionService.scanAttritionAlerts(actorId, input.period);
  }
  const alertCount = (overtime?.alertCount ?? 0) + (attrition?.alertCount ?? 0);
  return {
    period: input.period, alertCount, overtime, attrition,
  };
}

/**
 * 预警记录列表查询
 * @param actorId 操作人 ID
 * @param filter { alertType?, period?, status?, severity?, departmentId?, page?, pageSize? }
 * @returns { items, total, page, pageSize }
 * 校验链：
 *  1. 校验 page >= 1 / pageSize ∈ [1, 100]
 *  2. 查 hr_cost_alerts（按 filter 过滤）
 *  3. 按 scanAt desc 排序
 *  4. 权限过滤：dept_head 仅看本部门
 *  5. 返回分页
 *  6. 写 audit（COST_ALERT_QUERY）
 */
export async function listAlerts(
  actorId: string,
  filter: ListAlertFilter,
): Promise<PaginatedAlerts> {
  const page = filter.page && filter.page >= 1 ? filter.page : 1;
  const pageSize = filter.pageSize && filter.pageSize >= 1 && filter.pageSize <= 100
    ? filter.pageSize
    : 20;

  const where: Record<string, unknown> = {};
  if (filter.alertType) where.alertType = filter.alertType;
  if (filter.period) where.period = filter.period;
  if (filter.status) where.status = filter.status;
  if (filter.severity) where.severity = filter.severity;
  if (filter.departmentId) where.departmentId = filter.departmentId;

  const scopeDept = await deptScopeForActor(actorId);
  if (scopeDept) {
    where.departmentId = scopeDept;
  }

  const [items, total] = await Promise.all([
    prisma.hrCostAlert.findMany({
      where,
      orderBy: { scanAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.hrCostAlert.count({ where }),
  ]);

  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'COST_ALERT_QUERY',
    resourceType: RESOURCE_TYPE,
    description: '预警记录列表',
    newValue: {
      alertType: filter.alertType, period: filter.period, status: filter.status, total,
    },
  });

  return {
    items, total, page, pageSize,
  };
}

/**
 * 预警详情查询
 * @param actorId 操作人 ID
 * @param id alertId
 * @returns HrCostAlert（含 acknowledgedByUser / closedByUser）
 * @throws AppError(404, 73701) alert 不存在
 */
export async function getAlert(actorId: string, id: string): Promise<HrCostAlert> {
  const rec = await prisma.hrCostAlert.findUnique({
    where: { id },
    include: {
      acknowledgedByUser: { select: { id: true, username: true } },
      closedByUser: { select: { id: true, username: true } },
    },
  });
  if (!rec) {
    throw new AppError('预警不存在', 404, 73701);
  }
  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'COST_ALERT_QUERY',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '预警详情',
  });
  return rec;
}

/**
 * 确认预警（status active → acknowledged）
 * @param actorId 操作人 ID（hr/admin/executive）
 * @param id alertId
 * @param input { note?: string }
 * @returns HrCostAlert
 * @throws AppError(404, 73701) alert 不存在
 * @throws AppError(400, 73706) 已 acknowledged 不能再 ack
 * @throws AppError(400, 73702) 状态机非法（closed 不能 acknowledge）
 */
export async function acknowledgeAlert(
  actorId: string,
  id: string,
  input?: { note?: string },
): Promise<HrCostAlert> {
  const rec = await prisma.hrCostAlert.findUnique({ where: { id } });
  if (!rec) {
    throw new AppError('预警不存在', 404, 73701);
  }
  if (rec.status === 'acknowledged') {
    throw new AppError('预警已确认', 400, 73706);
  }
  if (rec.status !== 'active') {
    throw new AppError('预警状态非法，仅 active 可确认', 400, 73702);
  }

  const updated = await prisma.hrCostAlert.update({
    where: { id },
    data: {
      status: 'acknowledged',
      acknowledgedBy: actorId,
      acknowledgedAt: new Date(),
      acknowledgeNote: input?.note ?? rec.acknowledgeNote,
    },
  });

  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'COST_ALERT_ACKNOWLEDGE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '确认人力成本预警',
    oldValue: { status: rec.status },
    newValue: { status: 'acknowledged', note: input?.note },
  });
  return updated;
}

/**
 * 关闭预警（status acknowledged → closed）
 * @param actorId 操作人 ID（hr/admin）
 * @param id alertId
 * @param input { reason: string, remark?: string }
 * @returns HrCostAlert
 * @throws AppError(404, 73701) alert 不存在
 * @throws AppError(400, 73710) 关闭失败（acknowledged 才能 close / reason 必填）
 */
export async function closeAlert(
  actorId: string,
  id: string,
  input: { reason: string; remark?: string },
): Promise<HrCostAlert> {
  if (!input.reason || input.reason.trim() === '') {
    throw new AppError('关闭原因必填', 400, 73710);
  }
  const rec = await prisma.hrCostAlert.findUnique({ where: { id } });
  if (!rec) {
    throw new AppError('预警不存在', 404, 73701);
  }
  if (rec.status !== 'acknowledged') {
    throw new AppError('关闭失败，仅 acknowledged 可关闭', 400, 73710);
  }

  const updated = await prisma.hrCostAlert.update({
    where: { id },
    data: {
      status: 'closed',
      closedBy: actorId,
      closedAt: new Date(),
      closeReason: input.reason.trim(),
      remark: input.remark ?? rec.remark,
    },
  });

  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'COST_ALERT_CLOSE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '关闭人力成本预警',
    oldValue: { status: rec.status },
    newValue: { status: 'closed', reason: input.reason.trim() },
  });
  return updated;
}

/**
 * 预警统计（按 alertType / severity / status 分组）
 * @param actorId 操作人 ID
 * @param period 预警周期（YYYY-MM）
 * @returns { period, byAlertType, bySeverity, byStatus }
 * @throws AppError(400, 73707) period 格式错
 */
export async function getAlertSummary(actorId: string, period: string): Promise<AlertSummary> {
  assertPeriod(period);
  const rows = await prisma.hrCostAlert.findMany({
    where: { period },
    select: { alertType: true, severity: true, status: true },
  });
  const total = rows.length;

  const groupBy = (
    key: 'alertType' | 'severity' | 'status',
  ): Record<string, { count: number; percentage: number }> => {
    const counts = rows.reduce((map, r) => {
      const k = String(r[key]);
      map.set(k, (map.get(k) ?? 0) + 1);
      return map;
    }, new Map<string, number>());
    return Object.fromEntries(
      [...counts.entries()].map(([k, count]) => [k, { count, percentage: pct(count, total) }]),
    );
  };

  const summary: AlertSummary = {
    period,
    total,
    byAlertType: groupBy('alertType'),
    bySeverity: groupBy('severity'),
    byStatus: groupBy('status'),
  };

  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'COST_ALERT_QUERY',
    resourceType: RESOURCE_TYPE,
    description: '预警统计',
    newValue: { period, total },
  });
  return summary;
}
