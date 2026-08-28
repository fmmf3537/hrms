// M4-C8: 调薪实际执行（写 employee_salary_history + 同步 employee_salary_plans；不创建调度队列）| HRMS

import type { Prisma, SalaryAdjustment } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';
import * as notificationService from './notification.service';
import { parseYmd } from './salary_adjustment.service';

const RESOURCE_TYPE = 'salary_adjustment';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FALLBACK_POSITION_LINK = true;

export interface BatchExecuteItem {
  adjustmentId: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface BatchExecuteResult {
  asOfDate: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  results: BatchExecuteItem[];
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

function utcToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

function mapChangeType(adjustmentType: string): string {
  if (adjustmentType === 'promotion') return 'promote';
  return adjustmentType;
}

function actorTypeOf(actorId: string): 'USER' | 'SYSTEM' {
  return actorId === 'SYSTEM' ? 'SYSTEM' : 'USER';
}

async function getPositionLink(): Promise<boolean> {
  try {
    const v = await configService.getValue('salary', 'adjustment.position_change_link');
    if (typeof v === 'boolean') return v;
    return FALLBACK_POSITION_LINK;
  } catch {
    // TODO: configs.salary.adjustment.position_change_link 未配置时 fallback
    return FALLBACK_POSITION_LINK;
  }
}

async function getExecuteMode(): Promise<string> {
  try {
    const v = await configService.getValue('salary', 'adjustment.execute_mode');
    return typeof v === 'string' && v.length > 0 ? v : 'manual';
  } catch {
    // TODO: configs.salary.adjustment.execute_mode 未配置时 fallback manual
    return 'manual';
  }
}

/**
 * 实际执行调薪（status='approved' + effective_date <= asOf → 'executed'）
 * 写 M1 employee_salary_history + 同步 C1 employee_salary_plans + 晋升时联动 position_history
 * @param actorId 操作人 ID（hr/admin/executive / 'SYSTEM'）
 * @param id adjustment ID
 * @param asOfDate 可选截止日（YYYY-MM-DD）；缺省用 today。批量执行传入 asOfDate
 * @returns 更新后的 SalaryAdjustment
 * @throws AppError(404, 73801) adjustment 不存在
 * @throws AppError(400, 73802) 状态机非法（不是 approved）
 * @throws AppError(400, 73803) 已 executed 不能再次执行
 * @throws AppError(400, 73805) effective_date > asOf（未到生效日）
 * @throws AppError(400, 73808) 实际执行失败（事务 rollback）
 * 注：
 *  - C8 不联动 C4 算薪（不调用 payroll_* / payslip.service）
 *  - C8 不更新 employees.baseSalary（该字段不存在）
 *  - gradeId / levelId 沿用旧 plan（不实现 grade 升降级）
 */
export async function executeAdjustment(
  actorId: string,
  id: string,
  asOfDate?: string,
): Promise<SalaryAdjustment> {
  const rec = await prisma.salaryAdjustment.findUnique({ where: { id } });
  if (!rec) {
    throw new AppError('调薪申请不存在', 404, 73801);
  }
  if (rec.status === 'executed') {
    throw new AppError('已 executed 不能再次执行', 400, 73803);
  }
  if (rec.status !== 'approved') {
    throw new AppError('仅 approved 可执行', 400, 73802);
  }

  const asOf = asOfDate ? parseYmd(asOfDate) : utcToday();
  const effective = new Date(Date.UTC(
    rec.effectiveDate.getUTCFullYear(),
    rec.effectiveDate.getUTCMonth(),
    rec.effectiveDate.getUTCDate(),
  ));
  if (effective.getTime() > asOf.getTime()) {
    throw new AppError('未到生效日不能执行', 400, 73805);
  }

  await getExecuteMode();
  const positionLink = await getPositionLink();

  const employee = await prisma.employee.findUnique({ where: { id: rec.employeeId } });
  const oldPlan = await prisma.employeeSalaryPlan.findFirst({
    where: {
      employeeId: rec.employeeId,
      status: 'active',
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  const fromBase = toNum(rec.fromBaseSalary);
  const toBase = toNum(rec.toBaseSalary);
  const toPerf = rec.toPerformanceSalary != null ? toNum(rec.toPerformanceSalary) : 0;
  const changeType = mapChangeType(rec.adjustmentType);

  let executed: SalaryAdjustment;
  try {
    executed = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.employeeSalaryHistory.create({
        data: {
          employeeId: rec.employeeId,
          effectiveDate: rec.effectiveDate,
          baseSalary: toBase,
          performanceSalary: rec.toPerformanceSalary == null ? null : toPerf,
          totalSalary: toBase + toPerf,
          changeType,
          reason: rec.reason,
          operatorId: actorId === 'SYSTEM' ? null : actorId,
        },
      });

      if (oldPlan && oldPlan.effectiveTo == null) {
        await tx.employeeSalaryPlan.update({
          where: { id: oldPlan.id },
          data: { effectiveTo: addDays(effective, -1) },
        });
      }
      if (oldPlan) {
        await tx.employeeSalaryPlan.create({
          data: {
            employeeId: rec.employeeId,
            gradeId: oldPlan.gradeId,
            levelId: oldPlan.levelId,
            baseSalary: toBase,
            performanceBase: toPerf,
            allowance: oldPlan.allowance,
            welfare: oldPlan.welfare,
            effectiveFrom: rec.effectiveDate,
            status: 'active',
            createdById: actorId === 'SYSTEM' ? oldPlan.createdById : actorId,
          },
        });
      }

      if (
        rec.adjustmentType === 'promotion'
        && positionLink
        && employee?.companyId
        && employee.departmentId
      ) {
        await tx.employeePositionHistory.create({
          data: {
            employeeId: rec.employeeId,
            fromCompanyId: employee.companyId,
            fromDeptId: employee.departmentId,
            fromPosition: 'unknown',
            toCompanyId: employee.companyId,
            toDeptId: employee.departmentId,
            toPosition: 'promoted',
            changeType: 'promote',
            changeDate: rec.effectiveDate,
            reason: rec.reason,
            operatorId: actorId === 'SYSTEM' ? null : actorId,
          },
        });
      }

      return tx.salaryAdjustment.update({
        where: { id },
        data: {
          status: 'executed',
          executedAt: new Date(),
          executedBy: actorId === 'SYSTEM' ? null : actorId,
        },
      });
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    auditService.auditLog({
      userId: actorId === 'SYSTEM' ? null : actorId,
      actorType: actorTypeOf(actorId),
      action: 'SALARY_ADJUSTMENT_EXECUTE',
      resourceType: RESOURCE_TYPE,
      resourceId: id,
      status: 'FAILURE',
      description: '调薪执行失败（事务已回滚）',
    });
    throw new AppError('调薪实际执行失败', 400, 73808);
  }

  if (employee?.userId) {
    const notify = notificationService.sendNotification({
      templateKey: 'salary_adjustment_executed',
      userId: employee.userId,
      data: {
        adjustmentId: id,
        employeeId: rec.employeeId,
        toBaseSalary: toBase,
        effectiveDate: rec.effectiveDate.toISOString().slice(0, 10),
      },
      bypassTemplate: {
        channel: 'email',
        subject: '调薪已生效',
        content: `您的调薪已于 ${rec.effectiveDate.toISOString().slice(0, 10)} 生效，基本工资调整为 ${toBase}。`,
      },
    });
    await notify.catch(() => undefined);
  }

  auditService.auditLog({
    userId: actorId === 'SYSTEM' ? null : actorId,
    actorType: actorTypeOf(actorId),
    action: 'SALARY_ADJUSTMENT_EXECUTE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '执行调薪',
    newValue: {
      adjustmentId: id,
      employeeId: rec.employeeId,
      fromBaseSalary: fromBase,
      toBaseSalary: toBase,
      changeType,
      effectiveDate: rec.effectiveDate.toISOString().slice(0, 10),
    },
  });
  return executed;
}

/**
 * 批量执行（扫描所有 approved + effective_date <= asOfDate）
 * @param actorId 操作人 ID（hr/admin/'SYSTEM' for 后续调度任务）
 * @param asOfDate 截止生效日期（YYYY-MM-DD）
 * @returns { asOfDate, totalCount, successCount, failedCount, results }
 * 注：C8 暴露此函数给后续调度任务调用（不创建调度队列）；单条失败不中断
 */
export async function executePendingAdjustments(
  actorId: string,
  asOfDate: string,
): Promise<BatchExecuteResult> {
  if (!DATE_RE.test(asOfDate)) {
    throw new AppError('asOfDate 格式错，应为 YYYY-MM-DD', 400, 73805);
  }
  const asOf = parseYmd(asOfDate);
  const rows = await prisma.salaryAdjustment.findMany({
    where: { status: 'approved', effectiveDate: { lte: asOf } },
    select: { id: true },
    orderBy: { effectiveDate: 'asc' },
  });

  const results = await Promise.all(rows.map(async (row): Promise<BatchExecuteItem> => {
    try {
      await executeAdjustment(actorId, row.id, asOfDate);
      return { adjustmentId: row.id, status: 'success' };
    } catch (err) {
      const error = err instanceof AppError ? err.message : String(err);
      return { adjustmentId: row.id, status: 'failed', error };
    }
  }));

  const successCount = results.filter((r) => r.status === 'success').length;
  const failedCount = results.length - successCount;

  auditService.auditLog({
    userId: actorId === 'SYSTEM' ? null : actorId,
    actorType: actorTypeOf(actorId),
    action: 'SALARY_ADJUSTMENT_EXECUTE',
    resourceType: RESOURCE_TYPE,
    description: '批量执行调薪',
    newValue: {
      batchMode: true, totalCount: rows.length, successCount, failedCount, asOfDate,
    },
  });

  return {
    asOfDate,
    totalCount: rows.length,
    successCount,
    failedCount,
    results,
  };
}
