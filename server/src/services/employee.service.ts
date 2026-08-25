// M1-A2: 员工档案 service | HRMS
import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';
import * as cryptoService from './crypto.service';
import * as notificationService from './notification.service';

const SENSITIVE_FIELDS = [
  'idCard', 'bankCard', 'phone', 'emergencyContactPhone',
] as const;

export interface CreateEmployeeInput {
  companyId: string;
  departmentId: string;
  name: string;
  hireDate: Date | string;
  userId?: string;
  gender?: string;
  birthDate?: Date | string;
  idCard?: string;
  nativePlace?: string;
  ethnicity?: string;
  politicalStatus?: string;
  phone?: string;
  email?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  address?: string;
  educationLevel?: string;
  degree?: string;
  school?: string;
  major?: string;
  graduationDate?: Date | string;
  workHistory?: unknown;
  contractType?: string;
  contractStart?: Date | string;
  contractEnd?: Date | string;
  certificates?: unknown;
  bankName?: string;
  bankCard?: string;
  socialInsured?: boolean;
  socialCity?: string;
  socialBase?: number;
  housingFundCity?: string;
  housingFundRate?: number;
  housingFundBase?: number;
  status?: string;
  remark?: string;
  createdBy?: string;
  /** 入职岗位名（写入 position history） */
  position?: string;
  /** 可选：入职薪资（写入 salary history） */
  baseSalary?: number;
  performanceSalary?: number;
}

export interface UpdateEmployeeInput {
  name?: string;
  departmentId?: string;
  gender?: string;
  birthDate?: Date | string | null;
  idCard?: string;
  nativePlace?: string;
  ethnicity?: string;
  politicalStatus?: string;
  phone?: string;
  email?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  address?: string;
  educationLevel?: string;
  degree?: string;
  school?: string;
  major?: string;
  graduationDate?: Date | string | null;
  workHistory?: unknown;
  contractType?: string;
  contractStart?: Date | string | null;
  contractEnd?: Date | string | null;
  certificates?: unknown;
  bankName?: string;
  bankCard?: string;
  socialInsured?: boolean;
  socialCity?: string;
  socialBase?: number | null;
  housingFundCity?: string;
  housingFundRate?: number | null;
  housingFundBase?: number | null;
  status?: string;
  resignationDate?: Date | string | null;
  remark?: string;
}

export interface ListEmployeesQuery {
  companyId?: string;
  departmentId?: string;
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

function toDate(v: Date | string | undefined | null): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return v instanceof Date ? v : new Date(v);
}

function encryptOptional(value: string | undefined | null): string | undefined | null {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return cryptoService.encrypt(value, 1);
}

function tryDecryptPreview(ciphertext: string): string {
  try {
    return cryptoService.decrypt(ciphertext, 1);
  } catch {
    // 非密文或解密失败：按原文尾部脱敏
    return ciphertext;
  }
}

function toOptionalDecimal(v: number | string | null | undefined): Decimal | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return new Decimal(v);
}

/**
 * 脱敏：身份证保留后 4 位，手机号 ***
 */
export function maskSensitive<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  if (typeof out.idCard === 'string' && out.idCard.length > 0) {
    const plain = tryDecryptPreview(out.idCard);
    out.idCard = plain.length >= 4 ? `****${plain.slice(-4)}` : '****';
  }
  if (typeof out.phone === 'string' && out.phone.length > 0) {
    out.phone = '***';
  }
  if (typeof out.bankCard === 'string' && out.bankCard.length > 0) {
    const plain = tryDecryptPreview(out.bankCard);
    out.bankCard = plain.length >= 4 ? `****${plain.slice(-4)}` : '****';
  }
  if (typeof out.emergencyContactPhone === 'string' && out.emergencyContactPhone.length > 0) {
    out.emergencyContactPhone = '***';
  }
  return out as T;
}

async function getEmployeeNoFormat(): Promise<string> {
  try {
    const v = await configService.getValue('employee_no', 'format');
    return typeof v === 'string' ? v : '{company_code}{year}{seq:4}';
  } catch {
    // TODO: configs.employee_no.format 未配置时 fallback
    return '{company_code}{year}{seq:4}';
  }
}

async function getContractWarningDays(): Promise<number[]> {
  try {
    const v = await configService.getValue('contract', 'warning_days');
    if (Array.isArray(v)) return v.map(Number).filter((n) => Number.isFinite(n));
    return [30, 15, 7];
  } catch {
    // TODO: configs.contract.warning_days fallback
    return [30, 15, 7];
  }
}

async function getCertificateWarningDays(): Promise<number> {
  try {
    const v = await configService.getValue('certificate', 'warning_days');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 60;
  } catch {
    // TODO: configs.certificate.warning_days fallback
    return 60;
  }
}

