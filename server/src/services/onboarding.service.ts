// M1-A3: 入职流程 service | HRMS
// 状态机：draft → submitted → approved / cancelled
// OCR/审批/通知/加密/配置全部复用既有 export，零重写

import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import bcrypt from 'bcryptjs';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as approvalService from './approval.service';
import * as auditService from './audit.service';
import * as configService from './config.service';
import * as cryptoService from './crypto.service';
import * as employeeAIService from './employeeAI.service';
import * as notificationService from './notification.service';

const RESOURCE_TYPE = 'OnboardingRecord';

const CHECKLIST_CATEGORY_MAP: Record<string, string> = {
  设备发放: 'equipment',
  工位安排: 'workspace',
  导师分配: 'mentor',
  培训安排: 'training',
};

export interface CreateOnboardingInput {
  name: string;
  companyId: string;
  departmentId: string;
  hireDate: Date | string;
  contractType: string;
  gender?: string;
  birthDate?: Date | string;
  phone?: string;
  email?: string;
  probationMonths?: number;
  baseSalary?: number;
  idCard?: string;
  bankName?: string;
  bankCard?: string;
  certificates?: unknown;
  materialsChecklist?: Record<string, boolean>;
  createdBy?: string;
}

export interface UpdateOnboardingInput {
  name?: string;
  gender?: string;
  birthDate?: Date | string | null;
  phone?: string | null;
  email?: string | null;
  departmentId?: string;
  hireDate?: Date | string;
  contractType?: string;
  probationMonths?: number | null;
  baseSalary?: number | null;
  idCard?: string | null;
  bankName?: string | null;
  bankCard?: string | null;
  certificates?: unknown;
  materialsChecklist?: Record<string, boolean>;
}

export interface ListOnboardingsQuery {
  companyId?: string;
  departmentId?: string;
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export type OcrType = 'idCard' | 'bankCard' | 'certificate';

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

/**
 * 脱敏敏感字段（无敏感读权限时）
 */
function maskOnboardingSensitive<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  if (typeof out.idCard === 'string' && out.idCard.length > 0) {
    out.idCard = '****';
  }
  if (typeof out.phone === 'string' && out.phone.length > 0) {
    out.phone = '***';
  }
  if (typeof out.bankCard === 'string' && out.bankCard.length > 0) {
    out.bankCard = '****';
  }
  return out as T;
}

async function getRequiredMaterials(): Promise<string[]> {
  try {
    const v = await configService.getValue('onboarding', 'required_materials');
    if (Array.isArray(v)) return v.map(String);
    return ['idCard', 'bankCard', 'degreeCert'];
  } catch {
    // TODO: configs.onboarding.required_materials 未配置时 fallback
    return ['idCard', 'bankCard', 'degreeCert'];
  }
}

async function getChecklistTemplate(): Promise<string[]> {
  try {
    const v = await configService.getValue('onboarding', 'checklist');
    if (Array.isArray(v)) return v.map(String);
    return ['设备发放', '工位安排', '导师分配', '培训安排'];
  } catch {
    // TODO: configs.onboarding.checklist fallback
    return ['设备发放', '工位安排', '导师分配', '培训安排'];
  }
}

async function getProbationMonths(): Promise<number> {
  try {
    const v = await configService.getValue('probation', 'months');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 3;
  } catch {
    // TODO: configs.probation.months fallback
    return 3;
  }
}

async function getDefaultRole(): Promise<string> {
  try {
    const v = await configService.getValue('onboarding', 'default_role');
    return typeof v === 'string' ? v : 'employee';
  } catch {
    // TODO: configs.onboarding.default_role fallback
    return 'employee';
  }
}

async function getPasswordPattern(): Promise<string> {
  try {
    const v = await configService.getValue('onboarding', 'default_password_pattern');
    return typeof v === 'string' ? v : 'Welcome@{seq4}';
  } catch {
    // TODO: configs.onboarding.default_password_pattern fallback
    return 'Welcome@{seq4}';
  }
}

async function getEmployeeNoFormat(): Promise<string> {
  try {
    const v = await configService.getValue('employee_no', 'format');
    return typeof v === 'string' ? v : '{company_code}{year}{seq:4}';
  } catch {
    // TODO: configs.employee_no.format fallback
    return '{company_code}{year}{seq:4}';
  }
}

