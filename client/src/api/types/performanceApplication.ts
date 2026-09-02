import type { UserInfo } from '@/api/types';

export type AdjustmentStatus = 'proposed' | 'approved' | 'rejected';

export type PipStatus = 'active' | 'completed' | 'failed' | 'cancelled';

export type PipReviewRating = 'improved' | 'no_change' | 'worsened';

export interface ApplicationTagInfo {
  label: string;
  type: 'success' | 'warning' | 'info' | 'danger';
}

export interface AdjustmentPayload {
  employeeId: string;
  period: string;
  evaluationQuarters: number;
  sRatio: number;
  aRatio: number;
  adjustmentRate: number;
  totalRecords: number;
  approvalStatus: AdjustmentStatus;
}

export interface PromotionPayload {
  employeeId: string;
  aCount: number;
  sCount: number;
  requirementMet: boolean;
  lookbackYears: number;
  recordCount: number;
  proposedPosition: string;
}

export interface AuditLogFields {
  id: string;
  userId?: string | null;
  actorType?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string | null;
  description?: string | null;
  oldValue?: unknown;
  newValue: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  status?: string;
  createdAt: string;
}

export interface AdjustmentItem extends AuditLogFields {
  newValue: AdjustmentPayload;
}

export interface PromotionItem extends AuditLogFields {
  newValue: PromotionPayload;
}

export interface AdjustmentResult {
  employeeId: string;
  evaluationQuarters: number;
  sRatio: number;
  aRatio: number;
  adjustmentRate: number;
  totalRecords: number;
  period: string;
  auditLogId: string;
}

export interface AdjustmentApprovalResult {
  auditLogId: string;
  approved: boolean;
  newAuditLogId: string;
}

export interface PromotionResult {
  employeeId: string;
  aCount: number;
  sCount: number;
  requirementMet: boolean;
  lookbackYears: number;
  recordCount: number;
  proposedPosition: string;
  auditLogId: string;
}

export interface PipReview {
  id: string;
  reviewMonth: number;
  reviewDate: string;
  rating: PipReviewRating;
  comment: string | null;
  reviewerId: string;
  createdAt: string;
}

export interface Pip {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  status: PipStatus;
  reason: string;
  outcome: string | null;
  triggeredBy: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  reviews: PipReview[];
}

export interface ReviewPipResult {
  review: PipReview;
  pip: Pip;
}

export interface ProposeAdjustmentRequest {
  employeeId: string;
  period: string;
}

export interface ApproveAdjustmentRequest {
  approved: boolean;
  comment?: string;
}

export interface ProposePromotionRequest {
  employeeId: string;
  proposedPosition: string;
  lookbackYears?: number;
}

export interface TriggerPipRequest {
  employeeId: string;
  reason: string;
}

export interface ReviewPipRequest {
  rating: PipReviewRating;
  comment?: string;
}

export interface ListAdjustmentFilter {
  employeeId?: string;
  period?: string;
  page?: number;
  pageSize?: number;
}

export interface ListPromotionFilter {
  employeeId?: string;
  id?: string;
  page?: number;
  pageSize?: number;
}

export interface ListPipFilter {
  employeeId?: string;
  status?: PipStatus;
  page?: number;
  pageSize?: number;
}

export const PERFORMANCE_APPLICATION_PERIOD_PATTERN = /^\d{4}-Q[1-4]$/;

export const PIP_STATUS_MAP: Record<PipStatus, ApplicationTagInfo> = {
  active: { label: '进行中', type: 'warning' },
  completed: { label: '已完成', type: 'success' },
  failed: { label: '未通过', type: 'danger' },
  cancelled: { label: '已取消', type: 'info' },
};

export const PIP_RATING_MAP: Record<PipReviewRating, ApplicationTagInfo> = {
  improved: { label: '明显改善', type: 'success' },
  no_change: { label: '无明显变化', type: 'info' },
  worsened: { label: '继续恶化', type: 'danger' },
};

export const ADJUSTMENT_STATUS_MAP: Record<AdjustmentStatus, ApplicationTagInfo> = {
  proposed: { label: '待审批', type: 'warning' },
  approved: { label: '已批准', type: 'success' },
  rejected: { label: '已驳回', type: 'danger' },
};

export function rateToPercent(rate: string | number | null | undefined): number | null {
  if (rate == null || rate === '') return null;
  const value = typeof rate === 'number' ? rate : Number(rate);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10000) / 100;
}

export function rateLabel(rate: string | number | null | undefined): string {
  const percent = rateToPercent(rate);
  return percent == null ? '—' : `${percent}%`;
}

export function adjustmentStatusInfo(
  status: AdjustmentStatus | string | null | undefined,
): ApplicationTagInfo {
  if (!status) return { label: '—', type: 'info' };
  return ADJUSTMENT_STATUS_MAP[status as AdjustmentStatus] ?? { label: status, type: 'info' };
}

export function pipStatusInfo(status: PipStatus | string | null | undefined): ApplicationTagInfo {
  if (!status) return { label: '—', type: 'info' };
  return PIP_STATUS_MAP[status as PipStatus] ?? { label: status, type: 'info' };
}

export function pipRatingInfo(
  rating: PipReviewRating | string | null | undefined,
): ApplicationTagInfo {
  if (!rating) return { label: '—', type: 'info' };
  return PIP_RATING_MAP[rating as PipReviewRating] ?? { label: rating, type: 'info' };
}

export interface ApplicationScope {
  isEmployee: boolean;
  selfEmployeeId: string;
}

export function getApplicationScope(user: UserInfo | null): ApplicationScope {
  const isEmployee = Boolean(
    user && user.roles.includes('employee') && !user.permissions.includes('*'),
  );
  return {
    isEmployee,
    selfEmployeeId: user?.employee?.id ?? '',
  };
}
