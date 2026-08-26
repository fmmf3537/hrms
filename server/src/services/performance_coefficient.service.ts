// M3-D1: 等级系数 service | HRMS
// 仅 import audit/config + prisma

import type { PerformanceCoefficient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'performance_coefficient';

const DEFAULT_GRADES = ['S', 'A', 'B', 'C', 'D'];
const DEFAULT_COEFFICIENTS: Record<string, number> = {
  S: 1.5, A: 1.2, B: 1.0, C: 0.8, D: 0.5,
};

export type PerformanceGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface UpdateCoefficientInput {
  S: number;
  A: number;
  B: number;
  C: number;
  D: number;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

async function getGrades(): Promise<string[]> {
  try {
    const v = await configService.getValue('performance', 'coefficient.grades');
    if (Array.isArray(v) && v.length > 0) return v.map(String);
    return [...DEFAULT_GRADES];
  } catch {
    return [...DEFAULT_GRADES];
  }
}

async function getMaxHistoryVersions(): Promise<number> {
  try {
    const v = await configService.getValue('performance', 'coefficient.max_history_versions');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 12;
  } catch {
    return 12;
  }
}

function assertCoefficientValue(value: number): void {
  if (value <= 0 || value > 10) {
    throw new AppError('系数超出合法范围', 400, 72410);
  }
}

function assertGrade(grade: string, allowed: string[]): void {
  if (!allowed.includes(grade)) {
    throw new AppError('等级不合法', 400, 72410);
  }
}

/**
 * 获取当前生效的 5 档系数
 */
export async function getActiveCoefficients(): Promise<Record<PerformanceGrade, number>> {
  const grades = await getGrades();
  const active = await prisma.performanceCoefficient.findMany({
    where: { grade: { in: grades }, effectiveTo: null },
  });

  const result = {} as Record<PerformanceGrade, number>;
  grades.forEach((g) => {
    const row = active.find((a) => a.grade === g);
    if (!row) {
      throw new AppError(`缺少 ${g} 档系数配置`, 500, 72410);
    }
    result[g as PerformanceGrade] = Number(row.coefficient);
  });

  return result;
}

/**
 * 更新等级系数（写入新版本 + 关闭旧版本）
 */
export async function updateCoefficients(
  actorId: string,
  input: UpdateCoefficientInput,
): Promise<PerformanceCoefficient[]> {
  const grades = await getGrades();
  const entries = Object.entries(input) as [PerformanceGrade, number][];

  entries.forEach(([, coef]) => assertCoefficientValue(coef));
  grades.forEach((g) => {
    if (input[g as PerformanceGrade] == null) {
      throw new AppError(`缺少 ${g} 档系数`, 400, 72410);
    }
  });

  const effectiveFrom = startOfDay(new Date());
  const closeDate = addDays(effectiveFrom, -1);

  const created = await prisma.$transaction(async (tx) => {
    const results: PerformanceCoefficient[] = [];

    await Promise.all(
      grades.map(async (grade) => {
        const coef = input[grade as PerformanceGrade];
        await tx.performanceCoefficient.updateMany({
          where: { grade, effectiveTo: null },
          data: { effectiveTo: closeDate },
        });

        const row = await tx.performanceCoefficient.create({
          data: {
            grade,
            coefficient: new Decimal(coef),
            effectiveFrom,
            effectiveTo: null,
            createdBy: actorId,
          },
        });
        results.push(row);
      }),
    );

    return results;
  });

  // TODO: max_history_versions 超限清理留独立任务

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'UPDATE',
    resourceType: RESOURCE_TYPE,
    resourceId: effectiveFrom.toISOString().slice(0, 10),
    description: '更新绩效等级系数',
    newValue: input as object,
  });

  return created;
}

/**
 * 读某 grade 历史版本
 */
export async function listCoefficientHistory(
  actorId: string,
  grade: PerformanceGrade,
): Promise<PerformanceCoefficient[]> {
  const grades = await getGrades();
  assertGrade(grade, grades);

  const maxVersions = await getMaxHistoryVersions();
  const items = await prisma.performanceCoefficient.findMany({
    where: { grade },
    orderBy: { effectiveFrom: 'desc' },
    take: maxVersions,
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'READ_HISTORY',
    resourceType: RESOURCE_TYPE,
    resourceId: grade,
    description: `读取 ${grade} 档系数历史`,
  });

  return items;
}

/** 读取默认系数配置（seed / 文档用） */
export async function getDefaultCoefficientConfig(): Promise<Record<string, number>> {
  try {
    const v = await configService.getValue('performance', 'coefficient.default');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, Number(val)]),
      );
    }
    return { ...DEFAULT_COEFFICIENTS };
  } catch {
    return { ...DEFAULT_COEFFICIENTS };
  }
}
