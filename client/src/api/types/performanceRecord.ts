/**
 * 考核记录 API 类型（M5-2-D2）
 * @module api/types/performanceRecord
 * @description 对齐 server 端 3 个 service：
 *   performance_record.service.ts +
 *   performance_score.service.ts +
 *   performance_ai_suggestion.service.ts
 *
 * - RecordStatus 字符串字面量全集 13 个（来自 RECORD_STATUS 常量）
 *   状态机 6 步（ElSteps）：自评 → 经理评分 → 部门校准 → HR 汇总 → CEO 审批 → 归档
 *   save(PATCH) 阶段 → status 校验（STAGE_REQUIRED_STATUS）
 *   submit(POST) 推进状态机（SUBMIT_NEXT_STATUS）
 *   reject 后的状态 = 'rejected'（不自动回滚到上一步，前端按 status 显 Alert）
 *
 * - 16 端点消费：CRUD 主线 3 + 自评 2 + AI 2 + 经理 2 + 校准 2 + HR 2 + CEO 1 + 归档驳回 2
 * - getRecord 嵌套结构：scores[stage asc, version desc] / aiSuggestions[20] / employee / cycle / scheme{indicators}
 * - listRecords 返回 { success, items, total, page, pageSize } 直接展平（**不**是 data 嵌套），
 *   本切片自带 unwrapRecordList 解包（D1 unwrapPerformancePage 不支持展平形态，故不复用）
 *
 * @permission 5 角色无 finance；与 server/src/constants/permissions.ts 对齐
 *   - performance:record:read      admin/hr/dept_head/executive/employee
 *   - performance:record:write     admin/hr（创建/归档/驳回）
 *   - performance:self:submit      admin/employee
 *   - performance:manager:score    admin/dept_head
 *   - performance:dept:calibrate   admin/dept_head
 *   - performance:hr:summary       admin/hr
 *   - performance:ceo:approve      admin/executive
 *   - performance:ai:request       admin/dept_head/executive
 *   - performance:ai:read          admin/hr/dept_head/executive（employee 不可见）
 */

import type { ApiResponse, PaginatedResponse, UserInfo } from '@/api/types';
import { hasPermission } from '@/utils/permission';
import { GRADE_LABELS } from './performance';
import type { Grade, PerformanceCycle, PerformanceScheme } from './performance';

export type { Grade };
export { GRADE_LABELS };

// ============ 状态枚举 ============

/** RecordStatus 字符串字面量联合（与 RECORD_STATUS 全集对齐） */
export type RecordStatus =
  | 'draft'
  | 'self_submitted'
  | 'manager_scoring'
  | 'manager_scored'
  | 'dept_calibrating'
  | 'dept_calibrated'
  | 'hr_summarizing'
  | 'hr_summarized'
  | 'ceo_approving'
  | 'ceo_approved'
  | 'archived'
  | 'rejected'
  | 'cancelled';

/** 评分环节（与 ScoreStage backend type 对齐） */
export type ScoreStage = 'self' | 'manager' | 'calibrate' | 'hr' | 'ceo';

/** 页面内部可识别的动作环节（含 AI/归档/驳回） */
export type RecordAction =
  | 'self'
  | 'manager'
  | 'calibrate'
  | 'hr'
  | 'ceo'
  | 'ai'
  | 'archive'
  | 'reject';

// ============ 状态映射 ============

export interface RecordStatusTagInfo {
  label: string;
  type: 'success' | 'warning' | 'info' | 'danger' | 'primary';
  step: number;
}

export const RECORD_STATUS_MAP: Record<RecordStatus, RecordStatusTagInfo> = {
  draft: { label: '待自评', type: 'info', step: 0 },
  self_submitted: { label: '已自评', type: 'info', step: 0 },
  manager_scoring: { label: '上级评分中', type: 'warning', step: 1 },
  manager_scored: { label: '上级评分完成', type: 'warning', step: 1 },
  dept_calibrating: { label: '部门校准中', type: 'warning', step: 2 },
  dept_calibrated: { label: '部门校准完成', type: 'warning', step: 2 },
  hr_summarizing: { label: 'HR 汇总中', type: 'warning', step: 3 },
  hr_summarized: { label: 'HR 汇总完成', type: 'warning', step: 3 },
  ceo_approving: { label: '待总经理审批', type: 'warning', step: 4 },
  ceo_approved: { label: '已审批', type: 'success', step: 4 },
  archived: { label: '已归档', type: 'primary', step: 5 },
  rejected: { label: '已驳回', type: 'danger', step: -1 },
  cancelled: { label: '已作废', type: 'danger', step: -1 },
};

