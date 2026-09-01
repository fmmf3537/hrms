/**
 * 考核记录 API（M5-2-D2）
 * @module api/performanceRecord
 * @description 消费 /api/performance/records 16 端点（0 新增）
 *  - 记录 CRU 主线（3）：POST/GET /records + GET /records/:id
 *  - 自评（2）：**PATCH** /records/:id/self + POST /records/:id/submit-self
 *  - AI 建议（2）：POST /records/:id/ai-suggest + GET /records/:id/ai-suggestions
 *  - 经理评分（2）：**PATCH** /records/:id/manager-score + POST /records/:id/submit-manager
 *  - 部门校准（2）：**PATCH** /records/:id/calibrate + POST /records/:id/submit-calibrate
 *  - HR 汇总（2）：**PATCH** /records/:id/hr-summary + POST /records/:id/submit-hr
 *  - CEO 审批（1）：**PATCH** /records/:id/ceo-approve
 *  - 归档 + 驳回（2）：POST /records/:id/archive + POST /records/:id/reject
 *
 * 「PATCH 存草稿 → POST submit 定稿」是本切片核心范式
 *
 * listRecords 用 unwrapRecordList 解包展平形态 { success, items, total, page, pageSize }
 *
 * @permission 5 角色无 finance；与 server/src/constants/permissions.ts 对齐
 */

import http from './http';
import { unwrapData } from './types/organization';
import {
  type CeoApproveRequest,
  type CreateRecordRequest,
  type CreateRecordResult,
  type PerformanceRecord,
  type PerformanceRecordDetail,
  type RecordAiSuggestResult,
  type RecordAiSuggestion,
  type RecordListQuery,
  type RejectRecordRequest,
  type SaveScoreRequest,
  unwrapRecordList,
} from './types/performanceRecord';
import type { PaginatedResponse } from './types';

export const RECORD_PATHS = {
  list: '/performance/records',
  detail: (id: string) => `/performance/records/${id}`,
  self: (id: string) => `/performance/records/${id}/self`,
  submitSelf: (id: string) => `/performance/records/${id}/submit-self`,
  aiSuggest: (id: string) => `/performance/records/${id}/ai-suggest`,
  aiSuggestions: (id: string) => `/performance/records/${id}/ai-suggestions`,
  managerScore: (id: string) => `/performance/records/${id}/manager-score`,
  submitManager: (id: string) => `/performance/records/${id}/submit-manager`,
  calibrate: (id: string) => `/performance/records/${id}/calibrate`,
  submitCalibrate: (id: string) => `/performance/records/${id}/submit-calibrate`,
  hrSummary: (id: string) => `/performance/records/${id}/hr-summary`,
  submitHr: (id: string) => `/performance/records/${id}/submit-hr`,
  ceoApprove: (id: string) => `/performance/records/${id}/ceo-approve`,
  archive: (id: string) => `/performance/records/${id}/archive`,
  reject: (id: string) => `/performance/records/${id}/reject`,
} as const;

// ============ 记录 CRU 主线 ============

/** POST /api/performance/records · performance:record:write */
export async function createRecord(
  body: CreateRecordRequest,
): Promise<CreateRecordResult> {
  const raw = await http.post(RECORD_PATHS.list, body);
  return unwrapData<CreateRecordResult>(raw);
}

/** GET /api/performance/records · performance:record:read */
export async function listRecords(
  query: RecordListQuery = {},
): Promise<PaginatedResponse<PerformanceRecord>> {
  const raw = await http.get(RECORD_PATHS.list, { params: query });
  return unwrapRecordList<PerformanceRecord>(raw);
}

/** GET /api/performance/records/:id · performance:record:read
 *  返回完整嵌套结构（scores/aiSuggestions/employee/cycle/scheme） */
export async function getRecord(
  id: string,
): Promise<PerformanceRecordDetail> {
  const raw = await http.get(RECORD_PATHS.detail(id));
  return unwrapData<PerformanceRecordDetail>(raw);
}

// ============ 自评 ============

/** PATCH /api/performance/records/:id/self · performance:self:submit（存草稿） */
export async function saveSelfScore(
  id: string,
  body: SaveScoreRequest,
): Promise<PerformanceRecordDetail> {
  const raw = await http.patch(RECORD_PATHS.self(id), body);
  return unwrapData<PerformanceRecordDetail>(raw);
}

