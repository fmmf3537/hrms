/**
 * 绩效管理 API 类型（M5-2-D1）
 * @module api/types/performance
 * @description 对齐 server/src/services/performance_*.service.ts
 * - 三个 list（cycles / indicators / schemes）返回 { items, total, page, pageSize }，使用 unwrapSalaryPage
 * - 方案 list 内嵌 indicators 数组（PerformanceSchemeWithIndicators）
 * - coefficient GET 返回 Record<S|A|B|C|D, number>（无元数据）
 * - grade thresholds = { S, A, B, C, D: number }（0-100 区间）
 * - 状态列：cycle draft|active|closed / scheme draft|active|archived / indicator active|archived
 */

import type { ApiResponse, PaginatedResponse } from '@/api/types';

export type PerformanceTagType = 'success' | 'warning' | 'info' | 'danger';

// ============ 考核周期 ============

export type CycleType = 'monthly' | 'quarterly' | 'yearly';

export type CycleStatus = 'draft' | 'active' | 'closed';

export interface PerformanceCycle {
  id: string;
  code: string;
  name: string;
  type: CycleType | string;
  startDate: string;
  endDate: string;
  status: CycleStatus | string;
  description?: string | null;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCycleRequest {
  code: string;
  name: string;
  type: CycleType;
  startDate: string;
  endDate: string;
  description?: string;
}

export interface UpdateCycleRequest {
  code?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  /** 状态流转也走 PATCH body.status */
  status?: CycleStatus;
}

export interface CycleListQuery {
  type?: CycleType;
  status?: CycleStatus;
  year?: number;
  page?: number;
  pageSize?: number;
}

// ============ 指标库 ============

export type IndicatorType = 'KPI' | 'OKR' | 'BSC' | '360';

export type IndicatorStatus = 'active' | 'archived';

export interface PerformanceIndicator {
  id: string;
  code: string;
  name: string;
  type: IndicatorType | string;
  category?: string | null;
  description?: string | null;
  defaultWeight?: string | number | null;
  target?: string | null;
  unit?: string | null;
  scoringRule?: string | null;
  status: IndicatorStatus | string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIndicatorRequest {
  code: string;
  name: string;
  type: IndicatorType;
  category?: string;
  description?: string;
  defaultWeight?: number;
  target?: string;
  unit?: string;
  scoringRule?: string;
}

export interface IndicatorListQuery {
  type?: IndicatorType;
  status?: IndicatorStatus;
  category?: string;
  page?: number;
  pageSize?: number;
}

// ============ 考核方案 ============

export type ApplicableScope = 'company' | 'department' | 'position';

export type SchemeStatus = 'draft' | 'active' | 'archived';

export interface SchemeIndicator {
  indicatorId: string;
  weight: number;
  target?: string;
  sortOrder?: number;
}

export interface SchemeIndicatorRow extends SchemeIndicator {
  id?: string;
}

export interface PerformanceScheme {
  id: string;
  code: string;
  name: string;
  cycleId?: string | null;
  applicableScope: ApplicableScope | string;
  applicableDeptId?: string | null;
  applicablePositionLevel?: string | null;
  status: SchemeStatus | string;
  description?: string | null;
  version?: number;
  sourceSchemeId?: string | null;
  /** list 接口内嵌（按 sortOrder asc） */
  indicators?: SchemeIndicatorRow[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSchemeRequest {
  code: string;
  name: string;
  cycleId?: string;
  applicableScope: ApplicableScope;
  applicableDeptId?: string;
  applicablePositionLevel?: string;
  description?: string;
  /** min 1，权重总和必须 = 100（service 强校验） */
  indicators: SchemeIndicator[];
}

export interface CloneSchemeRequest {
  newCode: string;
  newName: string;
}

export interface SchemeListQuery {
  cycleId?: string;
  status?: SchemeStatus;
  applicableScope?: ApplicableScope;
  page?: number;
  pageSize?: number;
}

// ============ 绩效系数 ============

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export type Coefficients = Record<Grade, number>;

// ============ 等级阈值 ============

export interface GradeThresholds {
  S: number;
  A: number;
  B: number;
  C: number;
  D: number;
}

// ============ 状态映射常量（导出供页面与测试共用） ============

export interface StatusTagInfo {
  label: string;
  type: PerformanceTagType;
}

export const CYCLE_STATUS_MAP: Record<CycleStatus, StatusTagInfo> = {
  draft: { label: '草稿', type: 'info' },
  active: { label: '生效', type: 'success' },
  closed: { label: '已关闭', type: 'warning' },
};

export const SCHEME_STATUS_MAP: Record<SchemeStatus, StatusTagInfo> = {
  draft: { label: '草稿', type: 'info' },
  active: { label: '生效', type: 'success' },
  archived: { label: '已归档', type: 'warning' },
};

export const INDICATOR_STATUS_MAP: Record<IndicatorStatus, StatusTagInfo> = {
  active: { label: '启用', type: 'success' },
  archived: { label: '已归档', type: 'warning' },
};

export const CYCLE_TYPE_LABELS: Record<CycleType, string> = {
  monthly: '月度',
  quarterly: '季度',
  yearly: '年度',
};

export const INDICATOR_TYPE_LABELS: Record<IndicatorType, string> = {
  KPI: 'KPI',
  OKR: 'OKR',
  BSC: 'BSC',
  '360': '360°',
};

export const SCOPE_LABELS: Record<ApplicableScope, string> = {
  company: '公司',
  department: '部门',
  position: '岗位',
};

export const GRADE_LABELS: Record<Grade, string> = {
  S: 'S',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
};

export function cycleStatusInfo(status: string | null | undefined): StatusTagInfo {
  if (!status) {
    return { label: '—', type: 'info' };
  }
  return CYCLE_STATUS_MAP[status as CycleStatus] ?? { label: status, type: 'info' };
}

export function schemeStatusInfo(status: string | null | undefined): StatusTagInfo {
  if (!status) {
    return { label: '—', type: 'info' };
  }
  return SCHEME_STATUS_MAP[status as SchemeStatus] ?? { label: status, type: 'info' };
}

export function indicatorStatusInfo(status: string | null | undefined): StatusTagInfo {
  if (!status) {
    return { label: '—', type: 'info' };
  }
  return INDICATOR_STATUS_MAP[status as IndicatorStatus] ?? { label: status, type: 'info' };
}

/**
 * 解包 { success, data: { items, total, page, pageSize } }（D1 三个 list 都用此形态）
 * 兼容 data 为数组的兜底形态
 */
export function unwrapPerformancePage<T>(raw: unknown): PaginatedResponse<T> {
  if (!raw || typeof raw !== 'object') {
    throw new Error('接口响应格式异常');
  }
  const envelope = raw as ApiResponse<unknown> & {
    items?: T[];
    total?: number;
    page?: number;
    pageSize?: number;
  };
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
  if (Array.isArray(inner)) {
    return {
      items: inner as T[],
      total: typeof envelope.total === 'number' ? envelope.total : inner.length,
      page: typeof envelope.page === 'number' ? envelope.page : 1,
      pageSize: typeof envelope.pageSize === 'number' ? envelope.pageSize : inner.length,
    };
  }
  return {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  };
}