/**
 * 工号生成（与 employee.service.generateEmployeeNo 算法一致，后续抽 util）
 */
async function generateEmployeeNoLocal(companyCode: string): Promise<string> {
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
 * 必填材料校验
 */
async function validateMaterialsChecklist(
  materialsChecklist: Record<string, boolean> | null | undefined,
): Promise<void> {
  const required = await getRequiredMaterials();
  const checklist = materialsChecklist ?? {};
  const missing = required.filter((key) => checklist[key] !== true);
  if (missing.length > 0) {
    throw new AppError(
      `入职材料不完整: ${missing.join(', ')}`,
      400,
      71307,
    );
  }
}

/**
 * 提交审批（flowKey 须为 category:key，与 M0.5-1 parseFlowKey 一致）
 */
async function buildApprovalFlow(
  flowKey: string,
  businessType: string,
  businessId: string,
  initiatorId: string,
  title: string,
  data: Record<string, unknown>,
) {
  return approvalService.submitApproval({
    flowKey,
    businessType,
    businessId,
    initiatorId,
    title,
    data,
  });
}

/**
 * 创建入职草稿 + 引导任务
 */
export async function createOnboarding(input: CreateOnboardingInput) {
  await validateMaterialsChecklist(input.materialsChecklist);

  const company = await prisma.company.findFirst({
    where: { id: input.companyId, deletedAt: null },
  });
  if (!company) {
    throw new AppError('法人不存在', 404, 71001);
  }

  const dept = await prisma.department.findFirst({
    where: {
      id: input.departmentId,
      companyId: input.companyId,
      deletedAt: null,
    },
  });
  if (!dept) {
    throw new AppError('部门不存在', 404, 71101);
  }

  const probationMonths = input.probationMonths ?? await getProbationMonths();
  const checklist = await getChecklistTemplate();

  const record = await prisma.onboardingRecord.create({
    data: {
      name: input.name,
      gender: input.gender,
      birthDate: toDate(input.birthDate) ?? undefined,
      phone: encryptOptional(input.phone) ?? undefined,
      email: input.email,
      companyId: input.companyId,
      departmentId: input.departmentId,
      hireDate: toDate(input.hireDate) as Date,
      contractType: input.contractType,
      probationMonths,
      baseSalary: input.baseSalary !== undefined ? new Decimal(input.baseSalary) : undefined,
      idCard: encryptOptional(input.idCard) ?? undefined,
      bankName: input.bankName,
      bankCard: encryptOptional(input.bankCard) ?? undefined,
      certificates: (input.certificates as Prisma.InputJsonValue | undefined) ?? undefined,
      materialsChecklist: (input.materialsChecklist as Prisma.InputJsonValue) ?? undefined,
      status: 'draft',
      createdBy: input.createdBy,
      tasks: {
        create: checklist.map((name) => ({
          name,
          category: CHECKLIST_CATEGORY_MAP[name] ?? 'other',
          status: 'pending',
        })),
      },
    },
    include: { tasks: true },
  });

  await auditService.auditLog({
    userId: input.createdBy,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.CREATE,
    resourceType: RESOURCE_TYPE,
    resourceId: record.id,
    description: `创建入职草稿 ${record.name}`,
    newValue: {
      name: record.name, companyId: record.companyId, status: record.status,
    },
  });

  return record;
}

/**
 * 按 ID 查询（含 tasks）；敏感字段默认脱敏
 */
export async function getOnboardingById(id: string, revealSensitive = false) {
  const record = await prisma.onboardingRecord.findUnique({
    where: { id },
    include: { tasks: { orderBy: { createdAt: 'asc' } } },
  });
  if (!record) {
    throw new AppError('入职记录不存在', 404, 71301);
  }
  if (revealSensitive) return record;
  return maskOnboardingSensitive(record as unknown as Record<string, unknown>);
}

/**
 * 分页列表
 */
export async function listOnboardings(query: ListOnboardingsQuery = {}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where: Prisma.OnboardingRecordWhereInput = {
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.keyword
      ? { name: { contains: query.keyword, mode: 'insensitive' } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.onboardingRecord.findMany({
      where,
      include: { tasks: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.onboardingRecord.count({ where }),
  ]);

  const data = rows.map((r) => maskOnboardingSensitive(r as unknown as Record<string, unknown>));
  return {
    data, total, page, pageSize,
  };
}

/**
 * 更新草稿（仅 draft）
 */
export async function updateOnboarding(
  id: string,
  input: UpdateOnboardingInput,
  operatorId?: string,
) {
  const existing = await prisma.onboardingRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('入职记录不存在', 404, 71301);
  }
  if (existing.status !== 'draft') {
    throw new AppError('仅草稿状态可修改', 409, 71303);
  }

  if (input.materialsChecklist) {
    await validateMaterialsChecklist(input.materialsChecklist);
  }

  const updated = await prisma.onboardingRecord.update({
    where: { id },
    data: {
      name: input.name,
      gender: input.gender,
      birthDate: toDate(input.birthDate),
      phone: encryptOptional(input.phone),
      email: input.email,
      departmentId: input.departmentId,
      hireDate: toDate(input.hireDate) ?? undefined,
      contractType: input.contractType,
      probationMonths: input.probationMonths,
      baseSalary: (() => {
        if (input.baseSalary === undefined) return undefined;
        if (input.baseSalary === null) return null;
        return new Decimal(input.baseSalary);
      })(),
      idCard: encryptOptional(input.idCard),
      bankName: input.bankName,
      bankCard: encryptOptional(input.bankCard),
      certificates: (input.certificates as Prisma.InputJsonValue | undefined) ?? undefined,
      materialsChecklist: (input.materialsChecklist as Prisma.InputJsonValue | undefined)
        ?? undefined,
    },
    include: { tasks: true },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.UPDATE,
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `更新入职草稿 ${updated.name}`,
    oldValue: { status: existing.status },
    newValue: { name: updated.name },
  });

  return updated;
}

/**
 * 取消入职（draft / submitted）
 */
export async function cancelOnboarding(
  id: string,
  reason: string,
  operatorId: string,
) {
  const existing = await prisma.onboardingRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('入职记录不存在', 404, 71301);
  }
  if (existing.status === 'approved') {
    throw new AppError('已审批通过的入职不可取消', 409, 71303);
  }
  if (existing.status === 'cancelled') {
    throw new AppError('入职已取消', 409, 71310);
  }
  if (existing.status !== 'draft' && existing.status !== 'submitted') {
    throw new AppError('当前状态不可取消', 409, 71310);
  }

  if (existing.status === 'submitted' && existing.approvalInstanceId) {
    await approvalService.withdraw({
      instanceId: existing.approvalInstanceId,
      initiatorId: operatorId,
    });
  }

  const updated = await prisma.onboardingRecord.update({
    where: { id },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledReason: reason,
    },
    include: { tasks: true },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'CANCEL',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `取消入职 ${existing.name}`,
    oldValue: { status: existing.status },
    newValue: { status: 'cancelled', reason },
  });

  return updated;
}

/**
 * OCR 三合一（复用 employeeAI 三个 export）
 */
export async function parseOnboardingOCR(
  id: string,
  type: OcrType,
  imageBase64: string,
  operatorId?: string,
) {
  const existing = await prisma.onboardingRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('入职记录不存在', 404, 71301);
  }
  if (existing.status !== 'draft') {
    throw new AppError('仅草稿状态可 OCR', 409, 71303);
  }

  const checklist = (existing.materialsChecklist as Record<string, boolean> | null) ?? {};
  let ocrResult: unknown;
  const data: Prisma.OnboardingRecordUpdateInput = {};

  try {
    if (type === 'idCard') {
      const parsed = await employeeAIService.parseIdCard(imageBase64, operatorId);
      ocrResult = parsed;
      data.idCard = cryptoService.encrypt(parsed.idCardNumber, 1);
      data.idCardOcrAt = new Date();
      if (parsed.name) data.name = parsed.name;
      if (parsed.gender) data.gender = parsed.gender;
      if (parsed.birthDate) data.birthDate = new Date(parsed.birthDate);
      checklist.idCard = true;
    } else if (type === 'bankCard') {
      const parsed = await employeeAIService.parseBankCard(imageBase64, operatorId);
      ocrResult = parsed;
      data.bankCard = cryptoService.encrypt(parsed.cardNumber, 1);
      data.bankName = parsed.bankName;
      data.bankCardOcrAt = new Date();
      checklist.bankCard = true;
    } else {
      const parsed = await employeeAIService.parseCertificate(imageBase64, operatorId);
      ocrResult = parsed;
      const prev = Array.isArray(existing.certificates) ? existing.certificates : [];
      data.certificates = [...prev, parsed] as Prisma.InputJsonValue;
      checklist.degreeCert = true;
    }
  } catch (err) {
    if (err instanceof AppError && err.code === 71309) throw err;
    throw new AppError(
      `OCR 解析失败: ${err instanceof Error ? err.message : 'unknown'}`,
      502,
      71309,
    );
  }

  data.materialsChecklist = checklist as Prisma.InputJsonValue;

  const updated = await prisma.onboardingRecord.update({
    where: { id },
    data,
    include: { tasks: true },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.AI_OCR,
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `入职 OCR ${type}`,
    newValue: { type, fields: Object.keys(ocrResult as object) },
  });

  return { record: updated, ocrResult };
}

