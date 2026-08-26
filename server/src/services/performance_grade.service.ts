// M3-D3: 五档评分 + 等级阈值 service | HRMS
// 仅 import audit/config + prisma；不 import D1/D2 performance service

import type { PerformanceCoefficient } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_RECORD = 'PerformanceRecord';
const RESOURCE_CONFIG = 'Config';

export type PerformanceGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface GradeThresholds {
  S: number;
  A: number;
  B: number;
  C: number;
  D: number;
}

export interface CalculateGradeResult {
  recordId: string;
  finalScore: number;
  oldGrade: PerformanceGrade | null;
  newGrade: PerformanceGrade;
  threshold: GradeThresholds;
}

export interface BatchGradeResult {
  succeeded: CalculateGradeResult[];
  failed: Array<{ recordId: string; error: string; code?: number }>;
}

export interface RatioWarning {
  grade: PerformanceGrade;
  message: string;
  actual?: number;
  expected?: number;
}

export interface CoefficientAnalysis {
  totalCoefficient: number;
  averageCoefficient: number;
  expectedAverage: number;
  diff: number;
  warnings: RatioWarning[];
}

const DEFAULT_THRESHOLDS: GradeThresholds = {
  S: 90, A: 80, B: 70, C: 60, D: 0,
};

const GRADES: PerformanceGrade[] = ['S', 'A', 'B', 'C', 'D'];