export function recordStatusInfo(status: string | null | undefined): RecordStatusTagInfo {
  if (!status) {
    return { label: '—', type: 'info', step: 0 };
  }
  return RECORD_STATUS_MAP[status as RecordStatus] ?? { label: status, type: 'info' as const, step: 0 };
}

/** ElSteps 6 环节标题（固定顺序） */
export const RECORD_STEPS: readonly string[] = [
  '自评',
  '经理评分',
  '部门校准',
  'HR 汇总',
  'CEO 审批',
  '归档',
] as const;

/**
 * 计算 ElSteps 的 active 值（-1 表示被驳回/作废时不点亮步骤条）
 */
export function recordStepIndex(status: string | null | undefined): number {
  return recordStatusInfo(status).step;
}

// ============ 嵌套结构 ============

/** getRecord 返回的评分明细（PerformanceScore + items） */
export interface RecordScoreItem {
  id: string;
  indicatorId: string;
  weight: string | number;
  scoreValue: string | number;
  weightedScore: string | number;
  comment: string | null;
}

export interface RecordScore {
  id: string;
  recordId: string;
  stage: ScoreStage | string;
  totalScore: string | number;
  comment: string | null;
  isCurrent: boolean;
  version: number;
  submittedBy: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
  items: RecordScoreItem[];
}

export interface AiSuggestionItem {
  grade: Grade | string;
  confidence: number;
  reasons: string[];
}

export interface RecordAiSuggestion {
  id: string;
  recordId: string;
  prompt: string;
  rawResponse: string;
  suggestions: AiSuggestionItem[];
  modelName: string;
  tokens: number;
  cost: string | number;
  durationMs: number;
  createdAt: string;
}

export interface RecordAiSuggestResult {
  suggestionId: string;
  suggestions: AiSuggestionItem[];
  cost: number;
  tokens: number;
  durationMs: number;
}

export interface RecordEmployeeBrief {
  id: string;
  name: string;
  departmentId: string | null;
  userId: string | null;
}

export interface PerformanceRecordDetail {
  id: string;
  employeeId: string;
  cycleId: string;
  schemeId: string | null;
  status: RecordStatus | string;
  finalGrade: Grade | string | null;
  finalScore: string | number | null;
  submittedAt: string | null;
  archivedAt: string | null;
  approvalInstanceId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  scores: RecordScore[];
  aiSuggestions: RecordAiSuggestion[];
  employee: RecordEmployeeBrief;
  cycle: PerformanceCycle;
  scheme: (PerformanceScheme & { indicators?: unknown }) | null;
}

export interface PerformanceRecord {
  id: string;
  employeeId: string;
  cycleId: string;
  schemeId: string | null;
  status: RecordStatus | string;
  finalGrade: Grade | string | null;
  finalScore: string | number | null;
  submittedAt: string | null;
  archivedAt: string | null;
  approvalInstanceId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ============ 请求体 ============

export interface ScoreItemInput {
  indicatorId: string;
  score: number;
  comment?: string;
}

export interface SaveScoreRequest {
  comment?: string;
  items: ScoreItemInput[];
  basedOnAiSuggestionId?: string;
}

export interface CeoApproveRequest {
  finalGrade: Grade;
  finalScore: number;
  comment?: string;
}

export interface RejectRecordRequest {
  reason: string;
}

export interface CreateRecordRequest {
  cycleId: string;
  employeeIds: string[];
  schemeId?: string;
}

export interface RecordListQuery {
  cycleId?: string;
  employeeId?: string;
  status?: RecordStatus | string;
  deptId?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateRecordResult {
  created: PerformanceRecord[];
  skipped: Array<{ employeeId: string; reason: string }>;
}

// ============ 解包函数（独立于 D1 unwrapPerformancePage） ============

/**
 * 解包 listRecords 返回 { success, items, total, page, pageSize }（**展平形态**）
 * 兼容 { data: { items, total, page, pageSize } } 嵌套形态（兜底）
 * 兼容 data 为数组形态（兜底）
 */
export function unwrapRecordList<T>(raw: unknown): PaginatedResponse<T> {
  if (!raw || typeof raw !== 'object') {
    throw new Error('接口响应格式异常');
  }
  const envelope = raw as ApiResponse<unknown> & {
    items?: T[];
    total?: number;
    page?: number;
    pageSize?: number;
  };

  // 形态 A：{ success, items, total, page, pageSize } 直接展平
  if (Array.isArray(envelope.items)) {
    const { items } = envelope;
    return {
      items,
      total: typeof envelope.total === 'number' ? envelope.total : items.length,
      page: typeof envelope.page === 'number' ? envelope.page : 1,
      pageSize: typeof envelope.pageSize === 'number' ? envelope.pageSize : items.length,
    };
  }

  // 形态 B：{ success, data: { items, total, page, pageSize } } 嵌套
  const inner = envelope.data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner) && 'items' in inner) {
    const page = inner as {
      items?: T[];
      total?: number;
      page?: number;
      pageSize?: number;
    };
    const items = Array.isArray(page.items) ? page.items : [];
    return {
      items,
      total: typeof page.total === 'number' ? page.total : items.length,
      page: typeof page.page === 'number' ? page.page : 1,
      pageSize: typeof page.pageSize === 'number' ? page.pageSize : items.length,
    };
  }

