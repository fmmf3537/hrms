/**
 * 绩效等级计算 API（M5-2-D3）
 * @module api/performanceGrade
 * @description 消费 /api/performance/grade/* 3 端点
 *  - POST /grade/calculate         performance:grade:calculate
 *  - POST /grade/calculate-batch   performance:grade:calculate
 *  - POST /grade/calibrate-ratios  performance:**record:read**（注意：不是 grade:calculate）
 *
 * 后端 service: performance_grade.service.ts + performance_calibration_ratio.service.ts
 *
 * @permission 5 角色无 finance
 */
import http from './http';
import { unwrapData } from './types/organization';
import {
  type BatchGradeResult,
  type CalculateGradeResult,
  type CalibrationResult,
} from './types/performancePayout';

export const GRADE_PATHS = {
  calculate: '/performance/grade/calculate',
  calculateBatch: '/performance/grade/calculate-batch',
  calibrateRatios: '/performance/grade/calibrate-ratios',
} as const;

/** POST /api/performance/grade/calculate 路 performance:grade:calculate
 *  单笔等级计算：传入 recordId（必填）+ force（可选，强制覆盖已判等级） */
export async function calculateGrade(
  recordId: string,
  force?: boolean,
): Promise<CalculateGradeResult> {
  const body: { recordId: string; force?: boolean } = { recordId };
  if (force !== undefined) body.force = force;
  const raw = await http.post(GRADE_PATHS.calculate, body);
  return unwrapData<CalculateGradeResult>(raw);
}

/** POST /api/performance/grade/calculate-batch 路 performance:grade:calculate
 *  批量等级计算：recordIds（≥1）+ force + batchSize（≤100） */
export async function calculateBatchGrade(
  recordIds: string[],
  options?: { force?: boolean; batchSize?: number },
): Promise<BatchGradeResult> {
  const body: {
    recordIds: string[];
    force?: boolean;
    batchSize?: number;
  } = { recordIds };
  if (options?.force !== undefined) body.force = options.force;
  if (options?.batchSize !== undefined) body.batchSize = options.batchSize;
  const raw = await http.post(GRADE_PATHS.calculateBatch, body);
  return unwrapData<BatchGradeResult>(raw);
}

/** POST /api/performance/grade/calibrate-ratios 路 performance:**record:read**（非 grade:calculate）
 *  部门比例校准：deptIds（≥1）+ cycleId（可选，自动取最近 closed → active） */
export async function calibrateDeptRatios(
  deptIds: string[],
  cycleId?: string,
): Promise<CalibrationResult> {
  const body: { deptIds: string[]; cycleId?: string } = { deptIds };
  if (cycleId) body.cycleId = cycleId;
  const raw = await http.post(GRADE_PATHS.calibrateRatios, body);
  return unwrapData<CalibrationResult>(raw);
}