/**
 * 按格式生成工号，如 XACH20260001
 */
async function generateEmployeeNo(companyCode: string): Promise<string> {
  const format = await getEmployeeNoFormat();
  const year = String(new Date().getFullYear());
  const prefix = format
    .replace('{company_code}', companyCode)
    .replace('{year}', year)
    .replace(/\{seq:\d+\}/, '');

  const latest = await prisma.employee.findFirst({
    where: { employeeNo: { startsWith: prefix } },
    orderBy: { employeeNo: 'desc' },
    select: { employeeNo: true },
  });

  let seq = 1;
  if (latest?.employeeNo) {
    const tail = latest.employeeNo.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) seq = n + 1;
  }

  const seqMatch = /\{seq:(\d+)\}/.exec(format);
  const width = seqMatch ? Number(seqMatch[1]) : 4;
  return `${prefix}${String(seq).padStart(width, '0')}`;
}

/**
 * 调度合同/资质到期通知（失败不阻断创建）
 */
async function scheduleWarnings(employee: {
  id: string;
  userId: string | null;
  name: string;
  contractEnd: Date | null;
  certificates: unknown;
}): Promise<void> {
  if (!employee.userId) return;
  const { userId } = employee;

  try {
    const daysList = await getContractWarningDays();
    const now = Date.now();
    if (employee.contractEnd) {
      const end = employee.contractEnd.getTime();
      const contractEndStr = employee.contractEnd.toISOString().slice(0, 10);
      await Promise.all(
        daysList
          .filter((days) => end - days * 24 * 60 * 60 * 1000 > now)
          .map((days) => notificationService.sendNotification({
            templateKey: 'contract_expiring:in_app',
            userId,
            data: {
              employee_name: employee.name,
              employee_id: employee.id,
              days_remaining: days,
              contract_end: contractEndStr,
            },
          }).catch(() => undefined)),
      );
    }

    const certDays = await getCertificateWarningDays();
    const certs = Array.isArray(employee.certificates) ? employee.certificates : [];
    await Promise.all(
      certs
        .map((c) => c as { name?: string; expireDate?: string })
        .filter((cert) => {
          if (!cert.expireDate) return false;
          const expire = new Date(cert.expireDate).getTime();
          return expire - certDays * 24 * 60 * 60 * 1000 > now;
        })
        .map((cert) => notificationService.sendNotification({
          templateKey: 'certificate_expiring:in_app',
          userId,
          data: {
            employee_name: employee.name,
            certificate_name: cert.name ?? '',
            days_remaining: certDays,
            expire_date: cert.expireDate as string,
          },
        }).catch(() => undefined)),
    );
  } catch {
    // 通知失败不阻断主流程
  }
}

/**
 * 创建员工档案
 */
