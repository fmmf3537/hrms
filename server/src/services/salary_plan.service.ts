// M4-C1: 员工薪酬方案 service | HRMS
// 仅 import audit/config + prisma；不写 employee_salary_history；不调 D1-D6 / M1 service

import type { EmployeeSalaryPlan, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'employee_salary_plan';
const FALLBACK_EFFECTIVE_DEFAULT = 'next_month_first_day';

export interface CreatePlanInput {
  employeeId: string;
  gradeId: string;
  levelId: string;
  baseSalary: number;
  performanceBase: number;
  allowance?: number;
  welfare?: string;
  effectiveFrom?: Date | string;
}

export interface UpdatePlanInput {
  effectiveTo?: Date | string;
}

export interface ListPlanFilter {
  employeeId?: string;
  status?: string;
  effectiveFrom?: Date | string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedPlans {
  items: EmployeeSalaryPlan[];
  total: number;
  page: number;
  pageSize: number;
}

interface ActorScope {
  unrestricted: boolean;
  deptId?: string;
  selfEmployeeId?: string;
}

async function getEffectiveDefault(): Promise<string> {
  try {
    const v = await configService.getValue('salary', 'plan.effective_default');
    return typeof v === 'string' && v.length > 0 ? v : FALLBACK_EFFECTIVE_DEFAULT;
  } catch {
    // TODO: configs.salary.plan.effective_default 未配置时 fallback
    return FALLBACK_EFFECTIVE_DEFAULT;
  }
}

async function getLockAfterEffective(): Promise<boolean> {
  try {
    const v = await configService.getValue('salary', 'plan.lock_after_effective');
    if (typeof v === 'boolean') return v;
    return true;
  } catch {
    // TODO: configs.salary.plan.lock_after_effective 未配置时 fallback
    return true;
  }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseLocalDate(value: Date | string): Date {
  if (value instanceof Date) return startOfDay(value);
  const datePart = value.split('T')[0];
  const [y, m, d] = datePart.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function nextMonthFirstDay(from: Date): Date {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

function toNumber(v: Decimal | number): number {
  return typeof v === 'number' ? v : Number(v);
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

async function assertPlanAccess(
  actorId: string,
  plan: { employeeId: string; employee?: { departmentId: string | null } },
): Promise<void> {
  const scope = await resolveActorScope(actorId);
  if (scope.unrestricted) return;

  if (scope.selfEmployeeId && plan.employeeId !== scope.selfEmployeeId) {
    throw new AppError('无权查看他人薪酬方案', 403);
  }
  if (scope.deptId) {
    const deptId = plan.employee?.departmentId
      ?? (await prisma.employee.findUnique({
        where: { id: plan.employeeId },
        select: { departmentId: true },
      }))?.departmentId;
    if (deptId !== scope.deptId) {
      throw new AppError('无权查看其他部门薪酬方案', 403);
    }
  }
}

/**
 * 创建员工薪酬方案
 * @param actorId 操作人 ID（hr/admin）
 * @param input { employeeId, gradeId, levelId, baseSalary, performanceBase, allowance?, welfare?, effectiveFrom? }
 * @returns 新创建的 employee_salary_plans 记录
 * @throws AppError(400, 73010) employeeId 不存在
 * @throws AppError(400, 73001) gradeId / levelId 不存在或 level 不属于 grade
 * @throws AppError(400) baseSalary < level.baseSalary
 * 校验链：
 *  1. 校验 employee 存在 → 不存在抛 73010
 *  2. 校验 grade 存在 → 不存在抛 73001
 *  3. 校验 level 存在且 level.gradeId === grade.id → 否则抛 73001
 *  4. 校验 baseSalary >= level.baseSalary → 否则抛 400
 *  5. 校验 performanceBase >= level.performanceBase → 否则抛 400
 *  6. effectiveFrom 不传则用 configs.salary.plan.effective_default（次月 1 日）
 *  7. 校验同 employee 已有 active plan 的 effectiveTo < 新 plan.effectiveFrom → 否则抛 400
 *  8. 创建记录（status = active）
 *  9. 写 audit（SALARY_PLAN_CREATE）
 *  注：C1 不写 employee_salary_history（D6 联动留 C8）
 */
export async function createPlan(
  actorId: string,
  input: CreatePlanInput,
): Promise<EmployeeSalaryPlan> {
  const {
    employeeId, gradeId, levelId, baseSalary, performanceBase,
  } = input;

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 400, 73010);
  }

  const grade = await prisma.salaryGrade.findUnique({ where: { id: gradeId } });
  if (!grade) {
    throw new AppError('薪级不存在', 400, 73001);
  }

  const level = await prisma.salaryGradeLevel.findUnique({ where: { id: levelId } });
  if (!level || level.gradeId !== gradeId) {
    throw new AppError('薪档不存在或不属于该薪级', 400, 73001);
  }

  if (baseSalary < toNumber(level.baseSalary)) {
    throw new AppError('基本工资不得低于当前档位', 400);
  }
  if (performanceBase < toNumber(level.performanceBase)) {
    throw new AppError('绩效工资基数不得低于当前档位', 400);
  }

  await getLockAfterEffective();
  const effectiveDefault = await getEffectiveDefault();
  let effectiveFrom: Date;
  if (input.effectiveFrom) {
    effectiveFrom = parseLocalDate(input.effectiveFrom);
  } else if (effectiveDefault === 'next_month_first_day') {
    effectiveFrom = nextMonthFirstDay(new Date());
  } else {
    effectiveFrom = nextMonthFirstDay(new Date());
  }

  const overlapping = await prisma.employeeSalaryPlan.findFirst({
    where: {
      employeeId,
      status: 'active',
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: effectiveFrom } },
      ],
    },
  });
  if (overlapping) {
    throw new AppError('该员工已有重叠的生效薪酬方案', 400);
  }

  const created = await prisma.employeeSalaryPlan.create({
    data: {
      employeeId,
      gradeId,
      levelId,
      baseSalary: new Decimal(baseSalary),
      performanceBase: new Decimal(performanceBase),
      allowance: input.allowance != null ? new Decimal(input.allowance) : null,
      welfare: input.welfare ?? null,
      effectiveFrom,
      effectiveTo: null,
      status: 'active',
      createdById: actorId,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_PLAN_CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: created.id,
    description: `创建薪酬方案 employee=${employeeId} grade=${gradeId}`,
    newValue: {
      employeeId, gradeId, levelId, baseSalary, performanceBase, effectiveFrom,
    },
  });

  return created;
}

/**
 * 列出薪酬方案（employeeId / status / effectiveFrom 过滤 + 分页 + 权限过滤）
 * dept_head 仅看本部门；employee 仅看本人
 */
export async function listPlans(
  actorId: string,
  filter: ListPlanFilter,
): Promise<PaginatedPlans> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  if (page < 1 || pageSize < 1 || pageSize > 100) {
    throw new AppError('分页参数不合法', 400);
  }

  const where: Prisma.EmployeeSalaryPlanWhereInput = {};
  if (filter.employeeId) where.employeeId = filter.employeeId;
  if (filter.status) {
    where.status = filter.status as Prisma.EnumEmployeeSalaryPlanStatusFilter['equals'];
  }
  if (filter.effectiveFrom) {
    where.effectiveFrom = { gte: parseLocalDate(filter.effectiveFrom) };
  }

  const scope = await resolveActorScope(actorId);
  if (scope.selfEmployeeId) {
    where.employeeId = scope.selfEmployeeId;
  } else if (scope.deptId) {
    where.employee = { departmentId: scope.deptId };
  }

  const [items, total] = await Promise.all([
    prisma.employeeSalaryPlan.findMany({
      where,
      orderBy: { effectiveFrom: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.employeeSalaryPlan.count({ where }),
  ]);

  return {
    items, total, page, pageSize,
  };
}

/**
 * 读员工当前生效薪酬方案
 * @param actorId 操作人 ID
 * @param employeeId 员工 ID
 * @returns 当前生效方案（status=active 且 effectiveFrom ≤ now 且 effectiveTo 为空或 > now）
 * @throws AppError(400, 73010) employeeId 不存在
 * @throws AppError(400, 73009) 无当前生效方案
 */
export async function getCurrentPlan(
  actorId: string,
  employeeId: string,
): Promise<EmployeeSalaryPlan> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    select: { id: true, departmentId: true },
  });
  if (!employee) {
    throw new AppError('员工不存在', 400, 73010);
  }

  const now = startOfDay(new Date());
  const plan = await prisma.employeeSalaryPlan.findFirst({
    where: {
      employeeId,
      status: 'active',
      effectiveFrom: { lte: now },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gt: now } },
      ],
    },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!plan) {
    throw new AppError('无当前生效薪酬方案', 400, 73009);
  }

  await assertPlanAccess(actorId, { employeeId, employee });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_PLAN_READ',
    resourceType: RESOURCE_TYPE,
    resourceId: plan.id,
    description: `读取当前薪酬方案 employee=${employeeId}`,
  });

  return plan;
}

