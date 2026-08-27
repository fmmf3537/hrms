// M4-C4: AI 算薪校验摘要 | HRMS
// 复用 M0.5-5 aiSummarizeService.summarize，严禁重写 AI service

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import { summarize as aiSummarizeService, type SummarizeResult } from './ai/summarize.service';
import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'payroll_run';
const FALLBACK_TEMPLATE = 'payroll_ai_summary';

export interface AiSummaryResult {
  runId: string;
  summary: string;
  cost: number;
  tokens: number;
  durationMs: number;
  modelName: string;
  isAnomaly: boolean;
  highlights: string[];
}

async function getTemplateKey(): Promise<string> {
  try {
    const v = await configService.getValue('salary', 'payroll.ai_summary_template_key');
    return typeof v === 'string' && v.length > 0 ? v : FALLBACK_TEMPLATE;
  } catch {
    // TODO: configs.salary.payroll.ai_summary_template_key 未配置时 fallback
    return FALLBACK_TEMPLATE;
  }
}

/**
 * AI 算薪校验摘要（V1.2 §二.4.2 复用 M0.5-5 aiSummarizeService）
 * @throws AppError(400, 73401) run 不存在
 * @throws AppError(400, 73410) AI 调用失败
 */
export async function requestAiSummary(
  actorId: string,
  runId: string,
): Promise<AiSummaryResult> {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: { payslips: true },
  });
  if (!run) {
    throw new AppError('算薪批次不存在', 400, 73401);
  }

  const lastRun = await prisma.payrollRun.findFirst({
    where: {
      period: { lt: run.period },
      status: { in: ['approved', 'locked'] },
    },
    orderBy: { period: 'desc' },
    include: { payslips: true },
  });

  const template = await getTemplateKey();
  const anomalyPayslips = run.payslips.filter((p) => {
    const last = lastRun?.payslips.find((x) => x.employeeId === p.employeeId);
    if (!last) return false;
    const diff = Math.abs(Number(p.netAmount) - Number(last.netAmount));
    return diff > 1000;
  });
  const text = `本次算薪 ${run.payslips.length} 个员工，totalGross=${Number(run.totalGross)}，totalNet=${Number(run.totalNet)}，异常 ${run.anomalyCount} 条`;

  const started = Date.now();
  let summarized: SummarizeResult;
  try {
    summarized = await aiSummarizeService({
      type: template,
      referenceId: runId,
      userId: actorId,
      data: {
        text,
        run,
        lastRun,
        anomalyPayslips,
      },
    });
  } catch {
    throw new AppError('AI 算薪摘要失败', 400, 73410);
  }

  const result: AiSummaryResult = {
    runId,
    summary: summarized.summary,
    cost: summarized.cost,
    tokens: summarized.tokens,
    durationMs: Date.now() - started,
    modelName: 'llm',
    isAnomaly: run.anomalyCount > 0 || anomalyPayslips.length > 0,
    highlights: summarized.highlights,
  };

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PAYROLL_AI_SUMMARY',
    resourceType: RESOURCE_TYPE,
    resourceId: runId,
    description: 'AI 算薪校验摘要',
    newValue: result,
  });

  return result;
}

/**
 * 从 audit_logs 读取 AI 摘要历史
 */
export async function getAiSummaryHistory(actorId: string, runId: string) {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId } });
  if (!run) {
    throw new AppError('算薪批次不存在', 400, 73401);
  }
  const logs = await prisma.auditLog.findMany({
    where: {
      resourceType: RESOURCE_TYPE,
      resourceId: runId,
      action: 'PAYROLL_AI_SUMMARY',
    },
    orderBy: { createdAt: 'desc' },
  });
  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'PAYROLL_AI_SUMMARY',
    resourceType: RESOURCE_TYPE,
    resourceId: runId,
    description: '查询 AI 算薪摘要历史',
    newValue: { count: logs.length },
  });
  return logs;
}
