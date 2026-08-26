// M3-D2: AI 评分建议 service | HRMS
// 复用 M0.5-5 suggestScore；仅 import audit/config + prisma + ai/score.service

import type { PerformanceAiSuggestion } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import { suggestScore } from './ai/score.service';
import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'PerformanceAiSuggestion';
const AI_RATE_LIMIT = 5;
const AI_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const MOCK_SUGGESTIONS = [
  { grade: 'B', confidence: 0.5, reasons: ['历史绩效稳定', '考勤基本正常', '项目交付达标'] },
  { grade: 'A', confidence: 0.3, reasons: ['部分项目质量评价较好'] },
  { grade: 'C', confidence: 0.2, reasons: ['自评中提到部分目标未达预期'] },
];

export interface AiSuggestionResult {
  suggestionId: string;
  suggestions: Array<{ grade: string; confidence: number; reasons: string[] }>;
  cost: number;
  tokens: number;
  durationMs: number;
}

async function getPerfConfigNumber(key: string, fallback: number): Promise<number> {
  try {
    const v = await configService.getValue('performance', key);
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

async function getPerfConfigString(key: string, fallback: string): Promise<string> {
  try {
    const v = await configService.getValue('performance', key);
    return typeof v === 'string' ? v : fallback;
  } catch {
    return fallback;
  }
}

async function loadHistoricalPerformance(employeeId: string, months: number) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  return prisma.performanceRecord.findMany({
    where: {
      employeeId,
      archivedAt: { gte: since },
      status: 'archived',
    },
    select: {
      id: true,
      cycleId: true,
      finalGrade: true,
      finalScore: true,
      archivedAt: true,
    },
    orderBy: { archivedAt: 'desc' },
    take: months,
  });
}

async function loadAttendanceSummary(employeeId: string) {
  const since = new Date();
  since.setMonth(since.getMonth() - 1);
  const records = await prisma.attendanceRecord.findMany({
    where: { employeeId, clockInTime: { gte: since } },
    select: { isLate: true, isEarlyLeave: true, isMissing: true },
  });
  const abnormal = records.filter((r) => r.isLate || r.isEarlyLeave || r.isMissing).length;
  return { total: records.length, abnormal };
}

/**
 * 请求 AI 评分建议（上级评分环节，复用 aiScoreService.suggestScore）
 */
export async function requestAiSuggestion(
  actorId: string,
  recordId: string,
): Promise<AiSuggestionResult> {
  const record = await prisma.performanceRecord.findUnique({
    where: { id: recordId },
    include: {
      employee: { select: { id: true, name: true } },
      scores: {
        where: { stage: 'self', isCurrent: true },
        include: { items: true },
      },
    },
  });
  if (!record) {
    throw new AppError('考核记录不存在', 404, 72501);
  }
  if (record.status !== 'manager_scoring') {
    throw new AppError('当前状态不允许 AI 评分建议', 400, 72513);
  }

  const since = new Date(Date.now() - AI_RATE_WINDOW_MS);
  const recentCount = await prisma.performanceAiSuggestion.count({
    where: { recordId, createdAt: { gte: since } },
  });
  if (recentCount >= AI_RATE_LIMIT) {
    throw new AppError('AI 建议调用次数超限，请稍后再试', 400, 72516);
  }

  const historyMonths = await getPerfConfigNumber('ai.suggestion_history_months', 6);
  const suggestionCount = await getPerfConfigNumber('ai.suggestion_count', 3);
  const fallbackStrategy = await getPerfConfigString('ai.fallback_strategy', 'mock');
  const templateKey = await getPerfConfigString('ai.input_template_key', 'performance_ai_suggestion');

  const selfScore = record.scores[0];
  const historicalPerformance = await loadHistoricalPerformance(record.employeeId, historyMonths);
  const attendance = await loadAttendanceSummary(record.employeeId);

  const promptPayload = {
    templateKey,
    employeeId: record.employeeId,
    cycleId: record.cycleId,
    selfEvaluation: selfScore?.items ?? [],
    historicalPerformance,
    attendance,
    projectDeliveries: [],
  };
  const prompt = JSON.stringify(promptPayload);

  const start = Date.now();
  let suggestions = MOCK_SUGGESTIONS;
  let tokens = 0;
  let cost = 0;
  let rawResponse = '';
  let modelName = 'mock';

  try {
    const result = await suggestScore({
      userId: actorId,
      employeeId: record.employeeId,
      cycleId: record.cycleId,
      selfEvaluation: selfScore?.items ?? [],
      historicalPerformance,
      attendance,
      projectDeliveries: [],
    });
    suggestions = result.suggestions.slice(0, suggestionCount);
    tokens = result.tokens;
    cost = result.cost;
    rawResponse = JSON.stringify(result);
    modelName = 'llm';
  } catch {
    if (fallbackStrategy === 'error') {
      throw new AppError('AI 评分建议失败', 500, 72514);
    }
    suggestions = MOCK_SUGGESTIONS.slice(0, suggestionCount);
    rawResponse = JSON.stringify({ fallback: 'mock', suggestions });
    modelName = 'mock-fallback';
  }

  const durationMs = Date.now() - start;

  const saved = await prisma.performanceAiSuggestion.create({
    data: {
      recordId,
      prompt,
      rawResponse,
      suggestions,
      modelName,
      tokens,
      cost: new Decimal(cost),
      durationMs,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'AGENT',
    action: 'AI_SUGGEST',
    resourceType: RESOURCE_TYPE,
    resourceId: saved.id,
    description: `AI 评分建议 record=${recordId}`,
    newValue: {
      tokens, cost, durationMs, count: suggestions.length,
    },
  });

  return {
    suggestionId: saved.id,
    suggestions,
    cost,
    tokens,
    durationMs,
  };
}

/**
 * 读取 AI 建议历史（近 N 月，按 createdAt DESC；无历史返空数组）
 */
export async function listAiSuggestions(
  actorId: string,
  recordId: string,
): Promise<PerformanceAiSuggestion[]> {
  const record = await prisma.performanceRecord.findUnique({
    where: { id: recordId },
    select: { id: true, employeeId: true },
  });
  if (!record) {
    throw new AppError('考核记录不存在', 404, 72501);
  }

  const historyMonths = await getPerfConfigNumber('ai.suggestion_history_months', 6);
  const since = new Date();
  since.setMonth(since.getMonth() - historyMonths);

  const items = await prisma.performanceAiSuggestion.findMany({
    where: { recordId, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
  });

  await auditService.auditLog({
    userId: actorId,
    action: 'READ_AI_HISTORY',
    resourceType: RESOURCE_TYPE,
    resourceId: recordId,
    description: `读取 AI 建议历史 record=${recordId}`,
    newValue: { count: items.length },
  });

  return items;
}
