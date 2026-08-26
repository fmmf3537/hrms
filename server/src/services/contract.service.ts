// M1-A7: 合同管理 service | HRMS
// 状态机：draft → pending_signature → signing → signed / expired / cancelled
// 仅 import approval/audit/config/notification/crypto + prisma；员工关联走 prisma 直接查询

import { createHmac, randomUUID } from 'crypto';

import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as approvalService from './approval.service';
import * as auditService from './audit.service';
import * as configService from './config.service';
import * as cryptoService from './crypto.service';
import * as notificationService from './notification.service';

const RESOURCE_TYPE = 'ContractRecord';

const CONTRACT_TYPES = ['formal', 'intern', 'consultant', 'labor', 'nda'] as const;
type ContractType = (typeof CONTRACT_TYPES)[number];

const NOTIFY_SIGNED = 'contract_signed:in_app';
const NOTIFY_REJECTED = 'contract_esign_rejected:in_app';
const NOTIFY_EXPIRING = 'contract_expiring:in_app';

const DEFAULT_TEMPLATES: Record<string, string> = {
  formal: '/templates/contract-formal.html',
  intern: '/templates/contract-intern.html',
  consultant: '/templates/contract-consultant.html',
  labor: '/templates/contract-labor.html',
  nda: '/templates/contract-nda.html',
};

export interface ContractAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedAt?: string;
}

export interface ContractSignatory {
  name: string;
  role: string;
  phone?: string;
  email?: string;
  signed?: boolean;
}

export interface CreateContractInput {
  employeeId: string;
  contractType: string;
  title: string;
  startDate: Date | string;
  endDate: Date | string;
  probationMonths?: number;
  baseSalary?: number;
  position?: string;
  workLocation?: string;
  templateKey: string;
  attachments?: ContractAttachment[];
  signatories?: ContractSignatory[];
}

export interface UpdateContractInput {
  contractType?: string;
  title?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  probationMonths?: number | null;
  baseSalary?: number | null;
  position?: string | null;
  workLocation?: string | null;
  templateKey?: string;
  attachments?: ContractAttachment[] | null;
  signatories?: ContractSignatory[] | null;
}