export async function createEmployee(input: CreateEmployeeInput) {
  if (!input.departmentId) {
    throw new AppError('部门必填', 400, 71205);
  }
  if (!input.hireDate) {
    throw new AppError('入职日期必填', 400, 71205);
  }

  const company = await prisma.company.findFirst({
    where: { id: input.companyId, deletedAt: null },
  });
  if (!company) {
    throw new AppError('法人不存在', 404, 71001);
  }

  const dept = await prisma.department.findFirst({
    where: {
      id: input.departmentId, companyId: input.companyId, deletedAt: null,
    },
  });
  if (!dept) {
    throw new AppError('部门不存在', 404, 71101);
  }

  const employeeNo = await generateEmployeeNo(company.code);

  const dupNo = await prisma.employee.findFirst({
    where: { employeeNo, deletedAt: null },
  });
  if (dupNo) {
    throw new AppError(`工号已存在: ${employeeNo}`, 409, 71202);
  }

  const hireDate = toDate(input.hireDate)!;
  const data: Prisma.EmployeeCreateInput = {
    employeeNo,
    name: input.name,
    gender: input.gender,
    birthDate: toDate(input.birthDate) ?? undefined,
    idCard: encryptOptional(input.idCard) ?? undefined,
    nativePlace: input.nativePlace,
    ethnicity: input.ethnicity,
    politicalStatus: input.politicalStatus,
    phone: encryptOptional(input.phone) ?? undefined,
    email: input.email,
    emergencyContactName: input.emergencyContactName,
    emergencyContactPhone: encryptOptional(input.emergencyContactPhone) ?? undefined,
    address: input.address,
    educationLevel: input.educationLevel,
    degree: input.degree,
    school: input.school,
    major: input.major,
    graduationDate: toDate(input.graduationDate) ?? undefined,
    workHistory: (input.workHistory as Prisma.InputJsonValue | undefined) ?? undefined,
    contractType: input.contractType,
    contractStart: toDate(input.contractStart) ?? undefined,
    contractEnd: toDate(input.contractEnd) ?? undefined,
    certificates: (input.certificates as Prisma.InputJsonValue | undefined) ?? undefined,
    bankName: input.bankName,
    bankCard: encryptOptional(input.bankCard) ?? undefined,
    socialInsured: input.socialInsured ?? false,
    socialCity: input.socialCity,
    socialBase: input.socialBase !== undefined ? new Decimal(input.socialBase) : undefined,
    housingFundCity: input.housingFundCity,
    housingFundRate: input.housingFundRate !== undefined
      ? new Decimal(input.housingFundRate) : undefined,
    housingFundBase: input.housingFundBase !== undefined
      ? new Decimal(input.housingFundBase) : undefined,
    status: input.status ?? 'probation',
    hireDate,
    remark: input.remark,
    createdBy: input.createdBy,
    company: { connect: { id: input.companyId } },
    department: { connect: { id: input.departmentId } },
    ...(input.userId ? { user: { connect: { id: input.userId } } } : {}),
  };

  const employee = await prisma.employee.create({ data });

  await prisma.employeePositionHistory.create({
    data: {
      employeeId: employee.id,
      fromCompanyId: null,
      fromDeptId: null,
      fromPosition: null,
      toCompanyId: input.companyId,
      toDeptId: input.departmentId,
      toPosition: input.position ?? '员工',
      changeType: 'hire',
      changeDate: hireDate,
      reason: '首次入职',
      operatorId: input.createdBy,
    },
  });

  if (input.baseSalary !== undefined) {
    const base = input.baseSalary;
    const perf = input.performanceSalary ?? 0;
    await prisma.employeeSalaryHistory.create({
      data: {
        employeeId: employee.id,
        effectiveDate: hireDate,
        baseSalary: new Decimal(base),
        performanceSalary: new Decimal(perf),
        totalSalary: new Decimal(base + perf),
        changeType: 'hire',
        reason: '入职定薪',
        operatorId: input.createdBy,
      },
    });
  }

  await auditService.auditLog({
    userId: input.createdBy,
    action: auditService.AUDIT_ACTIONS.CREATE,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.EMPLOYEE,
    resourceId: employee.id,
    description: `创建员工 ${employee.employeeNo} ${employee.name}`,
    newValue: {
      employeeNo: employee.employeeNo,
      name: employee.name,
      companyId: employee.companyId,
      departmentId: employee.departmentId,
    },
  });

  await scheduleWarnings(employee);

  return maskSensitive(employee as unknown as Record<string, unknown>);
}

/**
 * 按 ID 查询（脱敏）
 */
export async function getEmployeeById(id: string) {
  const emp = await prisma.employee.findFirst({
    where: { id, deletedAt: null },
  });
  if (!emp) {
    throw new AppError('员工不存在', 404, 71201);
  }
  return maskSensitive(emp as unknown as Record<string, unknown>);
}

/**
 * 按工号查询
 */
export async function getEmployeeByEmployeeNo(employeeNo: string) {
  const emp = await prisma.employee.findFirst({
    where: { employeeNo, deletedAt: null },
  });
  if (!emp) {
    throw new AppError('员工不存在', 404, 71201);
  }
  return maskSensitive(emp as unknown as Record<string, unknown>);
}

/**
 * 员工列表（脱敏 + 分页）
 */
export async function listEmployees(query: ListEmployeesQuery = {}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where: Prisma.EmployeeWhereInput = {
    deletedAt: null,
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.keyword
      ? {
        OR: [
          { name: { contains: query.keyword } },
          { employeeNo: { contains: query.keyword } },
          { email: { contains: query.keyword } },
        ],
      }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.employee.count({ where }),
  ]);

  return {
    data: rows.map((r) => maskSensitive(r as unknown as Record<string, unknown>)),
    total,
    page,
    pageSize,
  };
}

/**
 * 更新员工（敏感字段变更时重新加密）
 */
