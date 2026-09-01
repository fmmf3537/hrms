/**
 * 绩效管理 API（M5-2-D1）
 * @module api/performance
 * @description 消费 /api/performance 已有 12 端点（0 新增）
 *  - 周期 3：POST/GET /cycles + PATCH /cycles/:id（**状态流转也走 PATCH body.status**）
 *  - 指标 2：POST/GET /indicators（**没有 PATCH /indicators/:id**）
 *  - 方案 3：POST/GET /schemes + POST /schemes/:id/clone
 *  - 系数 2：GET/PATCH /coefficients（**整体对象 PATCH**）
 *  - 阈值 2：GET/PATCH /grade/thresholds（**整体对象 PATCH**）
 *
 * list 函数（listCycles / listIndicators / listSchemes）形态统一为
 * { success, data: { items, total, page, pageSize } }，使用 unwrapPerformancePage 解包。
 *
 * @permission 5 角色无 finance；与 server/src/constants/permissions.ts 对齐
 */

import http from './http';
import type { PaginatedResponse } from './types';
import { unwrapData } from './types/organization';
import {
  type CloneSchemeRequest,
  type Coefficients,
  type CreateCycleRequest,
  type CreateIndicatorRequest,
  type CreateSchemeRequest,
  type CycleListQuery,
  type GradeThresholds,
  type IndicatorListQuery,
  type PerformanceCycle,
  type PerformanceIndicator,
  type PerformanceScheme,
  type SchemeListQuery,
  type UpdateCycleRequest,
  unwrapPerformancePage,
} from './types/performance';

export const PERFORMANCE_PATHS = {
  cycles: '/performance/cycles',
  cycle: (id: string) => `/performance/cycles/${id}`,
  indicators: '/performance/indicators',
  schemes: '/performance/schemes',
  schemeClone: (id: string) => `/performance/schemes/${id}/clone`,
  coefficients: '/performance/coefficients',
  gradeThresholds: '/performance/grade/thresholds',
} as const;

// ============ 考核周期 ============

/** POST /api/performance/cycles · performance:cycle:write */
export async function createCycle(body: CreateCycleRequest): Promise<PerformanceCycle> {
  const raw = await http.post(PERFORMANCE_PATHS.cycles, body);
  return unwrapData<PerformanceCycle>(raw);
}

/** GET /api/performance/cycles · performance:cycle:read */
export async function listCycles(
  query: CycleListQuery = {},
): Promise<PaginatedResponse<PerformanceCycle>> {
  const raw = await http.get(PERFORMANCE_PATHS.cycles, { params: query });
  return unwrapPerformancePage<PerformanceCycle>(raw);
}

/** PATCH /api/performance/cycles/:id · performance:cycle:write（含状态流转） */
export async function updateCycle(
  id: string,
  body: UpdateCycleRequest,
): Promise<PerformanceCycle> {
  const raw = await http.patch(PERFORMANCE_PATHS.cycle(id), body);
  return unwrapData<PerformanceCycle>(raw);
}

// ============ 指标库 ============

/** POST /api/performance/indicators · performance:indicator:write */
export async function createIndicator(
  body: CreateIndicatorRequest,
): Promise<PerformanceIndicator> {
  const raw = await http.post(PERFORMANCE_PATHS.indicators, body);
  return unwrapData<PerformanceIndicator>(raw);
}

/** GET /api/performance/indicators · performance:indicator:read */
export async function listIndicators(
  query: IndicatorListQuery = {},
): Promise<PaginatedResponse<PerformanceIndicator>> {
  const raw = await http.get(PERFORMANCE_PATHS.indicators, { params: query });
  return unwrapPerformancePage<PerformanceIndicator>(raw);
}

// ============ 考核方案 ============

/** POST /api/performance/schemes · performance:scheme:write */
export async function createScheme(body: CreateSchemeRequest): Promise<PerformanceScheme> {
  const raw = await http.post(PERFORMANCE_PATHS.schemes, body);
  return unwrapData<PerformanceScheme>(raw);
}

/** GET /api/performance/schemes · performance:scheme:read（list 内嵌 indicators） */
export async function listSchemes(
  query: SchemeListQuery = {},
): Promise<PaginatedResponse<PerformanceScheme>> {
  const raw = await http.get(PERFORMANCE_PATHS.schemes, { params: query });
  return unwrapPerformancePage<PerformanceScheme>(raw);
}

/** POST /api/performance/schemes/:id/clone · performance:scheme:write */
export async function cloneScheme(
  id: string,
  body: CloneSchemeRequest,
): Promise<PerformanceScheme> {
  const raw = await http.post(PERFORMANCE_PATHS.schemeClone(id), body);
  return unwrapData<PerformanceScheme>(raw);
}

// ============ 绩效系数 ============

/** GET /api/performance/coefficients · performance:coefficient:read
 * 返回 Record<S|A|B|C|D, number>（无元数据） */
export async function getCoefficients(): Promise<Coefficients> {
  const raw = await http.get(PERFORMANCE_PATHS.coefficients);
  return unwrapData<Coefficients>(raw);
}

/** PATCH /api/performance/coefficients · performance:coefficient:write
 * 整体对象 PATCH：必须一次性提交 S/A/B/C/D 五个键 */
export async function updateCoefficients(
  body: Coefficients,
): Promise<Coefficients> {
  const raw = await http.patch(PERFORMANCE_PATHS.coefficients, body);
  return unwrapData<Coefficients>(raw);
}

// ============ 等级阈值 ============

/** GET /api/performance/grade/thresholds · performance:grade:threshold:read */
export async function getGradeThresholds(): Promise<GradeThresholds> {
  const raw = await http.get(PERFORMANCE_PATHS.gradeThresholds);
  return unwrapData<GradeThresholds>(raw);
}

/** PATCH /api/performance/grade/thresholds · performance:grade:threshold:write
 * 整体对象 PATCH：S>A>B>C>D ≥ 0（service 强校验） */
export async function updateGradeThresholds(
  body: GradeThresholds,
): Promise<GradeThresholds> {
  const raw = await http.patch(PERFORMANCE_PATHS.gradeThresholds, body);
  return unwrapData<GradeThresholds>(raw);
}