export interface ListContractsQuery {
  employeeId?: string;
  contractType?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface ESignCallbackPayload {
  flowId: string;
  signStatus: string;
  signedAt?: string;
  signatories?: ContractSignatory[];
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function startOfDay(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toOptionalDecimal(v: number | null | undefined): Decimal | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return new Decimal(v);
}

function isContractType(v: string): v is ContractType {
  return (CONTRACT_TYPES as readonly string[]).includes(v);
}

async function getEsignProvider(): Promise<string> {
  try {
    const v = await configService.getValue('contract', 'esign_provider');
    return typeof v === 'string' ? v : 'mock';
  } catch {
    // TODO: configs.contract.esign_provider fallback
    return 'mock';
  }
}

async function getWebhookSecret(): Promise<string> {
  try {
    const v = await configService.getValue('contract', 'esign_webhook_secret');
    const raw = typeof v === 'string' ? v : 'mock-webhook-secret';
    if (cryptoService.isEncrypted(raw)) {
      return cryptoService.decrypt(raw);
    }
    return raw;
  } catch {
    // TODO: configs.contract.esign_webhook_secret fallback
    return 'mock-webhook-secret';
  }
}

async function getAttachmentMaxSize(): Promise<number> {
  try {
    const v = await configService.getValue('contract', 'attachment_max_size');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 10 * 1024 * 1024;
  } catch {
    // TODO: configs.contract.attachment_max_size fallback
    return 10 * 1024 * 1024;
  }
}

async function getAttachmentAllowedTypes(): Promise<string[]> {
  try {
    const v = await configService.getValue('contract', 'attachment_allowed_types');
    if (Array.isArray(v)) return v.map(String);
    return ['application/pdf', 'image/jpeg', 'image/png'];
  } catch {
    // TODO: configs.contract.attachment_allowed_types fallback
    return ['application/pdf', 'image/jpeg', 'image/png'];
  }
}

async function getApprovalFlowKey(): Promise<string> {
  try {
    const v = await configService.getValue('contract', 'approval_flow_key');
    return typeof v === 'string' ? v : 'contract:contract_approval';
  } catch {
    // TODO: configs.contract.approval_flow_key fallback
    return 'contract:contract_approval';
  }
}

async function getTemplates(): Promise<Record<string, string>> {
  try {
    const v = await configService.getValue('contract', 'templates');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return { ...DEFAULT_TEMPLATES, ...(v as Record<string, string>) };
    }
    return { ...DEFAULT_TEMPLATES };
  } catch {
    // TODO: configs.contract.templates fallback
    return { ...DEFAULT_TEMPLATES };
  }
}

async function getTestMode(): Promise<boolean> {
  try {
    const v = await configService.getValue('contract', 'test_mode');
    if (typeof v === 'boolean') return v;
    return Boolean(v);
  } catch {
    // TODO: configs.contract.test_mode fallback
    return true;
  }
}

/**
 * 内部：附件校验
 */
async function validateAttachments(attachments: ContractAttachment[]): Promise<void> {
  const maxSize = await getAttachmentMaxSize();
  const allowed = await getAttachmentAllowedTypes();

  const invalidSize = attachments.find((att) => att.size > maxSize);
  if (invalidSize) {
    throw new AppError('附件大小超过限制', 400, 71705);
  }
  const invalidType = attachments.find((att) => !allowed.includes(att.type));
  if (invalidType) {
    throw new AppError('附件类型不在白名单', 400, 71705);
  }
  const invalidUrl = attachments.find(
    (att) => !att.url.startsWith('http://') && !att.url.startsWith('https://'),
  );
  if (invalidUrl) {
    throw new AppError('附件 URL 格式不合法', 400, 71705);
  }
}

/**
 * 校验合同类型与模板
 */
async function validateContractTypeAndTemplate(
  contractType: string,
  templateKey: string,
): Promise<void> {
  if (!isContractType(contractType)) {
    throw new AppError('合同类型不合法', 400, 71710);
  }
  const templates = await getTemplates();
  if (!templates[templateKey]) {
    throw new AppError('合同模板不存在', 400, 71710);
  }
}

/**
 * 校验日期
 */
function validateDates(startDate: Date, endDate: Date): void {
  if (startDate >= endDate) {
    throw new AppError('合同日期不合法', 400, 71704);
  }
}

/**
 * 校验无冲突 active 合同（nda 可与其它类型并存）
 */
async function validateNoActiveContract(
  employeeId: string,
  contractType: string,
): Promise<void> {
  const existing = await prisma.contractRecord.findFirst({
    where: {
      employeeId,
      status: { notIn: ['cancelled', 'expired'] },
      ...(contractType === 'nda'
        ? { contractType: 'nda' }
        : { contractType: { not: 'nda' } }),
    },
  });
  if (existing) {
    throw new AppError('该员工已有进行中的合同', 409, 71709);
  }
}

/**
 * 内部：合同编号自动生成 CT-{type2}-{year}{seq:4}
 */
async function generateContractNo(contractType: string): Promise<string> {
  const prefix2 = contractType.slice(0, 2).toUpperCase();
  const year = String(new Date().getFullYear());
  const prefix = `CT-${prefix2}-${year}`;

  const latest = await prisma.contractRecord.findFirst({
    where: { contractNo: { startsWith: prefix } },
    orderBy: { contractNo: 'desc' },
    select: { contractNo: true },
  });

  let seq = 1;
  if (latest?.contractNo) {
    const tail = latest.contractNo.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) seq = n + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function enrichContract(record: {
  employeeId: string;
  [key: string]: unknown;
}) {
  const employee = await prisma.employee.findFirst({
    where: { id: record.employeeId, deletedAt: null },
    select: {
      id: true, employeeNo: true, name: true, status: true, email: true,
    },
  });
  return { ...record, employee };
}

/**
 * 计算 webhook HMAC 签名（供验签与测试）
 */
export function computeWebhookSignature(
  payload: string,
  secret: string,
): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * 内部：发起 e-签宝 mock
 */
async function initiateSignFlow(
  contractId: string,
  operatorId: string,
): Promise<{ flowId: string; flowUrl: string | null }> {
  const provider = await getEsignProvider();
  if (provider !== 'mock') {
    // TODO: 二期接 e-签宝真实 SaaS
    throw new AppError('电子签失败：仅支持 mock 模式', 400, 71707);
  }

  const flowId = `mock-${randomUUID()}`;

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.UPDATE,
    resourceType: RESOURCE_TYPE,
    resourceId: contractId,
    description: 'e-签宝 mock 发起',
    newValue: { esignFlowId: flowId, provider: 'mock' },
  });

