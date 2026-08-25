// M1-A2: 员工 AI OCR / 摘要 service | HRMS
// 经 M0.5-4 integrationService → llm adapter；mock 返回结构化 JSON

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as integrationService from './integration.service';

export interface IdCardParseResult {
  name: string;
  idCardNumber: string;
  gender: string;
  birthDate: string;
  address: string;
  issueAuthority: string;
  validPeriod: string;
}

export interface BankCardParseResult {
  bankName: string;
  cardNumber: string;
  cardType: string;
}

export interface CertificateParseResult {
  name: string;
  number: string;
  issueDate: string;
  expireDate: string;
  issuer: string;
}

export interface EmployeeSummaryResult {
  employeeId: string;
  summary: string;
  highlights: string[];
  tokens: number;
  cost: number;
}

const MOCK_ID_CARD: IdCardParseResult = {
  name: '张三',
  idCardNumber: '610102199001011234',
  gender: 'male',
  birthDate: '1990-01-01',
  address: '陕西省西安市雁塔区某某路1号',
  issueAuthority: '西安市公安局雁塔分局',
  validPeriod: '2015.01.01-2035.01.01',
};

const MOCK_BANK_CARD: BankCardParseResult = {
  bankName: '中国工商银行',
  cardNumber: '6222021234567890123',
  cardType: 'debit',
};

const MOCK_CERTIFICATE: CertificateParseResult = {
  name: '无人机驾驶员执照',
  number: 'UAV-2020-0001',
  issueDate: '2020-06-01',
  expireDate: '2030-06-01',
  issuer: '中国民航局',
};

