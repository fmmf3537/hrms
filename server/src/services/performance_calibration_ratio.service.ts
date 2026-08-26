// M3-D3: 等级比例校准软警告 service | HRMS
// 仅 import audit/config + prisma；不 import D1/D2 performance service

import type { AuditLog } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'PerformanceRecord';
const GRADES = ['S', 'A', 'B', 'C', 'D'] as const;

export interface DeptCalibrationResult {
  deptId: string;
  deptName: string;
  cycleId: string;
  totalRecords: number;
  actualRatios: Record<string, number>;
  expectedRatios: Record<string, number>;
  warnings: string[];
}

export interface CalibrationResult {
  results: DeptCalibrationResult[];
}

async function getPerfConfigObject<T extends Record<string, unknown>>(
  key: string,
  fallback: T,
): Promise<T> {
  try {
    const v = await configService.getValue('performance', key);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return { ...fallback, ...(v as T) };
    }
    return fallback;
  } catch {
    return fallback;
  }
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

function validateDistributionSum(distribution: Record<string, number>): void {
  const sum = GRADES.reduce((s, g) => s + (distribution[g] ?? 0), 0);
  if (Math.abs(sum - 1) > 0.01) {
    throw new AppError('等级比例配置之和必须为 1', 400, 72610);
  }
}

async function resolveCycleId(cycleId?: string): Promise<string> {
  if (cycleId) return cycleId;
  const cycle = await prisma.performanceCycle.findFirst({
    where: { status: 'closed' },
    orderBy: { endDate: 'desc' },
  });
  if (cycle) return cycle.id;
  const fallback = await prisma.performanceCycle.findFirst({
    where: { status: 'active' },
    orderBy: { endDate: 'desc' },
  });
  if (!fallback) {
    throw new AppError('未找到可用考核周期', 400, 72501);
  }
  return fallback.id;
}

/**
 * 部门级比例软警告（warn_only，不修改 finalGrade）
 */
export async function calibrateDepartmentRatios(
  actorId: string,
  deptIds: string[],
  cycleId?: string,
): Promise<CalibrationResult> {
  if (!deptIds.length) {
    throw new AppError('deptIds 不能为空', 400, 72605);
  }

  const departments = await prisma.department.findMany({
    where: { id: { in: deptIds } },
    select: { id: true, name: true },
  });
  const foundIds = new Set(departments.map((d) => d.id));
  const missing = deptIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new AppError(`部门不存在: ${missing.join(',')}`, 400, 72609);
  }

  const resolvedCycleId = await resolveCycleId(cycleId);
  const expectedRatios = await getPerfConfigObject('grade.distribution', {
    S: 0.1, A: 0.2, B: 0.5, C: 0.15, D: 0.05,
  });
  validateDistributionSum(expectedRatios);

  const tolerance = await getPerfConfigNumber('calibration.ratio_tolerance', 0.02);
  // D3 仅 warn_only；force 留 D4（读取配置以满足 configService 约束）
  try {
    await configService.getValue('performance', 'grade.calibration_strategy');
  } catch {
    // TODO: configs 全量入库后去掉 fallback
  }

  const results = await Promise.all(departments.map(async (dept) => {
    const records = await prisma.performanceRecord.findMany({
      where: {
        cycleId: resolvedCycleId,
        status: 'archived',
        finalGrade: { not: null },
        employee: { departmentId: dept.id },
      },
      select: { finalGrade: true },
    });

    const totalRecords = records.length;
    const counts: Record<string, number> = {
      S: 0, A: 0, B: 0, C: 0, D: 0,
    };
    records.forEach((r) => {
      if (r.finalGrade && counts[r.finalGrade] != null) {
        counts[r.finalGrade] += 1;
      }
    });

    const actualRatios: Record<string, number> = {};
    GRADES.forEach((g) => {
      actualRatios[g] = totalRecords > 0 ? counts[g] / totalRecords : 0;
    });

    const warnings: string[] = [];
    if (actualRatios.S > expectedRatios.S + tolerance) {
      warnings.push(`S 比例过高（实际 ${(actualRatios.S * 100).toFixed(1)}%，建议 ≤${(expectedRatios.S * 100).toFixed(0)}%）`);
    }
    if (actualRatios.A > expectedRatios.A + tolerance) {
      warnings.push(`A 比例过高（实际 ${(actualRatios.A * 100).toFixed(1)}%，建议 ≤${(expectedRatios.A * 100).toFixed(0)}%）`);
    }
    if (actualRatios.D > expectedRatios.D + tolerance) {
      warnings.push(`D 比例过高（实际 ${(actualRatios.D * 100).toFixed(1)}%，建议 ≤${(expectedRatios.D * 100).toFixed(0)}%）`);
    }

    return {
      deptId: dept.id,
      deptName: dept.name,
      cycleId: resolvedCycleId,
      totalRecords,
      actualRatios,
      expectedRatios,
      warnings,
    };
  }));

  await auditService.auditLog({
    userId: actorId,
    action: 'CALIBRATION_RATIO_CHECK',
    resourceType: RESOURCE_TYPE,
    resourceId: resolvedCycleId,
    description: `部门比例校准检查 ${deptIds.length} 个部门`,
    newValue: { cycleId: resolvedCycleId, deptCount: deptIds.length },
  });

  return { results };
}

/**
 * 读部门警告历史（从 audit 读最近 10 条，不存专门表）
 */
export async function getCalibrationWarnings(
  actorId: string,
  deptId: string,
  cycleId?: string,
): Promise<AuditLog[]> {
  const dept = await prisma.department.findUnique({ where: { id: deptId } });
  if (!dept) {
    throw new AppError('部门不存在', 400, 72609);
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      action: 'CALIBRATION_RATIO_CHECK',
      resourceType: RESOURCE_TYPE,
      ...(cycleId ? { resourceId: cycleId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  await auditService.auditLog({
    userId: actorId,
    action: 'READ',
    resourceType: RESOURCE_TYPE,
    resourceId: deptId,
    description: '读取部门校准警告历史',
    newValue: { count: logs.length },
  });

  return logs;
}