export async function updateEmployee(
  id: string,
  input: UpdateEmployeeInput,
  operatorId?: string,
) {
  const existing = await prisma.employee.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw new AppError('员工不存在', 404, 71201);
  }
  if (existing.status === 'resigned' && input.status && input.status !== 'resigned') {
    throw new AppError('已离职员工不可恢复为在职（请走 A6 流程）', 400, 71204);
  }
  if (input.status && !['probation', 'active', 'resigned'].includes(input.status)) {
    throw new AppError('非法状态转换', 400, 71206);
  }

  if (input.departmentId) {
    const dept = await prisma.department.findFirst({
      where: {
        id: input.departmentId,
        companyId: existing.companyId,
        deletedAt: null,
      },
    });
    if (!dept) {
      throw new AppError('部门不存在', 404, 71101);
    }
  }

  const data: Prisma.EmployeeUpdateInput = {
    name: input.name,
    gender: input.gender,
    birthDate: toDate(input.birthDate),
    nativePlace: input.nativePlace,
    ethnicity: input.ethnicity,
    politicalStatus: input.politicalStatus,
    email: input.email,
    emergencyContactName: input.emergencyContactName,
    address: input.address,
    educationLevel: input.educationLevel,
    degree: input.degree,
    school: input.school,
    major: input.major,
    graduationDate: toDate(input.graduationDate),
    workHistory: (input.workHistory as Prisma.InputJsonValue | undefined) ?? undefined,
    contractType: input.contractType,
    contractStart: toDate(input.contractStart),
    contractEnd: toDate(input.contractEnd),
    certificates: (input.certificates as Prisma.InputJsonValue | undefined) ?? undefined,
    bankName: input.bankName,
    socialInsured: input.socialInsured,
    socialCity: input.socialCity,
    socialBase: toOptionalDecimal(input.socialBase),
    housingFundCity: input.housingFundCity,
    housingFundRate: toOptionalDecimal(input.housingFundRate),
    housingFundBase: toOptionalDecimal(input.housingFundBase),
    status: input.status,
    resignationDate: toDate(input.resignationDate),
    remark: input.remark,
    ...(input.departmentId
      ? { department: { connect: { id: input.departmentId } } }
      : {}),
  };

  if (input.idCard !== undefined) {
    data.idCard = encryptOptional(input.idCard);
  }
  if (input.phone !== undefined) {
    data.phone = encryptOptional(input.phone);
  }
  if (input.bankCard !== undefined) {
    data.bankCard = encryptOptional(input.bankCard);
  }
  if (input.emergencyContactPhone !== undefined) {
    data.emergencyContactPhone = encryptOptional(input.emergencyContactPhone);
  }

  const updated = await prisma.employee.update({ where: { id }, data });

  await auditService.auditLog({
    userId: operatorId,
    action: auditService.AUDIT_ACTIONS.UPDATE,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.EMPLOYEE,
    resourceId: id,
    description: `更新员工 ${updated.employeeNo}`,
    oldValue: {
      status: existing.status,
      departmentId: existing.departmentId,
      sensitiveChanged: SENSITIVE_FIELDS.some((f) => input[f] !== undefined),
    },
    newValue: {
      status: updated.status,
      departmentId: updated.departmentId,
    },
  });

  return maskSensitive(updated as unknown as Record<string, unknown>);
}

/**
 * 软删除员工
 */
export async function deleteEmployee(id: string, operatorId?: string) {
  const existing = await prisma.employee.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw new AppError('员工不存在', 404, 71201);
  }

  const deleted = await prisma.employee.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await auditService.auditLog({
    userId: operatorId,
    action: auditService.AUDIT_ACTIONS.DELETE,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.EMPLOYEE,
    resourceId: id,
    description: `软删除员工 ${existing.employeeNo}`,
  });

  return maskSensitive(deleted as unknown as Record<string, unknown>);
}

/**
 * 员工统计
 */
export async function getEmployeeStatistics(companyId?: string) {
  const base: Prisma.EmployeeWhereInput = {
    deletedAt: null,
    ...(companyId ? { companyId } : {}),
  };

  const [total, active, probation, resigned] = await Promise.all([
    prisma.employee.count({ where: base }),
    prisma.employee.count({ where: { ...base, status: 'active' } }),
    prisma.employee.count({ where: { ...base, status: 'probation' } }),
    prisma.employee.count({ where: { ...base, status: 'resigned' } }),
  ]);

  const byDept = await prisma.employee.groupBy({
    by: ['departmentId'],
    where: { ...base, status: { not: 'resigned' } },
    _count: { _all: true },
  });

  const byCompany = await prisma.employee.groupBy({
    by: ['companyId'],
    where: { ...base, status: { not: 'resigned' } },
    _count: { _all: true },
  });

  return {
    total,
    active,
    probation,
    resigned,
    perDepartment: Object.fromEntries(
      byDept.map((r) => [r.departmentId ?? 'null', r._count._all]),
    ),
    perCompany: Object.fromEntries(
      byCompany.map((r) => [r.companyId, r._count._all]),
    ),
  };
}

/**
 * N 天内合同到期的员工
 */
export async function getContractExpiringEmployees(companyId: string, days: number) {
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const rows = await prisma.employee.findMany({
    where: {
      companyId,
      deletedAt: null,
      status: { not: 'resigned' },
      contractEnd: { gte: now, lte: until },
    },
    orderBy: { contractEnd: 'asc' },
  });

  await auditService.auditLog({
    action: auditService.AUDIT_ACTIONS.EXPORT,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.EMPLOYEE,
    description: `合同到期查询 company=${companyId} days=${days} count=${rows.length}`,
  });

  return rows.map((r) => maskSensitive(r as unknown as Record<string, unknown>));
}