  return { flowId, flowUrl: null };
}

/**
 * 创建合同草稿（draft）
 */
export async function createContract(
  input: CreateContractInput,
  createdBy: string,
) {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404, 71201);
  }

  await validateContractTypeAndTemplate(input.contractType, input.templateKey);

  const startDate = toDate(input.startDate);
  const endDate = toDate(input.endDate);
  validateDates(startDate, endDate);

  if (input.attachments?.length) {
    await validateAttachments(input.attachments);
  }

  await validateNoActiveContract(input.employeeId, input.contractType);

  const contractNo = await generateContractNo(input.contractType);
  const esignProvider = await getEsignProvider();

  const defaultSignatories: ContractSignatory[] = input.signatories ?? [
    { name: employee.name, role: 'employee', signed: false },
    { name: 'HR', role: 'hr', signed: false },
  ];

  const record = await prisma.contractRecord.create({
    data: {
      employeeId: input.employeeId,
      contractNo,
      contractType: input.contractType,
      title: input.title,
      startDate,
      endDate,
      probationMonths: input.probationMonths,
      baseSalary: input.baseSalary !== undefined ? new Decimal(input.baseSalary) : undefined,
      position: input.position,
      workLocation: input.workLocation,
      templateKey: input.templateKey,
      attachments: input.attachments as Prisma.InputJsonValue | undefined,
      signatories: defaultSignatories as unknown as Prisma.InputJsonValue,
      esignProvider,
      status: 'draft',
      createdBy,
    },
  });

  await auditService.auditLog({
    userId: createdBy,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.CREATE,
    resourceType: RESOURCE_TYPE,
    resourceId: record.id,
    description: `创建合同草稿 ${contractNo}`,
    newValue: {
      employeeId: input.employeeId,
      contractType: input.contractType,
      contractNo,
    },
  });

  return record;
}

/**
 * 单查（含 employee 关联）
 */
export async function getContractById(id: string) {
  const record = await prisma.contractRecord.findUnique({ where: { id } });
  if (!record) {
    throw new AppError('合同不存在', 404, 71701);
  }
  return enrichContract(record);
}

/**
 * 列表（分页 + 过滤）
 */
export async function listContracts(query: ListContractsQuery = {}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where: Prisma.ContractRecordWhereInput = {
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.contractType ? { contractType: query.contractType } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.contractRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contractRecord.count({ where }),
  ]);

  const enriched = await Promise.all(data.map((r) => enrichContract(r)));

  return {
    data: enriched,
    total,
    page,
    pageSize,
  };
}

/**
 * 更新（仅 draft 状态可改）
 */
export async function updateContract(
  id: string,
  input: UpdateContractInput,
  operatorId: string,
) {
  const existing = await prisma.contractRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('合同不存在', 404, 71701);
  }
  if (existing.status !== 'draft') {
    throw new AppError('仅草稿状态可更新', 409, 71703);
  }

  const contractType = input.contractType ?? existing.contractType;
  const templateKey = input.templateKey ?? existing.templateKey;
  await validateContractTypeAndTemplate(contractType, templateKey);

  const startDate = input.startDate !== undefined
    ? toDate(input.startDate)
    : existing.startDate;
  const endDate = input.endDate !== undefined
    ? toDate(input.endDate)
    : existing.endDate;
  validateDates(startDate, endDate);

  if (input.attachments?.length) {
    await validateAttachments(input.attachments);
  }

  const updated = await prisma.contractRecord.update({
    where: { id },
    data: {
      contractType: input.contractType,
      title: input.title,
      startDate: input.startDate !== undefined ? startDate : undefined,
      endDate: input.endDate !== undefined ? endDate : undefined,
      probationMonths: input.probationMonths,
      baseSalary: toOptionalDecimal(input.baseSalary),
      position: input.position,
      workLocation: input.workLocation,
      templateKey: input.templateKey,
      attachments: input.attachments === null
        ? Prisma.JsonNull
        : (input.attachments as Prisma.InputJsonValue | undefined),
      signatories: input.signatories === null
        ? Prisma.JsonNull
        : (input.signatories as Prisma.InputJsonValue | undefined),
    },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.UPDATE,
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '更新合同草稿',
    oldValue: { status: existing.status },
    newValue: { title: updated.title },
  });

  return updated;
}