/**
 * 提交审批：draft → submitted
 */
export async function submitOnboarding(id: string, operatorId: string) {
  const existing = await prisma.onboardingRecord.findUnique({
    where: { id },
    include: { tasks: true },
  });
  if (!existing) {
    throw new AppError('入职记录不存在', 404, 71301);
  }
  if (existing.status !== 'draft') {
    throw new AppError('仅草稿可提交审批', 409, 71303);
  }

  await validateMaterialsChecklist(
    existing.materialsChecklist as Record<string, boolean> | null,
  );

  const checklist = await getChecklistTemplate();
  if (!existing.tasks || existing.tasks.length < checklist.length) {
    throw new AppError('入职引导任务未完整创建', 400, 71308);
  }

  const instance = await buildApprovalFlow(
    'onboarding:onboarding_approval',
    'onboarding',
    id,
    operatorId,
    `${existing.name} 入职审批`,
    {
      onboardingId: id,
      name: existing.name,
      companyId: existing.companyId,
      departmentId: existing.departmentId,
      hireDate: existing.hireDate.toISOString().slice(0, 10),
    },
  );

  const updated = await prisma.onboardingRecord.update({
    where: { id },
    data: {
      status: 'submitted',
      approvalInstanceId: instance.id,
    },
    include: { tasks: true },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.UPDATE,
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `提交入职审批 ${existing.name}`,
    oldValue: { status: 'draft' },
    newValue: { status: 'submitted', approvalInstanceId: instance.id },
  });

  return updated;
}

