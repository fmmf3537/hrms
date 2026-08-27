// M4-C5: 个税申报台账（mock，不接真实税务局 API）| HRMS

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'payroll_run';

export interface TaxLedgerRow {
  employeeId: string;
  period: string;
  taxableIncome: number;
  taxAmount: number;
  rate: number;
  quickDeduction: number;
}

export interface TaxDeclarationResult {
  runId: string;
  period: string;
  totalTaxableIncome: number;
  totalTax: number;
  recordCount: number;
  ledger: TaxLedgerRow[];
  mockMode: true;
}

export interface DeclarationListFilter {
  runId?: string;
}

function toNum(v: { toString(): string } | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v);
}

function parsePeriod(period: string): void {
  if (!/^(\d{4})-(0[1-9]|1[0-2])$/.test(period)) {
    throw new AppError('period 格式错误，应为 YYYY-MM', 400, 73507);
  }
}

async function assertMockMode(): Promise<void> {
  try {
    const v = await configService.getValue('salary', 'banking.mock_mode');
    if (v === false) {
      throw new AppError('C5 强制 mock 模式，禁止真实税务局对接', 400, 73506);
    }
  } catch (err) {
    if (err instanceof AppError && err.code === 73506) throw err;
    // TODO: C5 个税申报强制 mock（salary.tax.declaration.mock_mode 未单列 configs）
  }
}

/**
 * 个税申报（V1.2 §二.4.4 mock 模式）
 * @throws AppError(404) run 不存在
 * @throws AppError(400, 73507) period 非法
 * @throws AppError(400, 73506) 申报失败
 * 税基用 payslip 应发-社保-公积金近似（不调 C3 service）
 */
export async function declareTax(
  actorId: string,
  runId: string,
  input: { period: string },
): Promise<TaxDeclarationResult> {
  parsePeriod(input.period);
  await assertMockMode();

  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: {
      payslips: { where: { status: { in: ['approved', 'locked'] } } },
    },
  });
  if (!run) {
    throw new AppError('算薪批次不存在', 404);
  }

  let ledger: TaxLedgerRow[];
  try {
    ledger = run.payslips.map((p) => {
      const taxableIncome = Math.max(
        0,
        toNum(p.grossAmount) - toNum(p.socialInsuranceAmount) - toNum(p.housingFundAmount),
      );
      return {
        employeeId: p.employeeId,
        period: input.period,
        taxableIncome,
        taxAmount: toNum(p.taxAmount),
        rate: 0,
        quickDeduction: 0,
      };
    });
  } catch {
    throw new AppError('个税申报失败', 400, 73506);
  }

  const totalTaxableIncome = ledger.reduce((s, r) => s + r.taxableIncome, 0);
  const totalTax = ledger.reduce((s, r) => s + r.taxAmount, 0);
  const result: TaxDeclarationResult = {
    runId,
    period: input.period,
    totalTaxableIncome,
    totalTax,
    recordCount: ledger.length,
    ledger,
    mockMode: true,
  };

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'TAX_DECLARE',
    resourceType: RESOURCE_TYPE,
    resourceId: runId,
    description: `个税申报 ${input.period}`,
    newValue: {
      runId,
      period: input.period,
      totalTaxableIncome,
      totalTax,
      recordCount: ledger.length,
      mockMode: true,
    },
  });

  return result;
}

/**
 * 从 audit_logs 读取申报记录
 */
export async function getDeclarationList(actorId: string, filter: DeclarationListFilter = {}) {
  const logs = await prisma.auditLog.findMany({
    where: {
      action: 'TAX_DECLARE',
      resourceType: RESOURCE_TYPE,
      ...(filter.runId ? { resourceId: filter.runId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'TAX_DECLARE',
    resourceType: RESOURCE_TYPE,
    resourceId: filter.runId,
    description: '查询个税申报记录',
    newValue: { count: logs.length },
  });
  return logs;
}
