// M3-D2: 考核评分明细 service | HRMS
// 仅 import audit/config + prisma；不 import D1 service 与其他业务 service

import type { PerformanceScore, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'PerformanceScore';

export type ScoreStage = 'self' | 'manager' | 'calibrate' | 'hr' | 'ceo';

export const STAGE_REQUIRED_STATUS: Record<ScoreStage, string> = {
  self: 'draft',
  manager: 'manager_scoring',
  calibrate: 'dept_calibrating',
  hr: 'hr_summarizing',
  ceo: 'ceo_approving',
};

export interface ScoreItemInput {
  indicatorId: string;
  score: number;
  comment?: string;
}

export interface SaveStageScoreInput {
  comment?: string;
  items: ScoreItemInput[];
  basedOnAiSuggestionId?: string;
}

export interface PerformanceScoreWithItems extends PerformanceScore {
  items: Array<{
    id: string;
    indicatorId: string;
    weight: Decimal;
    scoreValue: Decimal;
    weightedScore: Decimal;
    comment: string | null;
  }>;
}

interface SchemeIndicatorRow {
  indicatorId: string;
  weight: Decimal;
}

async function getPerfConfigNumber(key: string, fallback: number): Promise<number> {
  try {
    const v = await configService.getValue('performance', key);
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    // TODO: performance configs 全量入库后去掉 fallback
    return fallback;
  }
}

/**
 * 读取方案指标权重列表（通过 prisma 直查，不 import scheme service）
 */
export async function loadSchemeIndicators(
  schemeId: string | null | undefined,
): Promise<SchemeIndicatorRow[]> {
  if (!schemeId) {
    throw new AppError('考核记录未关联方案', 400, 72507);
  }
  const links = await prisma.performanceSchemeIndicator.findMany({
    where: { schemeId },
    select: { indicatorId: true, weight: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (links.length === 0) {
    throw new AppError('方案指标未配置', 400, 72507);
  }
  return links;
}

/**
 * 校验评分明细：覆盖全部指标 / 分数范围 / 权重和=100
 */
export async function validateScoreItems(
  schemeIndicators: SchemeIndicatorRow[],
  items: ScoreItemInput[],
): Promise<Array<{
    indicatorId: string;
    weight: Decimal;
    scoreValue: Decimal;
    weightedScore: Decimal;
    comment: string | null;
  }>> {
  const minScore = await getPerfConfigNumber('score.min', 0);
  const maxScore = await getPerfConfigNumber('score.max', 100);
  const tolerance = await getPerfConfigNumber('score.weight_tolerance', 0.01);

  const indicatorMap = new Map(schemeIndicators.map((r) => [r.indicatorId, r]));
  if (items.length !== schemeIndicators.length) {
    throw new AppError('评分明细未覆盖全部指标', 400, 72507);
  }

  let weightSum = 0;
  const built = items.map((item) => {
    const link = indicatorMap.get(item.indicatorId);
    if (!link) {
      throw new AppError('评分明细未覆盖全部指标', 400, 72507);
    }
    if (item.score < minScore || item.score > maxScore) {
      throw new AppError('分数超出允许范围', 400, 72508);
    }
    const weight = new Decimal(link.weight.toString());
    const scoreValue = new Decimal(item.score);
    const weightedScore = weight.mul(scoreValue).div(100);
    weightSum += Number(link.weight);
    return {
      indicatorId: item.indicatorId,
      weight,
      scoreValue,
      weightedScore,
      comment: item.comment ?? null,
    };
  });

  if (Math.abs(weightSum - 100) > tolerance) {
    throw new AppError('指标权重之和必须为 100', 400, 72509);
  }

  return built;
}

function computeTotalScore(
  builtItems: Array<{ weightedScore: Decimal }>,
): Decimal {
  return builtItems.reduce(
    (sum, it) => sum.add(it.weightedScore),
    new Decimal(0),
  );
}

function mergeComment(
  comment: string | undefined,
  basedOnAiSuggestionId?: string,
): string | null {
  if (!basedOnAiSuggestionId && !comment) return null;
  const parts: string[] = [];
  if (comment) parts.push(comment);
  if (basedOnAiSuggestionId) {
    parts.push(`basedOnAiSuggestionId=${basedOnAiSuggestionId}`);
  }
  return parts.join('\n');
}

/**
 * 保存指定 stage 评分草稿（version 递增，旧版本 isCurrent=false）
 */
export async function saveStageScore(
  actorId: string,
  recordId: string,
  stage: ScoreStage,
  input: SaveStageScoreInput,
  auditAction: string,
): Promise<PerformanceScoreWithItems> {
  const record = await prisma.performanceRecord.findUnique({
    where: { id: recordId },
    select: { id: true, status: true, schemeId: true },
  });
  if (!record) {
    throw new AppError('考核记录不存在', 404, 72501);
  }
  const requiredStatus = STAGE_REQUIRED_STATUS[stage];
  if (record.status !== requiredStatus) {
    throw new AppError(`当前状态不允许 ${stage} 评分`, 400, stage === 'self' ? 72503 : 72510);
  }

  const schemeIndicators = await loadSchemeIndicators(record.schemeId);
  const builtItems = await validateScoreItems(schemeIndicators, input.items);
  const totalScore = computeTotalScore(builtItems);
  const mergedComment = mergeComment(input.comment, input.basedOnAiSuggestionId);

  const result = await prisma.$transaction(async (tx) => {
    const latest = await tx.performanceScore.findFirst({
      where: { recordId, stage },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    await tx.performanceScore.updateMany({
      where: { recordId, stage, isCurrent: true },
      data: { isCurrent: false },
    });

    const score = await tx.performanceScore.create({
      data: {
        recordId,
        stage,
        totalScore,
        comment: mergedComment,
        isCurrent: true,
        version: nextVersion,
        submittedBy: actorId,
      },
    });

    await tx.performanceScoreItem.createMany({
      data: builtItems.map((it) => ({
        scoreId: score.id,
        indicatorId: it.indicatorId,
        weight: it.weight,
        scoreValue: it.scoreValue,
        weightedScore: it.weightedScore,
        comment: it.comment,
      })),
    });

    const items = await tx.performanceScoreItem.findMany({
      where: { scoreId: score.id },
    });

    return { ...score, items };
  });

  await auditService.auditLog({
    userId: actorId,
    action: auditAction,
    resourceType: RESOURCE_TYPE,
    resourceId: result.id,
    description: `保存 ${stage} 评分 record=${recordId} v${result.version}`,
    newValue: {
      recordId, stage, version: result.version, totalScore: result.totalScore,
    },
  });

  return result;
}

/**
 * 断言当前 stage 已有 isCurrent 评分（提交前校验）
 */
export async function assertCurrentScoreExists(
  recordId: string,
  stage: ScoreStage,
): Promise<void> {
  const current = await prisma.performanceScore.findFirst({
    where: { recordId, stage, isCurrent: true },
  });
  if (!current) {
    throw new AppError('请先保存评分草稿', 400, 72507);
  }
}

export async function getCurrentScore(
  recordId: string,
  stage: ScoreStage,
): Promise<PerformanceScoreWithItems | null> {
  const score = await prisma.performanceScore.findFirst({
    where: { recordId, stage, isCurrent: true },
    include: { items: true },
  });
  return score;
}

export type { Prisma };
