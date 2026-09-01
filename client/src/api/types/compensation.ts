/**
 * 提成 / 成本预警 / 调薪 API 类型（M5-2-C3）
 * @module api/types/compensation
 * @description 对齐 Prisma CommissionSettlement / HrCostAlert / SalaryAdjustment
 * 分页复用 unwrapSalaryPage；金额 Decimal JSON 为 string | number
 */

import type { UserInfo } from '@/api/types';
import { hasPermission } from '@/utils/permission';

export { unwrapSalaryPage } from './salary';

export type CompensationTagType = 'success' | 'warning' | 'info' | 'danger' | 'primary';

export type CommissionGroupBy = 'employee' | 'department' | 'product' | 'report';

export type SettlementStatus = 'draft' | 'pending_confirm' | 'confirmed' | 'cancelled';

export type CostAlertType = 'overtime_ratio' | 'attrition_monthly';

export type CostAlertStatus = 'active' | 'acknowledged' | 'closed';

export type CostAlertSeverity = 'warning' | 'critical';

export type AdjustmentType =
  | 'promotion'
  | 'annual_adjust'
  | 'performance'
  | 'market_adjustment';

export type AdjustmentStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  draft: '草稿',
  pending_confirm: '待确认',
  confirmed: '已确认',
  cancelled: '已作废',
};

export const COST_ALERT_STATUS_LABELS: Record<CostAlertStatus, string> = {
  active: '待处理',
  acknowledged: '已确认',
  closed: '已关闭',
};

export const COST_ALERT_TYPE_LABELS: Record<CostAlertType, string> = {
  overtime_ratio: '加班费占比',
  attrition_monthly: '月度离职率',
};

export const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
  promotion: '晋升',
  annual_adjust: '年度普调',
  performance: '绩效调薪',
  market_adjustment: '市场对标',
};

export const ADJUSTMENT_STATUS_LABELS: Record<AdjustmentStatus, string> = {
  draft: '草稿',
  pending: '待审批',
  approved: '已通过',
  rejected: '已驳回',
  executed: '已执行',
  cancelled: '已作废',
};

export function settlementStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '—';
  }
  return SETTLEMENT_STATUS_LABELS[status as SettlementStatus] ?? status;
}

export function settlementTagType(status: string | null | undefined): CompensationTagType {
  if (status === 'confirmed') {
    return 'success';
  }
  if (status === 'pending_confirm') {
    return 'warning';
  }
  if (status === 'cancelled') {
    return 'danger';
  }
  return 'info';
}

export function costAlertStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '—';
  }
  return COST_ALERT_STATUS_LABELS[status as CostAlertStatus] ?? status;
}

export function costAlertTagType(status: string | null | undefined): CompensationTagType {
  if (status === 'closed') {
    return 'info';
  }
  if (status === 'acknowledged') {
    return 'success';
  }
  return 'warning';
}

export function costAlertSeverityTag(severity: string | null | undefined): CompensationTagType {
  return severity === 'critical' ? 'danger' : 'warning';
}

export function adjustmentStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '—';
  }
  return ADJUSTMENT_STATUS_LABELS[status as AdjustmentStatus] ?? status;
}

export function adjustmentTagType(status: string | null | undefined): CompensationTagType {
  if (status === 'approved' || status === 'executed') {
    return 'success';
  }
  if (status === 'pending') {
    return 'warning';
  }
  if (status === 'rejected' || status === 'cancelled') {
    return 'danger';
  }
  return 'info';
}

export type SettlementAction = 'confirm' | 'cancel';

export function canSettlementAction(
  action: SettlementAction,
  settlement: { status: string },
  user: UserInfo | null,
): boolean {
  if (action === 'confirm') {
    return (
      settlement.status === 'pending_confirm' &&
      hasPermission(user, 'salary:commission:confirm')
    );
  }
  return (
    (settlement.status === 'draft' || settlement.status === 'pending_confirm') &&
    hasPermission(user, 'salary:commission:cancel')
  );
}

export type CostAlertAction = 'acknowledge' | 'close';

export function canCostAlertAction(
  action: CostAlertAction,
  alert: { status: string },
  user: UserInfo | null,
): boolean {
  if (action === 'acknowledge') {
    return alert.status === 'active' && hasPermission(user, 'salary:cost-alert:ack');
  }
  return alert.status === 'acknowledged' && hasPermission(user, 'salary:cost-alert:close');
}

export type AdjustmentAction = 'submit' | 'approve' | 'execute' | 'cancel';