/**
 * 更新薪酬方案（仅 status=active 可改 effectiveTo；不写 employee_salary_history）
 * @throws AppError(400, 73009) plan 不存在
 * @throws AppError(400) 状态非 active
 */
export async function updatePlan(
  actorId: string,
  id: string,
  input: UpdatePlanInput,
): Promise<EmployeeSalaryPlan> {
  const plan = await prisma.employeeSalaryPlan.findUnique({ where: { id } });
  if (!plan) {
    throw new AppError('薪酬方案不存在', 400, 73009);
  }
  if (plan.status !== 'active') {
    throw new AppError('仅 active 方案可更新', 400);
  }

  await getLockAfterEffective();
  if (!input.effectiveTo) {
    return plan;
  }

  const updated = await prisma.employeeSalaryPlan.update({
    where: { id },
    data: { effectiveTo: parseLocalDate(input.effectiveTo) },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_PLAN_UPDATE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '更新薪酬方案 effectiveTo',
  });

  return updated;
}

/**
 * 失效薪酬方案（active → inactive）
 * @param actorId 操作人 ID
 * @param id plan ID
 * @param input { effectiveTo: date, reason?: string }
 * @returns 更新后的 plan
 * @throws AppError(400, 73009) planId 不存在
 * @throws AppError(400) 状态非 active
 * 校验链：
 *  1. 查询 plan → 不存在抛 73009
 *  2. 校验 status === 'active' → 否则抛 400
 *  3. update plan { status='inactive', effectiveTo }
 *  4. 写 audit（SALARY_PLAN_DEACTIVATE）
 *  注：C1 不写 employee_salary_history（D6 联动留 C8）
 */
export async function deactivatePlan(
  actorId: string,
  id: string,
  input: { effectiveTo: Date | string; reason?: string },
): Promise<EmployeeSalaryPlan> {
  const plan = await prisma.employeeSalaryPlan.findUnique({ where: { id } });
  if (!plan) {
    throw new AppError('薪酬方案不存在', 400, 73009);
  }
  if (plan.status !== 'active') {
    throw new AppError('仅 active 方案可失效', 400);
  }

  const effectiveTo = parseLocalDate(input.effectiveTo);
  const updated = await prisma.employeeSalaryPlan.update({
    where: { id },
    data: { status: 'inactive', effectiveTo },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_PLAN_DEACTIVATE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `失效薪酬方案 ${id}`,
    newValue: { effectiveTo, reason: input.reason },
  });

  return updated;
}