/**
 * 提交审批 + 发起电子签（draft → pending_signature → signing）
 */
export async function submitContract(id: string, operatorId: string) {
  const existing = await prisma.contractRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('合同不存在', 404, 71701);
  }
  if (existing.status === 'signed' || existing.status === 'signing') {
    throw new AppError('合同已签发或签署中', 409, 71702);
  }
  if (existing.status !== 'draft') {
    throw new AppError('仅草稿可提交', 409, 71702);
  }

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
  });
  if (!employee) {
    throw new AppError('员工不存在', 404, 71201);
  }

  const flowKey = await getApprovalFlowKey();
  const instance = await approvalService.submitApproval({
    flowKey,
    businessType: 'contract',
    businessId: id,
    initiatorId: operatorId,
    title: `${employee.name} - ${existing.title} 合同审批`,
    data: {
      employeeId: existing.employeeId,
      contractType: existing.contractType,
      startDate: existing.startDate.toISOString().slice(0, 10),
      endDate: existing.endDate.toISOString().slice(0, 10),
      baseSalary: existing.baseSalary != null ? Number(existing.baseSalary) : null,
    },
  });

  await prisma.contractRecord.update({
    where: { id },
    data: {
      status: 'pending_signature',
      approvalInstanceId: instance.id,
    },
  });

  const { flowId, flowUrl } = await initiateSignFlow(id, operatorId);

  const updated = await prisma.contractRecord.update({
    where: { id },
    data: {
      status: 'signing',
      esignFlowId: flowId,
      esignFlowUrl: flowUrl,
    },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.UPDATE,
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `提交合同并 e-签宝 mock 发起 ${flowId}`,
    oldValue: { status: 'draft' },
    newValue: { status: 'signing', esignFlowId: flowId },
  });

  return updated;
}

/**
 * e-签宝 webhook 回调
 */
export async function handleESignCallback(
  payload: ESignCallbackPayload,
  signature: string,
) {
  const secret = await getWebhookSecret();
  const payloadStr = JSON.stringify(payload);
  const testMode = await getTestMode();
  const expected = computeWebhookSignature(payloadStr, secret);

  const signatureValid = signature === expected
    || (testMode && signature === 'valid-signature');

  if (!signatureValid) {
    throw new AppError('webhook 验签失败', 400, 71707);
  }

  const existing = await prisma.contractRecord.findFirst({
    where: { esignFlowId: payload.flowId },
  });
  if (!existing) {
    throw new AppError('合同不存在', 404, 71701);
  }
  if (existing.status !== 'signing') {
    throw new AppError('当前状态不允许签署回调', 409, 71703);
  }

  if (payload.signStatus === 'rejected') {
    const updated = await prisma.contractRecord.update({
      where: { id: existing.id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledReason: '电子签被拒绝',
      },
    });

    if (existing.createdBy) {
      await notificationService.sendNotification({
        templateKey: NOTIFY_REJECTED,
        userId: existing.createdBy,
        data: {
          contract_id: existing.id,
          contract_no: existing.contractNo,
        },
        bypassTemplate: {
          channel: 'in_app',
          subject: '合同电子签被拒绝',
          content: `合同 ${existing.contractNo} 电子签被拒绝，请重新发起或终止。`,
        },
      }).catch(() => undefined);
    }

    await auditService.auditLog({
      userId: null,
      actorType: 'INTEGRATION',
      action: 'CANCEL',
      resourceType: RESOURCE_TYPE,
      resourceId: existing.id,
      description: '电子签被拒绝',
      newValue: { status: 'cancelled' },
    });

    return updated;
  }

  if (payload.signStatus !== 'completed') {
    throw new AppError('电子签状态未知', 400, 71707);
  }

  const signedAt = payload.signedAt ? new Date(payload.signedAt) : new Date();
  const signatories = payload.signatories ?? existing.signatories;

  const updated = await prisma.contractRecord.update({
    where: { id: existing.id },
    data: {
      status: 'signed',
      signedAt,
      signedBy: existing.createdBy,
      signatories: signatories as Prisma.InputJsonValue,
    },
  });

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
    select: { name: true, userId: true },
  });

  if (employee?.userId) {
    await notificationService.sendNotification({
      templateKey: NOTIFY_SIGNED,
      userId: employee.userId,
      data: {
        contract_no: existing.contractNo,
        employee_name: employee.name,
        end_date: existing.endDate.toISOString().slice(0, 10),
      },
      bypassTemplate: {
        channel: 'in_app',
        subject: '合同已签署',
        content: `${employee.name}，您的合同 ${existing.contractNo} 已签署完成。`,
      },
    }).catch(() => undefined);
  }

  await auditService.auditLog({
    userId: null,
    actorType: 'INTEGRATION',
    action: 'COMPLETE_SIGN',
    resourceType: RESOURCE_TYPE,
    resourceId: existing.id,
    description: '电子签完成',
    newValue: { status: 'signed', signedAt: signedAt.toISOString() },
  });

  return updated;
}

