// M4-C7: 加班费占比预警扫描（prisma 只读 C4 payslips + B4 overtime_requests；不创建 BullMQ）| HRMS

import type { HrCostAlert, Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';
import * as notificationService from './notification.service';

const RESOURCE_TYPE = 'hr_cost_alert';
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
// TODO: configs 缺失时算法默认 0.20 / 0.30；实际缺失抛 73708

export interface OvertimeRatioScanResult {
  period: string;
  alertCount: number;
  alerts: HrCostAlert[];
}

export interface OvertimeRatioThresholds {
  threshold: number;
  critical: number;
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

function roundRatio(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function assertPeriod(period: string): void {
  if (!PERIOD_RE.test(period)) {
    throw new AppError('period 格式错，应为 YYYY-MM', 400, 73707);
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

function actorTypeOf(actorId: string): 'USER' | 'SYSTEM' {
  return actorId === 'SYSTEM' ? 'SYSTEM' : 'USER';
}

async function readRatioConfig(pairs: Array<[string, string]>): Promise<number> {
  const tryAt = async (index: number): Promise<number> => {
    if (index >= pairs.length) {
      throw new AppError('阈值配置无效', 400, 73708);
    }
    const pair = pairs[index];
    if (!pair) {
      throw new AppError('阈值配置无效', 400, 73708);
    }
    try {
      const v = await configService.getValue(pair[0], pair[1]);
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n) || n <= 0) {
        throw new AppError('阈值配置无效', 400, 73708);
      }
      return n;
    } catch (err) {
      if (err instanceof AppError && err.code === 73708) throw err;
      return tryAt(index + 1);
    }
  };
  return tryAt(0);
}

/**
 * 读取加班费占比阈值 + 严重度阈值（V1.2 §三.5.2）
 * @returns { threshold, critical }
 * @throws AppError(400, 73708) 阈值配置无效
 */
export async function getOvertimeRatioThreshold(): Promise<OvertimeRatioThresholds> {
  const threshold = await readRatioConfig([
    ['salary', 'hr_attrition.overtime_ratio_threshold'],
    ['hr_attrition', 'overtime_ratio_threshold'],
  ]);
  const critical = await readRatioConfig([
    ['salary', 'cost_alert.overtime_ratio.severity_critical'],
  ]);
  return { threshold, critical };
}

async function getIncludeDeactivated(): Promise<boolean> {
  try {
    const v = await configService.getValue('salary', 'cost_alert.scan.include_deactivated_employees');
    return v === true;
  } catch {
    // TODO: configs.salary.cost_alert.scan.include_deactivated_employees 未配置时 fallback false
    return false;
  }
}

async function getOvertimeTemplateKey(): Promise<string> {
  try {
    const v = await configService.getValue('salary', 'cost_alert.notification.template_overtime');
    return typeof v === 'string' && v.length > 0 ? v : 'overtime_ratio_alert';
  } catch {
    // TODO: configs.salary.cost_alert.notification.template_overtime 未配置时 fallback
    return 'overtime_ratio_alert';
  }
}

interface DeptAgg {
  departmentId: string | null;
  overtimeAmount: number;
  totalGross: number;
  payslipCount: number;
  overtimeHours: number;
}

/**
 * 加班费占比预警扫描（V1.2 §四.8 C4 行 + §三.5.2）
 * @param actorId 操作人 ID（hr/admin/executive，BullMQ SYSTEM 用 'SYSTEM'）
 * @param period 预警周期（YYYY-MM）
 * @returns { period, alertCount, alerts: HrCostAlert[] }
 * @throws AppError(400, 73707) period 格式错
 * @throws AppError(400, 73708) 阈值配置无效
 * @throws AppError(400, 73704) 加班费数据缺失
 * @throws AppError(400, 73703) 扫描失败
 * @throws AppError(400, 73709) 部门不存在
 * 校验链：
 *  1. 校验 period 格式（YYYY-MM）→ 否则抛 73707
 *  2. 读 configs：salary.hr_attrition.overtime_ratio_threshold（默认 0.20）
 *     + salary.cost_alert.overtime_ratio.severity_critical（默认 0.30）→ 缺失或格式错抛 73708
 *  3. 查 C4 payslips（period 过滤，status IN ['approved', 'locked']）→ 缺失抛 73704
 *  4. prisma 关联 payslip_items（itemType='earning_overtime'），累加 amount
 *  5. 累加 payslip.grossAmount = 工资总额
 *  6. 按部门聚合（employee.departmentId）
 *  7. 每个部门 overtimeRatio = sum(overtimeAmount) / sum(totalGross)
 *  8. ratio > critical → critical；> threshold 且 <= critical → warning；否则不创建
 *  9. 事务：create HrCostAlert（去重：同 (alertType, period, departmentId) 已有 active 不重复）
 *  10. 触发通知：notificationService.sendNotification（bypassTemplate fallback）
 *  11. 写 audit（COST_ALERT_SCAN）
 * 注：不调用 C4 service；不创建 BullMQ；通知走 M0.5-2
 */
export async function scanOvertimeRatioAlerts(
  actorId: string,
  period: string,
): Promise<OvertimeRatioScanResult> {
  assertPeriod(period);
  try {
    const { threshold, critical } = await getOvertimeRatioThreshold();
    const includeDeactivated = await getIncludeDeactivated();
    const templateKey = await getOvertimeTemplateKey();
    const { start, end } = periodRange(period);

    let slips: Array<{
      id: string;
      employeeId: string;
      grossAmount: unknown;
      overtimeAmount: unknown;
      employee: { id: string; departmentId: string | null; status: string; deletedAt: Date | null } | null;
      items: Array<{ amount: unknown }>;
    }>;
    try {
      slips = await prisma.payslip.findMany({
        where: { period, status: { in: ['approved', 'locked'] } },
        include: {
          items: { where: { itemType: 'earning_overtime' } },
          employee: {
            select: {
              id: true, departmentId: true, status: true, deletedAt: true,
            },
          },
        },
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('加班费数据缺失', 400, 73704);
    }

    if (slips.length === 0) {
      throw new AppError('加班费数据缺失', 400, 73704);
    }

    let otReqs: Array<{ departmentId: string; totalHours: unknown }> = [];
    try {
      otReqs = await prisma.overtimeRequest.findMany({
        where: {
          status: 'approved',
          startTime: { gte: start, lt: end },
        },
        select: { departmentId: true, totalHours: true },
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('加班费数据缺失', 400, 73704);
    }

    const hoursByDept = otReqs.reduce((map, r) => {
      map.set(r.departmentId, (map.get(r.departmentId) ?? 0) + toNum(r.totalHours));
      return map;
    }, new Map<string, number>());

    const agg = slips.reduce((map, slip) => {
      const emp = slip.employee;
      if (!emp) return map;
      if (!includeDeactivated && (emp.status === 'resigned' || emp.deletedAt)) return map;
      const deptKey = emp.departmentId ?? '__company__';
      const overtimeFromItems = slip.items.reduce((s, it) => s + toNum(it.amount), 0);
      const overtimeAmount = overtimeFromItems > 0 ? overtimeFromItems : toNum(slip.overtimeAmount);
      const totalGross = toNum(slip.grossAmount);
      const cur = map.get(deptKey) ?? {
        departmentId: emp.departmentId,
        overtimeAmount: 0,
        totalGross: 0,
        payslipCount: 0,
        overtimeHours: hoursByDept.get(emp.departmentId ?? '') ?? 0,
      };
      cur.overtimeAmount += overtimeAmount;
      cur.totalGross += totalGross;
      cur.payslipCount += 1;
      map.set(deptKey, cur);
      return map;
    }, new Map<string, DeptAgg>());

    const deptIds = [...agg.values()]
      .map((a) => a.departmentId)
      .filter((id): id is string => Boolean(id));
    if (deptIds.length > 0) {
      const depts = await prisma.department.findMany({
        where: { id: { in: deptIds } },
        select: { id: true },
      });
      const found = new Set(depts.map((d) => d.id));
      const missing = deptIds.filter((id) => !found.has(id));
      if (missing.length > 0) {
        throw new AppError('部门不存在', 400, 73709);
      }
    }

    const candidates = [...agg.values()].flatMap((row) => {
      if (row.totalGross <= 0) return [];
      const ratio = roundRatio(row.overtimeAmount / row.totalGross);
      let severity: 'warning' | 'critical' | null = null;
      if (ratio > critical) severity = 'critical';
      else if (ratio > threshold) severity = 'warning';
      if (!severity) return [];
      const snapshot: Prisma.InputJsonValue = {
        overtimeAmount: roundRatio(row.overtimeAmount),
        totalGross: roundRatio(row.totalGross),
        overtimeRatio: ratio,
        payslipCount: row.payslipCount,
        overtimeHours: roundRatio(row.overtimeHours),
      };
      return [{
        departmentId: row.departmentId, ratio, severity, snapshot,
      }];
    });

    const created = await prisma.$transaction(async (tx) => {
      const rows = await Promise.all(candidates.map(async (c) => {
        const existing = await tx.hrCostAlert.findFirst({
          where: {
            alertType: 'overtime_ratio',
            period,
            departmentId: c.departmentId,
            status: 'active',
          },
        });
        if (existing) return null;
        return tx.hrCostAlert.create({
          data: {
            alertType: 'overtime_ratio',
            period,
            departmentId: c.departmentId,
            threshold,
            actualValue: c.ratio,
            severity: c.severity,
            status: 'active',
            scanAt: new Date(),
            contextSnapshot: c.snapshot,
          },
        });
      }));
      return rows.filter((r): r is HrCostAlert => r !== null);
    });

    if (created.length > 0 && actorId !== 'SYSTEM') {
      const notify = notificationService.sendNotification({
        templateKey,
        userId: actorId,
        data: {
          period,
          alertCount: created.length,
          threshold,
          alertType: 'overtime_ratio',
        },
        bypassTemplate: {
          channel: 'email',
          subject: `加班费占比预警 ${period}`,
          content: `${period} 加班费占比扫描产生 ${created.length} 条预警（阈值 ${threshold}）。`,
        },
      });
      await notify.catch(() => undefined);
    }

    const severities = [...new Set(created.map((a) => a.severity))];
    auditService.auditLog({
      userId: actorId === 'SYSTEM' ? null : actorId,
      actorType: actorTypeOf(actorId),
      action: 'COST_ALERT_SCAN',
      resourceType: RESOURCE_TYPE,
      description: '加班费占比预警扫描',
      newValue: {
        alertType: 'overtime_ratio',
        period,
        alertCount: created.length,
        threshold,
        severity: severities,
      },
    });

    return { period, alertCount: created.length, alerts: created };
  } catch (err) {
    if (err instanceof AppError) {
      if (err.code === 70101) {
        throw new AppError('阈值配置无效', 400, 73708);
      }
      throw err;
    }
    throw new AppError('扫描失败', 400, 73703);
  }
}