export function canAdjustmentAction(
  action: AdjustmentAction,
  adjustment: { status: string },
  user: UserInfo | null,
): boolean {
  if (action === 'submit') {
    return adjustment.status === 'draft' && hasPermission(user, 'salary:adjustment:write');
  }
  if (action === 'approve') {
    return adjustment.status === 'pending' && hasPermission(user, 'salary:adjustment:approve');
  }
  if (action === 'execute') {
    return adjustment.status === 'approved' && hasPermission(user, 'salary:adjustment:execute');
  }
  return (
    (adjustment.status === 'draft' || adjustment.status === 'pending') &&
    hasPermission(user, 'salary:adjustment:cancel')
  );
}

export interface CommissionSummaryItem {
  key: string;
  label?: string;
  employeeId?: string;
  employeeName?: string;
  departmentId?: string;
  departmentName?: string;
  employeeCount?: number;
  productId?: string;
  productCode?: string;
  productName?: string;
  category?: string;
  totalAmount: number;
  totalBaseAmount?: number;
  productCount?: number;
  recordCount: number;
  periods?: string[];
}

export interface CommissionSummaryResult {
  groupBy: string;
  period?: string;
  quarter?: string;
  totalAmount: number;
  items: CommissionSummaryItem[];
  filter?: { period?: string; quarter?: string };
  summary?: Record<string, number | string[]>;
  mockMode?: boolean;
}

export interface CommissionQuery {
  groupBy?: CommissionGroupBy;
  period?: string;
  quarter?: string;
}

export interface CommissionEmployeeSummary {
  employeeId: string;
  employeeName: string;
  departmentId: string | null;
  departmentName: string | null;
  totalAmount: number;
  recordCount: number;
  items: Array<{
    commissionId: string;
    period: string;
    productName: string;
    baseAmount: number;
    commissionRate: number;
    finalAmount: number;
  }>;
}

export interface CommissionDepartmentSummary {
  departmentId: string;
  departmentName: string;
  employeeCount: number;
  totalAmount: number;
  recordCount: number;
  items: Array<{
    employeeId: string;
    employeeName: string;
    totalAmount: number;
    recordCount: number;
  }>;
}

export interface Settlement {
  id: string;
  year: number;
  quarter: number;
  status: SettlementStatus | string;
  totalAmount: string | number;
  recordCount: number;
  employeeCount: number;
  productCount: number;
  periodStart: string;
  periodEnd: string;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  remark?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  commissionCount?: number;
}

export interface SettlementListQuery {
  year?: number;
  status?: SettlementStatus;
  periodStart?: string;
  periodEnd?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateSettlementRequest {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  initialStatus?: 'draft' | 'pending_confirm';
}

export interface CostAlert {
  id: string;
  alertType: CostAlertType | string;
  period: string;
  departmentId?: string | null;
  threshold: string | number;
  actualValue: string | number;
  severity: CostAlertSeverity | string;
  status: CostAlertStatus | string;
  scanAt: string;
  contextSnapshot?: Record<string, unknown> | null;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  acknowledgeNote?: string | null;
  closedBy?: string | null;
  closedAt?: string | null;
  closeReason?: string | null;
  remark?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CostAlertSummary {
  period: string;
  total: number;
  byAlertType: Record<string, { count: number; percentage: number }>;
  bySeverity: Record<string, { count: number; percentage: number }>;
  byStatus: Record<string, { count: number; percentage: number }>;
}

export interface CostAlertListQuery {
  alertType?: CostAlertType;
  period?: string;
  status?: CostAlertStatus;
  severity?: CostAlertSeverity;
  departmentId?: string;
  page?: number;
  pageSize?: number;
}

export interface ScanCostAlertsRequest {
  period: string;
  alertType?: 'overtime_ratio' | 'attrition_monthly' | 'all';
}

export interface ScanCostAlertsResult {
  period: string;
  alertCount: number;
  overtime?: { alertCount?: number } | null;
  attrition?: { alertCount?: number } | null;
}

export interface Adjustment {
  id: string;
  employeeId: string;
  adjustmentType: AdjustmentType | string;
  fromBaseSalary: string | number;
  fromPerformanceSalary?: string | number | null;
  toBaseSalary: string | number;
  toPerformanceSalary?: string | number | null;
  delta: string | number;
  effectiveDate: string;
  reason: string;
  remark?: string | null;
  approvalInstanceId?: string | null;
  status: AdjustmentStatus | string;
  executedAt?: string | null;
  executedBy?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancelReason?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdjustmentListQuery {
  employeeId?: string;
  status?: AdjustmentStatus;
  adjustmentType?: AdjustmentType;
  period?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateAdjustmentRequest {
  employeeId: string;
  adjustmentType: AdjustmentType;
  toBaseSalary: number;
  toPerformanceSalary?: number;
  effectiveDate: string;
  reason: string;
  remark?: string;
}

export interface ApproveAdjustmentRequest {
  action: 'approve' | 'reject';
  comment?: string;
}

export interface BatchExecuteResult {
  asOfDate: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  results: Array<{ adjustmentId: string; status: 'success' | 'failed'; error?: string }>;
}