/**
 * 审批通过回调：submitted → approved；创建 employee + user
 */
export async function confirmOnboarding(
  id: string,
  approvalResult: { approved: boolean; instanceId?: string },
  operatorId: string,
) {
  const existing = await prisma.onboardingRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('入职记录不存在', 404, 71301);
  }
  if (existing.status === 'approved') {
    throw new AppError('入职已审批通过', 409, 71302);
  }
  if (existing.status !== 'submitted') {
    throw new AppError('非法状态转换：仅 submitted 可确认入职', 409, 71303);
  }
  if (!approvalResult.approved) {
    throw new AppError('审批未通过，无法确认入职', 400, 71306);
  }

  const company = await prisma.company.findFirst({
    where: { id: existing.companyId, deletedAt: null },
  });
  if (!company) {
    throw new AppError('法人不存在', 404, 71001);
  }

  const employeeNo = await generateEmployeeNoLocal(company.code);
  const dup = await prisma.employee.findFirst({ where: { employeeNo } });
  if (dup) {
    throw new AppError(`工号冲突: ${employeeNo}`, 409, 71304);
  }

  const roleCode = await getDefaultRole();
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) {
    throw new AppError(`默认角色不存在: ${roleCode}`, 500, 71305);
  }

  const pattern = await getPasswordPattern();
  const seq4 = employeeNo.slice(-4).padStart(4, '0');
  const plainPassword = pattern.replace('{seq4}', seq4);
  const passwordHash = await bcrypt.hash(plainPassword, 12);
  const username = `u${employeeNo.toLowerCase()}`;

  let userId: string;
  let employeeId: string;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          passwordHash,
          email: existing.email,
          mustChangePassword: true,
          status: 'active',
          userRoles: { create: { roleId: role.id } },
        },
      });

      const employee = await tx.employee.create({
        data: {
          employeeNo,
          name: existing.name,
          gender: existing.gender,
          birthDate: existing.birthDate,
          idCard: existing.idCard,
          phone: existing.phone,
          email: existing.email,
          bankName: existing.bankName,
          bankCard: existing.bankCard,
          certificates: existing.certificates ?? undefined,
          companyId: existing.companyId,
          departmentId: existing.departmentId,
          hireDate: existing.hireDate,
          contractType: existing.contractType,
          status: 'probation',
          userId: user.id,
          createdBy: operatorId,
        },
      });

      if (existing.baseSalary != null) {
        await tx.employeeSalaryHistory.create({
          data: {
            employeeId: employee.id,
            effectiveDate: existing.hireDate,
            baseSalary: existing.baseSalary,
            totalSalary: existing.baseSalary,
            changeType: 'hire',
            reason: '入职定薪',
            operatorId,
          },
        });
      }

      await tx.employeePositionHistory.create({
        data: {
          employeeId: employee.id,
          toCompanyId: existing.companyId,
          toDeptId: existing.departmentId,
          toPosition: '新员工',
          changeType: 'hire',
          changeDate: existing.hireDate,
          reason: '入职',
          operatorId,
        },
      });

      const onboarding = await tx.onboardingRecord.update({
        where: { id },
        data: {
          status: 'approved',
          employeeId: employee.id,
          approvalInstanceId: approvalResult.instanceId ?? existing.approvalInstanceId,
        },
        include: { tasks: true },
      });

      return { user, employee, onboarding };
    });

    userId = result.user.id;
    employeeId = result.employee.id;

    await notificationService.sendNotification({
      templateKey: 'onboarding_confirmed:in_app',
      userId,
      data: {
        employee_name: existing.name,
        employee_no: employeeNo,
        onboarding_id: id,
      },
      bypassTemplate: {
        channel: 'in_app',
        subject: '入职已确认',
        content: `您好 ${existing.name}，工号 ${employeeNo} 已开通，请首次登录后修改密码。`,
      },
    }).catch(() => undefined);

    await auditService.auditLog({
      userId: operatorId,
      actorType: 'USER',
      action: 'APPROVE',
      resourceType: RESOURCE_TYPE,
      resourceId: id,
      description: `确认入职 ${existing.name} → ${employeeNo}`,
      newValue: { employeeId, userId, employeeNo },
    });

    return result.onboarding;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      `创建账号失败: ${err instanceof Error ? err.message : 'unknown'}`,
      500,
      71305,
    );
  }
}

/**
 * 审批拒绝：submitted → cancelled
 */
export async function rejectOnboarding(
  id: string,
  reason: string,
  operatorId: string,
) {
  const existing = await prisma.onboardingRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('入职记录不存在', 404, 71301);
  }
  if (existing.status !== 'submitted') {
    throw new AppError('仅已提交状态可驳回', 409, 71303);
  }

  const updated = await prisma.onboardingRecord.update({
    where: { id },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledReason: reason,
    },
    include: { tasks: true },
  });

  if (existing.createdBy) {
    await notificationService.sendNotification({
      templateKey: 'onboarding_rejected:in_app',
      userId: existing.createdBy,
      data: {
        employee_name: existing.name,
        reason,
        onboarding_id: id,
      },
      bypassTemplate: {
        channel: 'in_app',
        subject: '入职审批已驳回',
        content: `${existing.name} 的入职申请已驳回：${reason}`,
      },
    }).catch(() => undefined);
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'REJECT',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `驳回入职 ${existing.name}`,
    oldValue: { status: 'submitted' },
    newValue: { status: 'cancelled', reason },
  });

  return updated;
}