/** POST /api/performance/records/:id/submit-self · performance:self:submit（推进状态机） */
export async function submitSelf(id: string): Promise<PerformanceRecord> {
  const raw = await http.post(RECORD_PATHS.submitSelf(id));
  return unwrapData<PerformanceRecord>(raw);
}

// ============ AI 建议 ============

/** POST /api/performance/records/:id/ai-suggest · performance:ai:request（同步返回） */
export async function requestAiSuggest(
  id: string,
): Promise<RecordAiSuggestResult> {
  const raw = await http.post(RECORD_PATHS.aiSuggest(id));
  return unwrapData<RecordAiSuggestResult>(raw);
}

/** GET /api/performance/records/:id/ai-suggestions · performance:ai:read */
export async function listAiSuggestions(
  id: string,
): Promise<RecordAiSuggestion[]> {
  const raw = await http.get(RECORD_PATHS.aiSuggestions(id));
  const data = unwrapData<RecordAiSuggestion[] | { items?: RecordAiSuggestion[] }>(raw);
  if (Array.isArray(data)) {
    return data;
  }
  return Array.isArray(data?.items) ? data.items : [];
}

// ============ 经理评分 ============

/** PATCH /api/performance/records/:id/manager-score · performance:manager:score（存草稿） */
export async function saveManagerScore(
  id: string,
  body: SaveScoreRequest,
): Promise<PerformanceRecordDetail> {
  const raw = await http.patch(RECORD_PATHS.managerScore(id), body);
  return unwrapData<PerformanceRecordDetail>(raw);
}

/** POST /api/performance/records/:id/submit-manager · performance:manager:score（推进状态机） */
export async function submitManager(id: string): Promise<PerformanceRecord> {
  const raw = await http.post(RECORD_PATHS.submitManager(id));
  return unwrapData<PerformanceRecord>(raw);
}

// ============ 部门校准 ============

/** PATCH /api/performance/records/:id/calibrate · performance:dept:calibrate（存草稿） */
export async function saveCalibration(
  id: string,
  body: SaveScoreRequest,
): Promise<PerformanceRecordDetail> {
  const raw = await http.patch(RECORD_PATHS.calibrate(id), body);
  return unwrapData<PerformanceRecordDetail>(raw);
}

/** POST /api/performance/records/:id/submit-calibrate · performance:dept:calibrate（推进状态机） */
export async function submitCalibration(id: string): Promise<PerformanceRecord> {
  const raw = await http.post(RECORD_PATHS.submitCalibrate(id));
  return unwrapData<PerformanceRecord>(raw);
}

// ============ HR 汇总 ============

/** PATCH /api/performance/records/:id/hr-summary · performance:hr:summary（存草稿） */
export async function saveHrSummary(
  id: string,
  body: SaveScoreRequest,
): Promise<PerformanceRecordDetail> {
  const raw = await http.patch(RECORD_PATHS.hrSummary(id), body);
  return unwrapData<PerformanceRecordDetail>(raw);
}

/** POST /api/performance/records/:id/submit-hr · performance:hr:summary（推进状态机） */
export async function submitHrSummary(id: string): Promise<PerformanceRecord> {
  const raw = await http.post(RECORD_PATHS.submitHr(id));
  return unwrapData<PerformanceRecord>(raw);
}

// ============ CEO 审批 ============

/** PATCH /api/performance/records/:id/ceo-approve · performance:ceo:approve（一次定稿） */
export async function ceoApprove(
  id: string,
  body: CeoApproveRequest,
): Promise<PerformanceRecord> {
  const raw = await http.patch(RECORD_PATHS.ceoApprove(id), body);
  return unwrapData<PerformanceRecord>(raw);
}

// ============ 归档 + 驳回 ============

/** POST /api/performance/records/:id/archive · performance:record:write */
export async function archiveRecord(id: string): Promise<PerformanceRecord> {
  const raw = await http.post(RECORD_PATHS.archive(id));
  return unwrapData<PerformanceRecord>(raw);
}

/** POST /api/performance/records/:id/reject · performance:record:write（reason min 5） */
export async function rejectRecord(
  id: string,
  body: RejectRecordRequest,
): Promise<PerformanceRecord> {
  const raw = await http.post(RECORD_PATHS.reject(id), body);
  return unwrapData<PerformanceRecord>(raw);
}