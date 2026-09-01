/**
 * 绩效奖金 / 等级计算 API 类型（M5-2-D3）
 * @module api/types/performancePayout
 * @description 对齐 server/src/services/performance_*.service.ts（M3-D3 + M3-D4）
 *
 * 11 端点响应结构（§5.1 逐一确认）：
 *  - 等级计算 2 端点返回 { recordId, finalScore, oldGrade, newGrade, threshold }
 *  - 批量等级 { succeeded: [...], failed: Array<{recordId, error, code?}> }
 *  - 校准比例 { results: Array<{deptId, deptName, cycleId, totalRecords, actualRatios, expectedRatios, warnings}> }
 *  - config GET/PATCH → Prisma PerformancePayoutConfig
 *  - payout list → { items, total, page, pageSize }（含 employee + cycle，unwrapPerformancePage 解包）
 *  - payout detail → PerformancePayout（含 employee + cycle）
 *  - prepay → PerformancePayout[]（多条）
 *  - settle → { settlements, totalDifference, totalPrepaid, totalActual }（Decimal 字段序列化为 string）
 *  - calculate direct → 单条 PerformancePayout；calculate pool → PerformancePayout[]；calculate-pool → PerformancePayout[]
 *
 * Prisma Decimal 经 JSON 序列化为字符串，前端用 string | number 兼容。
 *
 * @permission 5 角色无 finance
 *  - performance:grade:calculate   admin/hr/executive
 *  - performance:record:read       5 角色全开（calibrate-ratios 用此权限点）
 *  - performance:payout:read       5 角色全开
 *  - performance:payout:write      admin/hr（配置切换）
 *  - performance:payout:calculate  admin/hr/executive
 *  - performance:payout:settle     admin/hr/executive（prepay + settle 共用）
 */

import type { PaginatedResponse, UserInfo } from '@/api/types';
import { hasPermission } from '@/utils/permission';
import type { Grade, GradeThresholds, PerformanceCycle } from './performance';
import { unwrapPerformancePage } from './performance';

export type { Grade, GradeThresholds };

// ============ 等级计算返回 ============

export interface CalculateGradeResult {
  recordId: string;
  finalScore: number;
  oldGrade: Grade | null;
  newGrade: Grade;
  threshold: GradeThresholds;
}

export interface BatchGradeFailure {
  recordId: string;
  error: string;
  code?: number;
}

export interface BatchGradeResult {
  succeeded: CalculateGradeResult[];
  failed: BatchGradeFailure[];
}

// ============ 部门比例校准返回 ============

export interface DeptCalibrationRatio {
  deptId: string;
  deptName: string;
  cycleId: string;
  totalRecords: number;
  actualRatios: Record<Grade, number>;
  expectedRatios: Record<Grade, number>;
  warnings: string[];
}

export interface CalibrationResult {
  results: DeptCalibrationRatio[];
}

// ============ 兑现配置 ============

export type PayoutMode = 'direct' | 'pool';

export interface PayoutConfig {
  id: string;
  mode: PayoutMode | string;
  effectiveFrom: string;
  effectiveTo: string | null;
  remark: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SwitchPayoutConfigRequest {
  mode: PayoutMode;
  effectiveFrom?: string;
  remark?: string;
}

// ============ 奖金单（Payout）============
// Prisma PerformancePayout + include(employee + cycle)；Decimal 字段经 JSON 为 string

export type PayoutStatus = 'draft' | 'calculated' | 'prepaid' | 'settled' | 'cancelled';

export interface PayoutEmployeeBrief {
  id: string;
  name: string;
  departmentId: string | null;
}

export interface Payout {
  id: string;
  employeeId: string;
  cycleId: string;
  month: string;
  period: string | null;
  mode: PayoutMode | string;
  status: PayoutStatus | string;
  baseAmount: string | number | null;
  coefficient: string | number | null;
  ratio: string | number | null;
  actualAmount: string | number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** list/detail 内嵌（service include） */
  employee?: PayoutEmployeeBrief | null;
  cycle?: PerformanceCycle | null;
}

// ============ 列表查询 / 计算 / 结算 请求 ============

export interface PayoutListQuery {
  cycleId?: string;
  employeeId?: string;
  mode?: PayoutMode;
  status?: PayoutStatus;
  /** YYYY-MM 严格正则 */
  period?: string;
  page?: number;
  pageSize?: number;
}

export interface CalculatePayoutRequest {
  /** 默认 direct；pool 模式走部门池 */
  mode?: PayoutMode;
  /** direct 模式必传 */
  employeeId?: string;
  /** pool 模式使用 */
  deptIds?: string[];
  cycleId: string;
  /** YYYY-MM */
  month: string;
}

export interface CalculateDeptPoolRequest {
  deptId: string;
  cycleId: string;
  month: string;
}

export interface PrepayPayoutRequest {
  cycleId: string;
  month: string;
  employeeId?: string;
}

export interface SettlePayoutRequest {
  cycleId: string;
  /** 季度 1-4 */
  quarter: number;
  employeeId?: string;
}

// ============ settle 返回 ============

export interface SettleResult {
  settlements: Payout[];
  /** Prisma Decimal 经 JSON 序列化为 string；前端用 string | number 兼容 */
  totalDifference: string | number;
  totalPrepaid: string | number;
  totalActual: string | number;
}

// ============ 状态映射（页面 + 测试共用）============

export interface PayoutTagInfo {
  label: string;
  type: 'success' | 'warning' | 'info' | 'danger';
}

export const PAYOUT_STATUS_MAP: Record<PayoutStatus, PayoutTagInfo> = {
  draft: { label: '草稿', type: 'info' },
  calculated: { label: '已计算', type: 'warning' },
  prepaid: { label: '已预发', type: 'warning' },
  settled: { label: '已结算', type: 'success' },
  cancelled: { label: '已取消', type: 'info' },
};

export const PAYOUT_MODE_LABELS: Record<PayoutMode, string> = {
  direct: '直乘',
  pool: '部门池',
};

export function payoutStatusInfo(status: string | null | undefined): PayoutTagInfo {
  if (!status) return { label: '-', type: 'info' };
  return PAYOUT_STATUS_MAP[status as PayoutStatus] ?? { label: status, type: 'info' };
}

// ============ 权限辅助（页面 + 测试共用）============

export type PayoutAction = 'calculate' | 'prepay' | 'settle' | 'config';

const ACTION_PERMISSION: Record<PayoutAction, string> = {
  calculate: 'performance:payout:calculate',
  prepay: 'performance:payout:settle',
  settle: 'performance:payout:settle',
  config: 'performance:payout:write',
};

/**
 * 判断当前用户是否可执行 payout 动作
 * @param action calculate/prepay/settle/config
 * @param user 当前登录用户（来自 useUserStore）
 * @returns 是否可见/可操作
 */
export function canPayoutAction(action: PayoutAction, user: UserInfo | null): boolean {
  return hasPermission(user, ACTION_PERMISSION[action]);
}

// ============ 分页解包（与 D1 一致）============

/** GET /payouts 返回 { success, data: { items, total, page, pageSize } } → 解包为 PaginatedResponse<Payout> */
export function unwrapPayoutList(raw: unknown): PaginatedResponse<Payout> {
  return unwrapPerformancePage<Payout>(raw);
}