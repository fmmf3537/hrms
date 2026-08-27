// M4-C2: 员工社保公积金登记 service | HRMS
// 仅 import audit/config + prisma；不 import C1/D1-D6/M1 service；不实现实际算扣

import type { EmployeeInsuranceRegistration, Prisma, SocialInsuranceCity } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'employee_insurance_registration';
const FALLBACK_CITIES = ['xi_an', 'bei_jing', 'si_chuan'];

export interface CreateRegistrationInput {
  employeeId: string;
  city: string;
  socialInsuranceSchemeId?: string;
  housingFundSchemeId?: string;
  baseSalary?: number;
  effectiveFrom?: Date | string;
}

export interface UpdateRegistrationInput {
  effectiveTo?: Date | string;
  baseSalary?: number;
}

export interface ListRegistrationFilter {
  employeeId?: string;
  city?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedRegistrations {
  items: EmployeeInsuranceRegistration[];
  total: number;
  page: number;
  pageSize: number;
}

interface ActorScope {
  unrestricted: boolean;
  deptId?: string;
  selfEmployeeId?: string;
}

async function getCities(): Promise<string[]> {
  try {
    const v = await configService.getValue('salary', 'insurance.cities');
    if (Array.isArray(v) && v.every((x): x is string => typeof x === 'string')) return v;
    return FALLBACK_CITIES;
  } catch {
    // TODO: configs.salary.insurance.cities 未配置时 fallback
    return FALLBACK_CITIES;
  }
}

async function getBatchSize(): Promise<number> {
  try {
    const v = await configService.getValue('salary', 'insurance.batch_size');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : 200;
  } catch {
    // TODO: configs.salary.insurance.batch_size 未配置时 fallback
    return 200;
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

async function assertRegAccess(
  actorId: string,
  rec: { employeeId: string; employee?: { departmentId: string | null } },
): Promise<void> {
  const scope = await resolveActorScope(actorId);
  if (scope.unrestricted) return;

  if (scope.selfEmployeeId && rec.employeeId !== scope.selfEmployeeId) {
    throw new AppError('无权查看他人社保登记', 403);
  }
  if (scope.deptId) {
    const deptId = rec.employee?.departmentId
      ?? (await prisma.employee.findUnique({
        where: { id: rec.employeeId },
        select: { departmentId: true },
      }))?.departmentId;
    if (deptId !== scope.deptId) {
      throw new AppError('无权查看其他部门社保登记', 403);
    }
  }
}

function assertBaseInRange(
  baseSalary: number,
  min: Decimal | number,
  max: Decimal | number,
  label: string,
): void {
  const lo = toNumber(min);
  const hi = toNumber(max);
  if (baseSalary < lo || baseSalary > hi) {
    throw new AppError(`${label}缴费基数不在方案范围内`, 400);
  }
}

/**
 * 员工社保公积金登记（V1.2 §二.4.3 按员工参保地匹配）
 * @param actorId 操作人 ID（hr/admin）
 * @param input { employeeId, city, socialInsuranceSchemeId?, housingFundSchemeId?, baseSalary?, effectiveFrom? }
 * @returns 新创建的 employee_insurance_registrations 记录
 * @throws AppError(400) employee 不存在
 * @throws AppError(400, 73103) city 不在白名单
 * @throws AppError(400, 73101) social scheme 不存在
 * @throws AppError(400, 73106) housing fund 不存在
 * @throws AppError(400, 73110) 员工已有 active 登记
 * 校验链：
 *  1. 校验 employee 存在
 *  2. 校验 city 白名单 → 73103
 *  3. 若提供 socialInsuranceSchemeId：存在且 scheme.city === city
 *  4. 若提供 housingFundSchemeId：存在且 fund.city === city
 *  5. 已有 active 登记 → 73110
 *  6. baseSalary 默认读 employee_salary_plans（prisma 直读，不调 C1 service）
 *  7. baseSalary 须落在关联方案 baseMin~baseMax
 *  8. effectiveFrom 不传则用今天
 *  9. 创建（status=active）+ audit INSURANCE_REGISTRATION_CREATE
 *  注：C2 不实现实际算扣（留 C3）；不写 employee_salary_history
 */
export async function createRegistration(
  actorId: string,
  input: CreateRegistrationInput,
): Promise<EmployeeInsuranceRegistration> {
  const { employeeId, city, baseSalary: inputBase } = input;

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 400);
  }

  const cities = await getCities();
  if (!cities.includes(city)) {
    throw new AppError('参保城市不合法，应为 xi_an / bei_jing / si_chuan', 400, 73103);
  }

  let socialScheme: {
    id: string; city: string; baseMin: Decimal; baseMax: Decimal;
  } | null = null;
  if (input.socialInsuranceSchemeId) {
    socialScheme = await prisma.socialInsuranceScheme.findUnique({
      where: { id: input.socialInsuranceSchemeId },
    });
    if (!socialScheme) {
      throw new AppError('社保方案不存在', 400, 73101);
    }
    if (socialScheme.city !== city) {
      throw new AppError('社保方案城市与登记城市不匹配', 400);
    }
  }

  let fund: {
    id: string; city: string; baseMin: Decimal; baseMax: Decimal;
  } | null = null;
  if (input.housingFundSchemeId) {
    fund = await prisma.housingFundScheme.findUnique({
      where: { id: input.housingFundSchemeId },
    });
    if (!fund) {
      throw new AppError('公积金方案不存在', 400, 73106);
    }
    if (fund.city !== city) {
      throw new AppError('公积金方案城市与登记城市不匹配', 400);
    }
  }

  const existingActive = await prisma.employeeInsuranceRegistration.findFirst({
    where: { employeeId, status: 'active' },
  });
  if (existingActive) {
    throw new AppError('该员工已有生效社保登记', 400, 73110);
  }

  let baseSalary = inputBase;
  if (baseSalary == null) {
    const plan = await prisma.employeeSalaryPlan.findFirst({
      where: { employeeId, status: 'active' },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!plan) {
      throw new AppError('缺少缴费基数，且无当前薪酬方案可默认', 400);
    }
    baseSalary = toNumber(plan.baseSalary);
  }
  if (socialScheme) {
    assertBaseInRange(baseSalary, socialScheme.baseMin, socialScheme.baseMax, '社保');
  }
  if (fund) {
    assertBaseInRange(baseSalary, fund.baseMin, fund.baseMax, '公积金');
  }

  const effectiveFrom = input.effectiveFrom
    ? parseLocalDate(input.effectiveFrom)
    : startOfDay(new Date());

  const created = await prisma.employeeInsuranceRegistration.create({
    data: {
      employeeId,
      city: city as SocialInsuranceCity,
      socialInsuranceSchemeId: input.socialInsuranceSchemeId ?? null,
      housingFundSchemeId: input.housingFundSchemeId ?? null,
      baseSalary: new Decimal(baseSalary),
      effectiveFrom,
      effectiveTo: null,
      status: 'active',
      createdById: actorId,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'INSURANCE_REGISTRATION_CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: created.id,
    description: `创建社保登记 employee=${employeeId} city=${city}`,
    newValue: {
      employeeId,
      city,
      socialInsuranceSchemeId: input.socialInsuranceSchemeId,
      housingFundSchemeId: input.housingFundSchemeId,
      baseSalary,
      effectiveFrom,
    },
  });

  return created;
}

/**
 * 列出员工社保登记（employeeId / city / status 过滤 + 分页 + 权限过滤）
 */
export async function listRegistrations(
  actorId: string,
  filter: ListRegistrationFilter,
): Promise<PaginatedRegistrations> {
  const page = filter.page ?? 1;
  const batch = await getBatchSize();
  const pageSize = Math.min(filter.pageSize ?? 20, batch);
  if (page < 1 || pageSize < 1) {
    throw new AppError('分页参数不合法', 400);
  }

  const where: Prisma.EmployeeInsuranceRegistrationWhereInput = {};
  if (filter.employeeId) where.employeeId = filter.employeeId;
  if (filter.city) where.city = filter.city as SocialInsuranceCity;
  if (filter.status) {
    where.status = filter.status as Prisma.EnumEmployeeInsuranceRegistrationStatusFilter['equals'];
  }

  const scope = await resolveActorScope(actorId);
  if (scope.selfEmployeeId) {
    where.employeeId = scope.selfEmployeeId;
  } else if (scope.deptId) {
    where.employee = { departmentId: scope.deptId };
  }

  const [items, total] = await Promise.all([
    prisma.employeeInsuranceRegistration.findMany({
      where,
      orderBy: { effectiveFrom: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.employeeInsuranceRegistration.count({ where }),
  ]);

  return {
    items, total, page, pageSize,
  };
}

/**
 * 读员工当前生效社保登记
 * @throws AppError(400) employee 不存在
 * @throws AppError(400, 73109) 无当前生效登记
 */
export async function getActiveRegistration(
  actorId: string,
  employeeId: string,
): Promise<EmployeeInsuranceRegistration> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    select: { id: true, departmentId: true },
  });
  if (!employee) {
    throw new AppError('员工不存在', 400);
  }

  const now = startOfDay(new Date());
  const rec = await prisma.employeeInsuranceRegistration.findFirst({
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
  if (!rec) {
    throw new AppError('无当前生效社保登记', 400, 73109);
  }

  await assertRegAccess(actorId, { employeeId, employee });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'INSURANCE_REGISTRATION_READ',
    resourceType: RESOURCE_TYPE,
    resourceId: rec.id,
    description: `读取当前社保登记 employee=${employeeId}`,
  });

  return rec;
}

/**
 * 更新登记（仅 active 可改 effectiveTo / baseSalary；city 不可改）
 * @throws AppError(400, 73109) 不存在
 */
export async function updateRegistration(
  actorId: string,
  id: string,
  input: UpdateRegistrationInput,
): Promise<EmployeeInsuranceRegistration> {
  const rec = await prisma.employeeInsuranceRegistration.findUnique({ where: { id } });
  if (!rec) {
    throw new AppError('社保登记不存在', 400, 73109);
  }
  if (rec.status !== 'active') {
    throw new AppError('仅 active 登记可更新', 400);
  }

  const data: Prisma.EmployeeInsuranceRegistrationUpdateInput = {};
  if (input.effectiveTo) data.effectiveTo = parseLocalDate(input.effectiveTo);
  if (input.baseSalary != null) data.baseSalary = new Decimal(input.baseSalary);

  const updated = await prisma.employeeInsuranceRegistration.update({
    where: { id },
    data,
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'INSURANCE_REGISTRATION_UPDATE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '更新社保登记',
    newValue: { effectiveTo: input.effectiveTo, baseSalary: input.baseSalary },
  });

  return updated;
}

/**
 * 失效员工社保登记（active → inactive）
 * @throws AppError(400, 73109) 不存在
 * 注：不写 employee_salary_history
 */
export async function deactivateRegistration(
  actorId: string,
  id: string,
  input: { effectiveTo: Date | string; reason?: string },
): Promise<EmployeeInsuranceRegistration> {
  const rec = await prisma.employeeInsuranceRegistration.findUnique({ where: { id } });
  if (!rec) {
    throw new AppError('社保登记不存在', 400, 73109);
  }
  if (rec.status !== 'active') {
    throw new AppError('仅 active 登记可失效', 400);
  }

  const effectiveTo = parseLocalDate(input.effectiveTo);
  const updated = await prisma.employeeInsuranceRegistration.update({
    where: { id },
    data: { status: 'inactive', effectiveTo },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'INSURANCE_REGISTRATION_DEACTIVATE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `失效社保登记 ${id}`,
    newValue: { effectiveTo, reason: input.reason },
  });

  return updated;
}