async function getPerfConfigNumber(key: string, fallback: number): Promise<number> {
  try {
    const v = await configService.getValue('performance', key);
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

async function loadThresholdsFromConfig(): Promise<GradeThresholds> {
  try {
    const v = await configService.getValue('performance', 'grade.thresholds');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      return {
        S: Number(obj.S ?? DEFAULT_THRESHOLDS.S),
        A: Number(obj.A ?? DEFAULT_THRESHOLDS.A),
        B: Number(obj.B ?? DEFAULT_THRESHOLDS.B),
        C: Number(obj.C ?? DEFAULT_THRESHOLDS.C),
        D: Number(obj.D ?? DEFAULT_THRESHOLDS.D),
      };
    }
  } catch {
    // TODO: configs 全量入库后去掉 fallback
  }
  return { ...DEFAULT_THRESHOLDS };
}

/**
 * 根据 finalScore + thresholds 判定等级
 */
export function calcGradeFromScore(
  finalScore: number,
  thresholds: GradeThresholds,
): PerformanceGrade {
  if (finalScore >= thresholds.S) return 'S';
  if (finalScore >= thresholds.A) return 'A';
  if (finalScore >= thresholds.B) return 'B';
  if (finalScore >= thresholds.C) return 'C';
  return 'D';
}

/**
 * 校验阈值顺序：S > A > B > C > D ≥ 0，且均在 [0, 100]
 */
export function validateThresholdOrder(thresholds: GradeThresholds): void {
  const missing = GRADES.some((g) => thresholds[g] == null || Number.isNaN(Number(thresholds[g])));
  if (missing) {
    throw new AppError('缺少等级阈值配置', 400, 72607);
  }
  const outOfRange = GRADES.some((g) => thresholds[g] < 0 || thresholds[g] > 100);
  if (outOfRange) {
    throw new AppError('等级阈值越界', 400, 72602);
  }
  if (!(thresholds.S > thresholds.A
    && thresholds.A > thresholds.B
    && thresholds.B > thresholds.C
    && thresholds.C > thresholds.D
    && thresholds.D >= 0)) {
    throw new AppError('等级阈值顺序错乱', 400, 72608);
  }
}

/**
 * 读等级阈值（configs.performance.grade.thresholds）
 */
export async function getGradeThresholds(actorId: string): Promise<GradeThresholds> {
  const thresholds = await loadThresholdsFromConfig();
  validateThresholdOrder(thresholds);

  await auditService.auditLog({
    userId: actorId,
    action: 'THRESHOLD_READ',
    resourceType: RESOURCE_CONFIG,
    resourceId: 'performance.grade.thresholds',
    description: '读取等级阈值',
    newValue: thresholds,
  });

  return thresholds;
}

/**
 * 写等级阈值（configs + 审计）
 */
export async function updateGradeThresholds(
  actorId: string,
  input: GradeThresholds,
): Promise<GradeThresholds> {
  validateThresholdOrder(input);

  const oldThresholds = await loadThresholdsFromConfig();

  await configService.setValue({
    category: 'performance',
    key: 'grade.thresholds',
    value: { ...input },
    effectiveFrom: new Date(),
    remark: 'D3 等级判定阈值',
    createdBy: actorId,
  });

  await auditService.auditLog({
    userId: actorId,
    action: 'THRESHOLD_WRITE',
    resourceType: RESOURCE_CONFIG,
    resourceId: 'performance.grade.thresholds',
    description: '更新等级阈值',
    oldValue: oldThresholds,
    newValue: input,
  });

  return input;
}

/**
 * 单条记录等级判定（基于 finalScore + thresholds）
 */
export async function calculateGrade(
  actorId: string,
  recordId: string,
  options?: { force?: boolean },
): Promise<CalculateGradeResult> {
  const record = await prisma.performanceRecord.findUnique({ where: { id: recordId } });
  if (!record) {
    throw new AppError('考核记录不存在', 404, 72501);
  }
  if (record.status !== 'ceo_approved') {
    throw new AppError('仅已审批记录可判定等级', 400, 72503);
  }
  if (record.finalScore == null) {
    throw new AppError('考核记录缺少 finalScore', 400, 72601);
  }
  const finalScore = Number(record.finalScore);
  if (finalScore < 0 || finalScore > 100) {
    throw new AppError('finalScore 超出范围', 400, 72603);
  }
  if (record.finalGrade && !options?.force) {
    throw new AppError('等级已判定，请使用 force 覆盖', 400, 72604);
  }

  const threshold = await loadThresholdsFromConfig();
  validateThresholdOrder(threshold);
  const newGrade = calcGradeFromScore(finalScore, threshold);
  const oldGrade = record.finalGrade as PerformanceGrade | null;

  await prisma.performanceRecord.update({
    where: { id: recordId },
    data: { finalGrade: newGrade },
  });

  await auditService.auditLog({
    userId: actorId,
    action: 'GRADE_CALCULATE',
    resourceType: RESOURCE_RECORD,
    resourceId: recordId,
    description: `等级判定 ${oldGrade ?? '-'} → ${newGrade}`,
    oldValue: { finalGrade: oldGrade, finalScore },
    newValue: {
      finalGrade: newGrade,
      finalScore,
      force: options?.force ?? false,
      reason: options?.force ? 'manual_override' : undefined,
    },
  });

  return {
    recordId,
    finalScore,
    oldGrade,
    newGrade,
    threshold,
  };
}

/**
 * 批量等级判定
 */
export async function calculateBatchGrade(
  actorId: string,
  recordIds: string[],
  options?: { force?: boolean; batchSize?: number },
): Promise<BatchGradeResult> {
  if (!recordIds.length) {
    throw new AppError('批量 recordIds 不能为空', 400, 72605);
  }

  const maxBatch = options?.batchSize
    ?? await getPerfConfigNumber('grade.batch_size', 100);
  if (recordIds.length > maxBatch) {
    throw new AppError(`批量超过上限 ${maxBatch}`, 400, 72606);
  }

  const force = options?.force ?? true;
  const succeeded: CalculateGradeResult[] = [];
  const failed: BatchGradeResult['failed'] = [];

  await Promise.all(recordIds.map(async (recordId) => {
    try {
      const result = await calculateGrade(actorId, recordId, { force });
      succeeded.push(result);
    } catch (err) {
      failed.push({
        recordId,
        error: err instanceof AppError ? err.message : '判定失败',
        code: err instanceof AppError ? err.code : undefined,
      });
    }
  }));

  await auditService.auditLog({
    userId: actorId,
    action: 'GRADE_CALCULATE_BATCH',
    resourceType: RESOURCE_RECORD,
    resourceId: null,
    description: '批量等级判定',
    newValue: { total: recordIds.length, succeeded: succeeded.length, failed: failed.length },
  });

  return { succeeded, failed };
}

/**
 * 系数 → 5 档比例软警告分析（辅助函数，不修改数据）
 */
export async function analyzeCoefficientRatios(
  coefficients: Pick<PerformanceCoefficient, 'grade' | 'coefficient'>[],
): Promise<CoefficientAnalysis> {
  let distribution: Record<string, number>;
  try {
    const v = await configService.getValue('performance', 'grade.distribution');
    distribution = (v && typeof v === 'object' && !Array.isArray(v))
      ? v as Record<string, number>
      : {
        S: 0.1, A: 0.2, B: 0.5, C: 0.15, D: 0.05,
      };
  } catch {
    distribution = {
      S: 0.1, A: 0.2, B: 0.5, C: 0.15, D: 0.05,
    };
  }
  const distSum = GRADES.reduce((s, g) => s + Number(distribution[g] ?? 0), 0);
  if (Math.abs(distSum - 1) > 0.01) {
    throw new AppError('等级比例配置之和必须为 1', 400, 72610);
  }

  const coefMap = new Map(coefficients.map((c) => [c.grade, Number(c.coefficient)]));
  const totalCoefficient = GRADES.reduce((s, g) => s + (coefMap.get(g) ?? 0), 0);
  const averageCoefficient = totalCoefficient / GRADES.length;
  const expectedAverage = GRADES.reduce(
    (s, g) => s + (coefMap.get(g) ?? 0) * Number(distribution[g] ?? 0),
    0,
  );
  const diff = Math.abs(averageCoefficient - expectedAverage);

  const warnings: RatioWarning[] = [];
  if (diff > 0.1) {
    warnings.push({
      grade: 'B',
      message: `系数加权平均偏差 ${diff.toFixed(2)} 超过 0.1`,
      actual: averageCoefficient,
      expected: expectedAverage,
    });
  }

  return {
    totalCoefficient,
    averageCoefficient,
    expectedAverage,
    diff,
    warnings,
  };
}