  // 形态 C：data 为数组
  if (Array.isArray(inner)) {
    return {
      items: inner as T[],
      total: typeof envelope.total === 'number' ? envelope.total : inner.length,
      page: typeof envelope.page === 'number' ? envelope.page : 1,
      pageSize: typeof envelope.pageSize === 'number' ? envelope.pageSize : inner.length,
    };
  }

  return { items: [], total: 0, page: 1, pageSize: 20 };
}

// ============ 显隐判定 ============

const ACTION_PERMISSION: Record<RecordAction, string> = {
  self: 'performance:self:submit',
  manager: 'performance:manager:score',
  calibrate: 'performance:dept:calibrate',
  hr: 'performance:hr:summary',
  ceo: 'performance:ceo:approve',
  ai: 'performance:ai:request',
  archive: 'performance:record:write',
  reject: 'performance:record:write',
};

/**
 * 哪些 status 允许编辑/提交/AI/归档/驳回（基于 STAGE_REQUIRED_STATUS + 状态机）
 * - self:    draft
 * - manager: manager_scoring
 * - calibrate: dept_calibrating
 * - hr:      hr_summarizing
 * - ceo:     ceo_approving（一次定稿，无须 save 阶段）
 * - ai:      manager_scoring（AI 建议只在上级评分环节发起）
 * - archive: ceo_approved
 * - reject:  8 个 REJECTABLE_STATUSES
 *   （self_submitted/manager_scoring/manager_scored/
 *     dept_calibrating/dept_calibrated/hr_summarizing/
 *     hr_summarized/ceo_approving）
 */
const ACTION_STATUSES: Record<RecordAction, readonly string[]> = {
  self: ['draft'],
  manager: ['manager_scoring'],
  calibrate: ['dept_calibrating'],
  hr: ['hr_summarizing'],
  ceo: ['ceo_approving'],
  ai: ['manager_scoring'],
  archive: ['ceo_approved'],
  reject: [
    'self_submitted',
    'manager_scoring',
    'manager_scored',
    'dept_calibrating',
    'dept_calibrated',
    'hr_summarizing',
    'hr_summarized',
    'ceo_approving',
  ],
};

/**
 * 详情页环节面板的可见权限点（不依赖 status，只做权限维判定）
 * - ai: ai:read（employee 不可见 AI 建议列表）
 */
export function hasRecordReadPermission(user: UserInfo | null): boolean {
  return hasPermission(user, 'performance:record:read');
}

/** 详情页 AI 建议列表显隐（ai:read，employee 不可见） */
export function canRecordAiRead(user: UserInfo | null): boolean {
  return hasPermission(user, 'performance:ai:read');
}

/**
 * 三维判定：动作 × 状态 × 权限
 * - employee 自评环节需额外判断「记录属于本人」
 *   → 调用方传入 isOwn: record.employeeId === currentUser.employeeId
 */
export function canRecordStageAction(
  action: RecordAction,
  record: { status: string; employeeId: string },
  user: UserInfo | null,
  isOwn = false,
): boolean {
  if (!ACTION_STATUSES[action].includes(record.status)) {
    return false;
  }
  if (action === 'self') {
    // 自评仅 employee 本人；admin 通配也允许
    if (user?.permissions?.includes('*')) {
      return true;
    }
    if (!isOwn) {
      return false;
    }
    return hasPermission(user, ACTION_PERMISSION[action]);
  }
  if (action === 'ai') {
    // AI 建议发起：仅 manager/calibrate/ceo 角色 + 当前阶段 manager_scoring
    return hasPermission(user, ACTION_PERMISSION[action]);
  }
  return hasPermission(user, ACTION_PERMISSION[action]);
}

/**
 * 自评面板是否可编辑（employee 本人 + record.status === draft + self:submit）
 * RecordDetail 页面用
 */
export function canRecordSelfEdit(
  record: { status: string; employeeId: string },
  user: UserInfo | null,
  isOwn = false,
): boolean {
  if (record.status !== 'draft') {
    return false;
  }
  if (user?.permissions?.includes('*')) {
    return true;
  }
  if (!isOwn) {
    return false;
  }
  return hasPermission(user, 'performance:self:submit');
}