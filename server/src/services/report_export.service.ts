// M4-C5: 工资表导出 Excel / PDF（mock，不接真实 Excel/PDF 库）| HRMS

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'payroll_run';
const FALLBACK_FORMATS = ['excel', 'pdf'];

export type ReportFormat = 'excel' | 'pdf';

export interface ReportExportResult {
  runId: string;
  format: ReportFormat;
  filePath: string;
  content: string;
  totalGross: number;
  totalNet: number;
  mockMode: true;
}

export interface ReportListFilter {
  runId?: string;
}

function toNum(v: { toString(): string } | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v);
}

function parsePeriod(period: string): void {
  if (!/^(\d{4})-(0[1-9]|1[0-2])$/.test(period)) {
    throw new AppError('报告 period 格式错误', 400, 73510);
  }
}

async function getFormats(): Promise<string[]> {
  try {
    const v = await configService.getValue('salary', 'report.formats');
    if (Array.isArray(v)) {
      const list = v.filter((x): x is string => typeof x === 'string');
      if (list.length > 0) return list;
    }
    return FALLBACK_FORMATS;
  } catch {
    // TODO: configs.salary.report.formats 未配置时 fallback
    return FALLBACK_FORMATS;
  }
}

/**
 * 工资表导出（V1.2 §二.4.6 汇总表 + 明细表，mock 模式）
 * @throws AppError(404) run 不存在
 * @throws AppError(400, 73510) period 非法
 * @throws AppError(400, 73509) 导出失败 / 格式非法
 */
export async function exportReport(
  actorId: string,
  runId: string,
  input: { format: ReportFormat },
): Promise<ReportExportResult> {
  const allowed = await getFormats();
  if (!allowed.includes(input.format)) {
    throw new AppError('报告格式不合法', 400, 73509);
  }

  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: { payslips: { include: { employee: { select: { name: true } } } } },
  });
  if (!run) {
    throw new AppError('算薪批次不存在', 404);
  }
  parsePeriod(run.period);

  const totalGross = toNum(run.totalGross);
  const totalNet = toNum(run.totalNet);
  const summary = `汇总表 period=${run.period} totalGross=${totalGross} totalNet=${totalNet} anomalyCount=${run.anomalyCount}`;
  const detail = run.payslips
    .map((p) => `${p.employee.name},${toNum(p.grossAmount)},${toNum(p.netAmount)},${toNum(p.taxAmount)}`)
    .join('\n');

  let content: string;
  try {
    content = `${summary}\n明细表\n姓名,应发,实发,个税\n${detail}`;
  } catch {
    throw new AppError('工资表导出失败', 400, 73509);
  }

  const ext = input.format === 'excel' ? 'xlsx' : 'pdf';
  const filePath = `./tmp/reports/${runId}-${input.format}-${Date.now()}.${ext}`;
  const result: ReportExportResult = {
    runId,
    format: input.format,
    filePath,
    content,
    totalGross,
    totalNet,
    mockMode: true,
  };

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'REPORT_EXPORT',
    resourceType: RESOURCE_TYPE,
    resourceId: runId,
    description: `导出工资表 ${input.format}`,
    newValue: {
      runId, format: input.format, filePath, totalGross, totalNet, mockMode: true,
    },
  });

  return result;
}

/**
 * 从 audit_logs 读取导出记录
 */
export async function getReportList(actorId: string, filter: ReportListFilter = {}) {
  const logs = await prisma.auditLog.findMany({
    where: {
      action: 'REPORT_EXPORT',
      resourceType: RESOURCE_TYPE,
      ...(filter.runId ? { resourceId: filter.runId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'REPORT_EXPORT',
    resourceType: RESOURCE_TYPE,
    resourceId: filter.runId,
    description: '查询工资表导出记录',
    newValue: { count: logs.length },
  });
  return logs;
}