/**
 * 合同到期流转（signed → expired）
 */
export async function expireContract(contractId: string) {
  const existing = await prisma.contractRecord.findUnique({ where: { id: contractId } });
  if (!existing) {
    throw new AppError('合同不存在', 404, 71701);
  }
  if (existing.status !== 'signed') {
    throw new AppError('仅已签署合同可到期', 409, 71703);
  }

  const updated = await prisma.contractRecord.update({
    where: { id: contractId },
    data: {
      status: 'expired',
      expiredAt: new Date(),
    },
  });

  const employee = await prisma.employee.findFirst({
    where: { id: existing.employeeId, deletedAt: null },
    select: { name: true, userId: true },
  });

  if (employee?.userId) {
    await notificationService.sendNotification({
      templateKey: NOTIFY_EXPIRING,
      userId: employee.userId,
      data: {
        contract_no: existing.contractNo,
        end_date: existing.endDate.toISOString().slice(0, 10),
      },
      bypassTemplate: {
        channel: 'in_app',
        subject: '合同已到期',
        content: `合同 ${existing.contractNo} 已到期，请关注续签。`,
      },
    }).catch(() => undefined);
  }

  await auditService.auditLog({
    userId: null,
    actorType: 'SYSTEM',
    action: 'EXPIRE',
    resourceType: RESOURCE_TYPE,
    resourceId: contractId,
    description: '合同到期',
    newValue: { status: 'expired' },
  });

  return updated;
}

/**
 * 撤回 / 取消
 */
export async function cancelContract(
  id: string,
  reason: string,
  operatorId: string,
) {
  const existing = await prisma.contractRecord.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('合同不存在', 404, 71701);
  }
  if (existing.status === 'signed' || existing.status === 'expired') {
    throw new AppError('已签/已到期合同不可取消', 409, 71706);
  }
  if (existing.status === 'cancelled') {
    throw new AppError('合同已取消', 409, 71703);
  }

  if (existing.status === 'pending_signature' && existing.approvalInstanceId) {
    await approvalService.withdraw({
      instanceId: existing.approvalInstanceId,
      initiatorId: operatorId,
    });
  }

  if (existing.status === 'signing') {
    await auditService.auditLog({
      userId: operatorId,
      actorType: 'USER',
      action: 'CANCEL',
      resourceType: RESOURCE_TYPE,
      resourceId: id,
      description: 'e-签宝 mock 撤销',
      newValue: { esignFlowId: existing.esignFlowId, reason },
    });
  }

  const updated = await prisma.contractRecord.update({
    where: { id },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledBy: operatorId,
      cancelledReason: reason,
    },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'CANCEL',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '取消合同',
    oldValue: { status: existing.status },
    newValue: { status: 'cancelled', reason },
  });

  return updated;
}

/**
 * 给 BullMQ 调用的即将到期合同列表
 */
export async function listExpiringContracts(days: number) {
  const now = startOfDay();
  const end = new Date(now);
  end.setDate(end.getDate() + days);

  return prisma.contractRecord.findMany({
    where: {
      status: 'signed',
      endDate: {
        gte: now,
        lte: end,
      },
    },
    orderBy: { endDate: 'asc' },
  });
}
