// M4-C4: 工资单查询 + 手动重算 | HRMS
// 不生成 PDF/HTML（C5）；不写 employee_salary_history

import type { Payslip, Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';
import * as calcService from './payroll_calculation.service';

const RESOURCE_TYPE = 'payslip';
const FALLBACK_RECALC_LIMIT = 3;

export interface ListPayslipFilter {
  runId?: string;
  employeeId?: string;
  period?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedPayslips {
  items: Payslip[];
  total: number;
  page: number;
  pageSize: number;
}

interface ActorScope {
  unrestricted: boolean;
  deptId?: string;
  selfEmployeeId?: string;
}

async function getRecalcLimit(): Promise<number> {
  try {
    const v = await configService.getValue('salary', 'payroll.recalculate_limit');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : FALLBACK_RECALC_LIMIT;
  } catch {
    // TODO: configs.salary.payroll.recalculate_limit 未配置时 fallback
    return FALLBACK_RECALC_LIMIT;
  }
}

async function resolveActorScope(actorId: string): Promise<ActorScope> {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!user) return { unrestricted: true };
  const roleCodes = user.userRoles.map((r) => r.role.code);
  if (roleCodes.includes('admin') || roleCodes.includes('hr') || roleCodes.includes('executive')) {
    return { unrestricted: true };
  }
  const emp = await prisma.employee.findFirst({
    where: { userId: actorId, deletedAt: null },
    select: { id: true, departmentId: true },
  });
  if (roleCodes.includes('dept_head') && emp?.departmentId) {
    return { deptId: emp.departmentId, unrestricted: false };
  }
  if (roleCodes.includes('employee') && emp) {
    return { selfEmployeeId: emp.id, unrestricted: false };
  }
  return { unrestricted: true };
}

async function assertPayslipAccess(
  actorId: string,
  rec: { employeeId: string; employee?: { departmentId: string | null } },
): Promise<void> {
  const scope = await resolveActorScope(actorId);
  if (scope.unrestricted) return;
  if (scope.selfEmployeeId && rec.employeeId !== scope.selfEmployeeId) {
    throw new AppError('无权查看他人工资单', 403);
  }
  if (scope.deptId) {
    const deptId = rec.employee?.departmentId
      ?? (await prisma.employee.findFirst({
        where: { id: rec.employeeId },
        select: { departmentId: true },
      }))?.departmentId;
    if (deptId !== scope.deptId) {
      throw new AppError('无权查看其他部门工资单', 403);
    }
  }
}

/**
 * 工资单列表（runId/employeeId/period/status + 角色过滤）
 */
export async function listPayslips(
  actorId: string,
  filter: ListPayslipFilter = {},
): Promise<PaginatedPayslips> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  const scope = await resolveActorScope(actorId);
  const where: Prisma.PayslipWhereInput = {
    ...(filter.runId ? { runId: filter.runId } : {}),
    ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
    ...(filter.period ? { period: filter.period } : {}),
    ...(filter.status ? { status: filter.status as Payslip['status'] } : {}),
  };
  if (scope.selfEmployeeId) {
    where.employeeId = scope.selfEmployeeId;
  } else if (scope.deptId) {
    where.employee = { departmentId: scope.deptId };
  }
  const [items, total] = await Promise.all([
    prisma.payslip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payslip.count({ where }),
  ]);
  return {
    items, total, page, pageSize,
  };
}

/**
 * 工资单详情（含 items）
 */
export async function getPayslip(actorId: string, id: string) {
  const rec = await prisma.payslip.findUnique({
    where: { id },
    include: { items: true, employee: { select: { departmentId: true } } },
  });
  if (!rec) {
    throw new AppError('工资单不存在', 400, 73407);
  }
  await assertPayslipAccess(actorId, rec);
  return rec;
}

/**
 * 手动重算（仅 calculated；次数 ≤ recalculate_limit）
 * @throws AppError(400, 73407) 不存在
 * @throws AppError(400, 73403) 状态非法
 * @throws AppError(400, 73409) 超过次数
 */
export async function recalculatePayslip(actorId: string, id: string) {
  const rec = await prisma.payslip.findUnique({
    where: { id },
    include: { run: true },
  });
  if (!rec) {
    throw new AppError('工资单不存在', 400, 73407);
  }
  if (rec.run.locked || rec.run.status === 'locked') {
    throw new AppError('算薪批次已锁定', 400, 73406);
  }
  if (rec.status !== 'calculated') {
    throw new AppError('仅未审批工资单可重算', 400, 73403);
  }
  const limit = await getRecalcLimit();
  if (rec.recalculateCount + 1 > limit) {
    throw new AppError('超过每月重算次数限制', 400, 73409);
  }

  const calc = await calcService.calculateSinglePayroll(actorId, {
    employeeId: rec.employeeId,
    period: rec.period,
  });
  const items = calcService.toPayslipItemRows(calc);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.payslipItem.deleteMany({ where: { payslipId: id } });
    const next = await tx.payslip.update({
      where: { id },
      data: {
        baseAmount: calc.baseAmount,
        performanceAmount: calc.performanceAmount,
        overtimeAmount: calc.overtimeAmount,
        allowanceAmount: calc.allowanceAmount,
        salesCommissionAmount: calc.salesCommissionAmount,
        yearEndBonusAmount: calc.yearEndBonusAmount,
        grossAmount: calc.grossAmount,
        socialInsuranceAmount: calc.socialInsuranceAmount,
        housingFundAmount: calc.housingFundAmount,
        taxAmount: calc.taxAmount,
        absenceAmount: calc.absenceAmount,
        deductionAmount: calc.deductionAmount,
        netAmount: calc.netAmount,
        recalculateCount: rec.recalculateCount + 1,
        calculatedAt: new Date(),
      },
      include: { items: true },
    });
    await tx.payslipItem.createMany({
      data: items.map((it) => ({
        payslipId: id,
        itemType: it.itemType,
        itemName: it.itemName,
        amount: it.amount,
        description: it.description ?? null,
      })),
    });
    return tx.payslip.findUnique({
      where: { id },
      include: { items: true },
    }) ?? next;
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PAYSLIP_RECALCULATE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `重算工资单 ${rec.period}`,
    newValue: { recalculateCount: rec.recalculateCount + 1, netAmount: calc.netAmount },
  });

  return updated;
}
