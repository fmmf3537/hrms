// M4-C5: 银企代发文件（工行/建行/招行 mock，不接真实银行 API）| HRMS

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'payroll_run';
const FALLBACK_FORMATS = ['icbc', 'ccb', 'cmb'];

export type BankingFormat = 'icbc' | 'ccb' | 'cmb';

export interface BankingExportResult {
  runId: string;
  format: BankingFormat;
  filePath: string;
  content: string;
  recordCount: number;
  totalAmount: number;
  mockMode: true;
}

export interface BankingListFilter {
  runId?: string;
}

function toNum(v: { toString(): string } | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v);
}

async function getFormats(): Promise<string[]> {
  try {
    const v = await configService.getValue('salary', 'banking.formats');
    if (Array.isArray(v)) {
      const list = v.filter((x): x is string => typeof x === 'string');
      if (list.length > 0) return list;
    }
    return FALLBACK_FORMATS;
  } catch {
    // TODO: configs.salary.banking.formats 未配置时 fallback
    return FALLBACK_FORMATS;
  }
}

async function assertMockMode(): Promise<void> {
  try {
    const v = await configService.getValue('salary', 'banking.mock_mode');
    if (v === false) {
      throw new AppError('C5 强制 mock 模式，禁止真实银行对接', 400, 73504);
    }
  } catch (err) {
    if (err instanceof AppError && err.code === 73504) throw err;
    // TODO: configs.salary.banking.mock_mode 未配置时 fallback true
  }
}

function buildContent(
  format: BankingFormat,
  rows: Array<{
    employeeNo: string;
    name: string;
    bankCard: string;
    amount: number;
  }>,
): string {
  if (format === 'icbc') {
    const header = '工号|姓名|卡号|金额';
    const body = rows.map((r) => `${r.employeeNo}|${r.name}|${r.bankCard}|${r.amount.toFixed(2)}`);
    return [header, ...body].join('\n');
  }
  if (format === 'ccb') {
    const header = '序号|账号|金额';
    const body = rows.map((r, i) => `${i + 1}|${r.bankCard}|${r.amount.toFixed(2)}`);
    return [header, ...body].join('\n');
  }
  const header = '工号,姓名,卡号,金额';
  const body = rows.map((r) => `${r.employeeNo},${r.name},${r.bankCard},${r.amount.toFixed(2)}`);
  return [header, ...body].join('\n');
}

function extOf(format: BankingFormat): string {
  if (format === 'icbc') return 'csv';
  if (format === 'ccb') return 'txt';
  return 'xls';
}

/**
 * 导出银企代发文件（V1.2 §二.4.6 + §三.6，mock 模式）
 * @throws AppError(404) run 不存在
 * @throws AppError(400, 73505) 格式非法
 * @throws AppError(400, 73504) 生成失败
 * 注：不接真实银行 API；文件内容返回内存字符串，路径为 mock 路径
 */
export async function exportBankingFile(
  actorId: string,
  runId: string,
  input: { format: BankingFormat },
): Promise<BankingExportResult> {
  await assertMockMode();
  const allowed = await getFormats();
  if (!allowed.includes(input.format)) {
    throw new AppError('银行格式不合法', 400, 73505);
  }

  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: {
      payslips: {
        where: { status: { in: ['approved', 'locked'] } },
        include: { employee: true },
      },
    },
  });
  if (!run) {
    throw new AppError('算薪批次不存在', 404);
  }

  const rows = run.payslips.map((p) => ({
    employeeNo: p.employee.employeeNo,
    name: p.employee.name,
    bankCard: p.employee.bankCard ?? '',
    amount: toNum(p.netAmount),
  }));
  let content: string;
  try {
    content = buildContent(input.format, rows);
  } catch {
    throw new AppError('银行代发文件生成失败', 400, 73504);
  }

  const ts = Date.now();
  const filePath = `./tmp/banking/${runId}-${input.format}-${ts}.${extOf(input.format)}`;
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const result: BankingExportResult = {
    runId,
    format: input.format,
    filePath,
    content,
    recordCount: rows.length,
    totalAmount,
    mockMode: true,
  };

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'BANKING_EXPORT',
    resourceType: RESOURCE_TYPE,
    resourceId: runId,
    description: `导出 ${input.format} 代发文件`,
    newValue: {
      runId,
      format: input.format,
      filePath,
      recordCount: rows.length,
      totalAmount,
      mockMode: true,
    },
  });

  return result;
}

/**
 * 从 audit_logs 读取代发导出记录
 */
export async function getBankingFileList(actorId: string, filter: BankingListFilter = {}) {
  const logs = await prisma.auditLog.findMany({
    where: {
      action: 'BANKING_EXPORT',
      resourceType: RESOURCE_TYPE,
      ...(filter.runId ? { resourceId: filter.runId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'BANKING_EXPORT',
    resourceType: RESOURCE_TYPE,
    resourceId: filter.runId,
    description: '查询银企代发导出记录',
    newValue: { count: logs.length },
  });
  return logs;
}