function extractJsonContent(data: unknown): unknown {
  if (!data || typeof data !== 'object') return null;
  const { content } = data as { content?: string };
  if (typeof content !== 'string') return null;
  const trimmed = content.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

async function callLlmChat(prompt: string): Promise<{
  data: unknown;
  tokens: number;
  cost: number;
}> {
  let result;
  try {
    result = await integrationService.send({
      code: 'llm',
      payload: {
        type: 'chat',
        messages: [
          { role: 'system', content: '你是 HRMS 证件解析助手，只返回 JSON。' },
          { role: 'user', content: prompt },
        ],
      },
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(`AI 服务调用失败: ${msg}`, 400, 60120);
  }

  if (!result.success) {
    throw new AppError(result.error ?? 'AI 识别失败', 400, 60121);
  }

  const data = result.data as { tokens?: number; cost?: number } | undefined;
  return {
    data: result.data,
    tokens: typeof data?.tokens === 'number' ? data.tokens : 0,
    cost: typeof data?.cost === 'number' ? data.cost : 0,
  };
}

/**
 * OCR 解析身份证（经 LLM chat；mock 返回固定结构）
 */
export async function parseIdCard(
  imageBase64: string,
  userId?: string,
): Promise<IdCardParseResult> {
  if (!imageBase64) {
    throw new AppError('缺少图片数据', 400, 60121);
  }

  const { data, tokens, cost } = await callLlmChat(
    `请解析身份证图片(base64前缀略)。imageLen=${imageBase64.length}。返回 JSON: name,idCardNumber,gender,birthDate,address,issueAuthority,validPeriod`,
  );

  const parsed = extractJsonContent(data) as Partial<IdCardParseResult> | null;
  const result: IdCardParseResult = {
    name: parsed?.name ?? MOCK_ID_CARD.name,
    idCardNumber: parsed?.idCardNumber ?? MOCK_ID_CARD.idCardNumber,
    gender: parsed?.gender ?? MOCK_ID_CARD.gender,
    birthDate: parsed?.birthDate ?? MOCK_ID_CARD.birthDate,
    address: parsed?.address ?? MOCK_ID_CARD.address,
    issueAuthority: parsed?.issueAuthority ?? MOCK_ID_CARD.issueAuthority,
    validPeriod: parsed?.validPeriod ?? MOCK_ID_CARD.validPeriod,
  };

  await auditService.auditLog({
    userId,
    actorType: 'AGENT',
    action: auditService.AUDIT_ACTIONS.AI_OCR,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.EMPLOYEE,
    description: 'parseIdCard',
    newValue: { tokens, cost, fields: Object.keys(result) },
  });

  return result;
}

/**
 * OCR 解析银行卡
 */
export async function parseBankCard(
  imageBase64: string,
  userId?: string,
): Promise<BankCardParseResult> {
  if (!imageBase64) {
    throw new AppError('缺少图片数据', 400, 60121);
  }

  const { data, tokens, cost } = await callLlmChat(
    `请解析银行卡图片。imageLen=${imageBase64.length}。返回 JSON: bankName,cardNumber,cardType`,
  );

  const parsed = extractJsonContent(data) as Partial<BankCardParseResult> | null;
  const result: BankCardParseResult = {
    bankName: parsed?.bankName ?? MOCK_BANK_CARD.bankName,
    cardNumber: parsed?.cardNumber ?? MOCK_BANK_CARD.cardNumber,
    cardType: parsed?.cardType ?? MOCK_BANK_CARD.cardType,
  };

  await auditService.auditLog({
    userId,
    actorType: 'AGENT',
    action: auditService.AUDIT_ACTIONS.AI_OCR,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.EMPLOYEE,
    description: 'parseBankCard',
    newValue: { tokens, cost },
  });

  return result;
}

/**
 * OCR 解析资质证书
 */
export async function parseCertificate(
  imageBase64: string,
  userId?: string,
): Promise<CertificateParseResult> {
  if (!imageBase64) {
    throw new AppError('缺少图片数据', 400, 60121);
  }

  const { data, tokens, cost } = await callLlmChat(
    `请解析资质证书图片。imageLen=${imageBase64.length}。返回 JSON: name,number,issueDate,expireDate,issuer`,
  );

  const parsed = extractJsonContent(data) as Partial<CertificateParseResult> | null;
  const result: CertificateParseResult = {
    name: parsed?.name ?? MOCK_CERTIFICATE.name,
    number: parsed?.number ?? MOCK_CERTIFICATE.number,
    issueDate: parsed?.issueDate ?? MOCK_CERTIFICATE.issueDate,
    expireDate: parsed?.expireDate ?? MOCK_CERTIFICATE.expireDate,
    issuer: parsed?.issuer ?? MOCK_CERTIFICATE.issuer,
  };

  await auditService.auditLog({
    userId,
    actorType: 'AGENT',
    action: auditService.AUDIT_ACTIONS.AI_OCR,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.EMPLOYEE,
    description: 'parseCertificate',
    newValue: { tokens, cost },
  });

  return result;
}

/**
 * 生成员工画像摘要
 */
export async function generateEmployeeSummary(
  employeeId: string,
  userId?: string,
): Promise<EmployeeSummaryResult> {
  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    select: {
      id: true,
      name: true,
      employeeNo: true,
      status: true,
      hireDate: true,
      contractType: true,
      educationLevel: true,
      departmentId: true,
    },
  });
  if (!emp) {
    throw new AppError('员工不存在', 404, 71201);
  }

  const { data, tokens, cost } = await callLlmChat(
    '类型：员工画像摘要。请为员工生成摘要 JSON {summary,highlights}。'
    + ` employeeId=${emp.id} name=${emp.name} no=${emp.employeeNo}`
    + ` status=${emp.status} hireDate=${emp.hireDate.toISOString().slice(0, 10)}`
    + ` contractType=${emp.contractType ?? ''} education=${emp.educationLevel ?? ''}`,
  );

  const parsed = extractJsonContent(data) as {
    summary?: string;
    highlights?: string[];
  } | null;

  const result: EmployeeSummaryResult = {
    employeeId,
    summary: parsed?.summary
      ?? `[MOCK] ${emp.name}（${emp.employeeNo}）入职以来表现稳定，状态 ${emp.status}。`,
    highlights: parsed?.highlights ?? ['入职档案完整', '合同状态正常'],
    tokens,
    cost,
  };

  await auditService.auditLog({
    userId,
    actorType: 'AGENT',
    action: auditService.AUDIT_ACTIONS.AI_SUMMARIZE,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.EMPLOYEE,
    resourceId: employeeId,
    description: 'generateEmployeeSummary',
    newValue: { tokens, cost },
  });

  return result;
}
