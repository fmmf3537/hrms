// M4-C7: 离职率预警扫描（prisma 只读 A6 offboarding_records + M1 employees；不创建 BullMQ）| HRMS

import type { HrCostAlert, Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';
import * as notificationService from './notification.service';

const RESOURCE_TYPE = 'hr_cost_alert';
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
// TODO: configs 缺失时算法默认 0.05 / 0.10；实际缺失抛 73708
const OFFBOARDING_OK = ['approved', 'certificate_issued'] as const;
const ACTIVE_STATUSES = ['probation', 'active'] as const;

export interface AttritionScanResult {
  period: string;
  alertCount: number;
  alerts: HrCostAlert[];
}

export interface AttritionThresholds {
  threshold: number;
  critical: number;
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
 * 读取月度离职率阈值 + 严重度阈值（V1.2 §三.5.2）
 * @returns { threshold, critical }
 * @throws AppError(400, 73708) 阈值配置无效
 */
export async function getAttritionThreshold(): Promise<AttritionThresholds> {
  const threshold = await readRatioConfig([
    ['salary', 'hr_attrition.monthly_threshold'],
    ['hr_attrition', 'monthly_threshold'],
  ]);
  const critical = await readRatioConfig([
    ['salary', 'cost_alert.attrition.severity_critical'],
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

async function getAttritionTemplateKey(): Promise<string> {
  try {
    const v = await configService.getValue('salary', 'cost_alert.notification.template_attrition');
    return typeof v === 'string' && v.length > 0 ? v : 'attrition_alert';
  } catch {
    // TODO: configs.salary.cost_alert.notification.template_attrition 未配置时 fallback
    return 'attrition_alert';
  }
}

interface DeptHeadcount {
  departmentId: string | null;
  resigned: Set<string>;
  active: Set<string>;
}

function addToBucket(
  byDept: Map<string, DeptHeadcount>,
  emp: { id: string; departmentId: string | null; deletedAt: Date | null },
  kind: 'resigned' | 'active',
  includeDeactivated: boolean,
): void {
  if (!includeDeactivated && emp.deletedAt) return;
  const key = emp.departmentId ?? '__company__';
  const cur = byDept.get(key) ?? {
    departmentId: emp.departmentId,
    resigned: new Set<string>(),
    active: new Set<string>(),
  };
  if (kind === 'resigned') cur.resigned.add(emp.id);
  else cur.active.add(emp.id);
  byDept.set(key, cur);
}

/**
 * 离职率预警扫描（V1.2 §四.8 C4 行 + §三.5.2）
 * @param actorId 操作人 ID（hr/admin/executive，BullMQ SYSTEM 用 'SYSTEM'）
 * @param period 预警周期（YYYY-MM）
 * @returns { period, alertCount, alerts: HrCostAlert[] }
 * @throws AppError(400, 73707) period 格式错
 * @throws AppError(400, 73708) 阈值配置无效
 * @throws AppError(400, 73705) 离职数据缺失
 * @throws AppError(400, 73703) 扫描失败
 * @throws AppError(400, 73709) 部门不存在
 * 校验链：
 *  1. 校验 period 格式（YYYY-MM）→ 否则抛 73707
 *  2. 读 configs：salary.hr_attrition.monthly_threshold（默认 0.05）
 *     + salary.cost_alert.attrition.severity_critical（默认 0.10）→ 缺失或格式错抛 73708
 *  3. 查 A6 offboarding_records（status IN approved/certificate_issued + lastWorkingDate 落在 period）
 *  4. 查 M1 employees（status=resigned + resignationDate 落在 period，兜底 A6 未覆盖）
 *  5. 查 M1 employees（status IN probation/active）= 在职
 *  6. 取并集（A6 + M1 resigned 按 employeeId 去重）
 *  7. 按部门聚合
 *  8. attritionRate = resignedCount / (resignedCount + activeCount)
 *  9. rate > critical → critical；> threshold 且 <= critical → warning；否则不创建
 *  10. 事务：create HrCostAlert（去重：同 (alertType, period, departmentId) 已有 active 不重复）
 *  11. 触发通知：notificationService.sendNotification（bypassTemplate fallback）
 *  12. 写 audit（COST_ALERT_SCAN）
 * 注：不调用 A6 / M1 service；不创建 BullMQ
 */
export async function scanAttritionAlerts(
  actorId: string,
  period: string,
): Promise<AttritionScanResult> {
  assertPeriod(period);
  try {
    const { threshold, critical } = await getAttritionThreshold();
    const includeDeactivated = await getIncludeDeactivated();
    const templateKey = await getAttritionTemplateKey();
    const { start, end } = periodRange(period);

    let offboardings: Array<{ employeeId: string }>;
    let resignedEmps: Array<{
      id: string; departmentId: string | null; status: string; deletedAt: Date | null;
    }>;
    let activeEmps: Array<{
      id: string; departmentId: string | null; status: string; deletedAt: Date | null;
    }>;
    try {
      offboardings = await prisma.offboardingRecord.findMany({
        where: {
          status: { in: [...OFFBOARDING_OK] },
          lastWorkingDate: { gte: start, lt: end },
        },
        select: { employeeId: true },
      });
      resignedEmps = await prisma.employee.findMany({
        where: {
          status: 'resigned',
          resignationDate: { gte: start, lt: end },
        },
        select: {
          id: true, departmentId: true, status: true, deletedAt: true,
        },
      });
      activeEmps = await prisma.employee.findMany({
        where: { status: { in: [...ACTIVE_STATUSES] } },
        select: {
          id: true, departmentId: true, status: true, deletedAt: true,
        },
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('离职数据缺失', 400, 73705);
    }

    if (activeEmps.length === 0 && offboardings.length === 0 && resignedEmps.length === 0) {
      throw new AppError('离职数据缺失', 400, 73705);
    }

    const a6Ids = new Set(offboardings.map((o) => o.employeeId));
    const needLookup = [...a6Ids].filter((id) => !resignedEmps.some((e) => e.id === id));
    let a6Employees: Array<{
      id: string; departmentId: string | null; status: string; deletedAt: Date | null;
    }> = [];
    if (needLookup.length > 0) {
      try {
        a6Employees = await prisma.employee.findMany({
          where: { id: { in: needLookup } },
          select: {
            id: true, departmentId: true, status: true, deletedAt: true,
          },
        });
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError('离职数据缺失', 400, 73705);
      }
    }

    const empById = new Map<string, {
      id: string; departmentId: string | null; status: string; deletedAt: Date | null;
    }>();
    [...resignedEmps, ...a6Employees, ...activeEmps].forEach((e) => {
      empById.set(e.id, e);
    });

    const byDept = new Map<string, DeptHeadcount>();
    [...a6Ids].forEach((id) => {
      const emp = empById.get(id);
      if (emp) addToBucket(byDept, emp, 'resigned', includeDeactivated);
    });
    resignedEmps.forEach((emp) => addToBucket(byDept, emp, 'resigned', includeDeactivated));
    activeEmps.forEach((emp) => addToBucket(byDept, emp, 'active', includeDeactivated));

    const deptIds = [...byDept.values()]
      .map((d) => d.departmentId)
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

    const candidates = [...byDept.values()].flatMap((row) => {
      const resignedCount = row.resigned.size;
      const activeCount = row.active.size;
      const denom = resignedCount + activeCount;
      if (denom <= 0) return [];
      const rate = roundRatio(resignedCount / denom);
      let severity: 'warning' | 'critical' | null = null;
      if (rate > critical) severity = 'critical';
      else if (rate > threshold) severity = 'warning';
      if (!severity) return [];
      const snapshot: Prisma.InputJsonValue = {
        resignedCount, activeCount, attritionRate: rate,
      };
      return [{
        departmentId: row.departmentId, rate, severity, snapshot,
      }];
    });

    const created = await prisma.$transaction(async (tx) => {
      const rows = await Promise.all(candidates.map(async (c) => {
        const existing = await tx.hrCostAlert.findFirst({
          where: {
            alertType: 'attrition_monthly',
            period,
            departmentId: c.departmentId,
            status: 'active',
          },
        });
        if (existing) return null;
        return tx.hrCostAlert.create({
          data: {
            alertType: 'attrition_monthly',
            period,
            departmentId: c.departmentId,
            threshold,
            actualValue: c.rate,
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
      await notificationService.sendNotification({
        templateKey,
        userId: actorId,
        data: {
          period,
          alertCount: created.length,
          threshold,
          alertType: 'attrition_monthly',
        },
        bypassTemplate: {
          channel: 'email',
          subject: `离职率预警 ${period}`,
          content: `${period} 离职率扫描产生 ${created.length} 条预警（阈值 ${threshold}）。`,
        },
      }).catch(() => undefined);
    }

    const severities = [...new Set(created.map((a) => a.severity))];
    auditService.auditLog({
      userId: actorId === 'SYSTEM' ? null : actorId,
      actorType: actorTypeOf(actorId),
      action: 'COST_ALERT_SCAN',
      resourceType: RESOURCE_TYPE,
      description: '离职率预警扫描',
      newValue: {
        alertType: 'attrition_monthly',
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
