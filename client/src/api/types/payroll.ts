/**
 * 算薪 Run / 工资单 API 类型（M5-2-C2）
 * @module api/types/payroll
 * @description 对齐 Prisma PayrollRun / Payslip / PayslipItem；分页复用 unwrapSalaryPage
 * 金额为 Decimal JSON（string | number）；Run 表无 deptIds 字段
 */

import type { UserInfo } from '@/api/types';
import { hasPermission } from '@/utils/permission';

export { unwrapSalaryPage } from './salary';

export type PayrollTagType = 'success' | 'warning' | 'info' | 'danger' | 'primary';

/** V1.2 §四.8 C4 算薪批次状态 */
export type PayrollRunStatus =
  | 'draft'
  | 'submitted'
  | 'reviewed'
  | 'approved'
  | 'locked'
  | 'cancelled';

/** V1.2 §四.8 C4 工资单状态 */
export type PayslipStatus = 'calculated' | 'approved' | 'locked';

/** Prisma PayslipItemType，前缀 earning_ 应发 / deduction_ 应扣 */
export type PayslipItemType =
  | 'earning_base'
  | 'earning_performance'
  | 'earning_overtime'
  | 'earning_allowance'
  | 'earning_commission'
  | 'earning_bonus'
  | 'deduction_social'
  | 'deduction_housing'
  | 'deduction_tax'
  | 'deduction_absence';

export const PAYROLL_RUN_STATUS_LABELS: Record<PayrollRunStatus, string> = {
  draft: '草稿',
  submitted: '已提交',
  reviewed: '已复核',
  approved: '已审批',
  locked: '已锁定',
  cancelled: '已作废',
};

export const PAYSLIP_STATUS_LABELS: Record<PayslipStatus, string> = {
  calculated: '已计算',
  approved: '已审批',
  locked: '已锁定',
};

export function payrollRunStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '—';
  }
  return PAYROLL_RUN_STATUS_LABELS[status as PayrollRunStatus] ?? status;
}

export function payrollRunTagType(status: string | null | undefined): PayrollTagType {
  if (status === 'approved') {
    return 'success';
  }
  if (status === 'submitted') {
    return 'warning';
  }
  if (status === 'reviewed') {
    return 'primary';
  }
  if (status === 'locked') {
    return 'danger';
  }
  return 'info';
}

export function payslipStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '—';
  }
  return PAYSLIP_STATUS_LABELS[status as PayslipStatus] ?? status;
}

export function payslipTagType(status: string | null | undefined): PayrollTagType {
  if (status === 'approved') {
    return 'success';
  }
  if (status === 'calculated') {
    return 'warning';
  }
  if (status === 'locked') {
    return 'danger';
  }
  return 'info';
}

export function isEarningItemType(itemType: string): boolean {
  return itemType.startsWith('earning_');
}

export type PayrollRunAction =
  | 'submit'
  | 'review'
  | 'reject'
  | 'approve'
  | 'ai-summary'
  | 'lock'
  | 'banking-export'
  | 'tax-declare'
  | 'report-export';

const ACTION_PERMISSION: Record<PayrollRunAction, string> = {
  submit: 'salary:payroll-run:write',
  review: 'salary:payroll-run:approve',
  reject: 'salary:payroll-run:approve',
  approve: 'salary:payroll-run:approve',
  'ai-summary': 'salary:payroll-run:write',
  lock: 'salary:payroll-run:approve',
  'banking-export': 'salary:banking:export',
  'tax-declare': 'salary:tax:declare',
  'report-export': 'salary:report:export',
};

const ACTION_STATUSES: Record<PayrollRunAction, readonly string[]> = {
  submit: ['draft'],
  review: ['submitted'],
  reject: ['submitted'],
  approve: ['reviewed'],
  'ai-summary': ['submitted', 'reviewed', 'approved'],
  lock: ['approved'],
  'banking-export': ['approved', 'locked'],
  'tax-declare': ['approved', 'locked'],
  'report-export': ['approved', 'locked'],
};

/** 状态 × 权限双维显隐（PayrollRunDetail） */
export function canPayrollRunAction(
  action: PayrollRunAction,
  run: { status: string },
  user: UserInfo | null,
): boolean {
  if (!ACTION_STATUSES[action].includes(run.status)) {
    return false;
  }
  return hasPermission(user, ACTION_PERMISSION[action]);
}

export interface PayslipItem {
  id: string;
  payslipId: string;
  itemType: PayslipItemType | string;
  itemName: string;
  amount: string | number;
  description?: string | null;
  createdAt: string;
}

export interface Payslip {
  id: string;
  runId: string;
  employeeId: string;
  period: string;
  baseAmount: string | number;
  performanceAmount: string | number;
  overtimeAmount: string | number;
  allowanceAmount: string | number;
  salesCommissionAmount: string | number;
  yearEndBonusAmount: string | number;
  grossAmount: string | number;
  socialInsuranceAmount: string | number;
  housingFundAmount: string | number;
  taxAmount: string | number;
  absenceAmount: string | number;
  deductionAmount: string | number;
  netAmount: string | number;
  status: PayslipStatus | string;
  calculatedAt: string;
  recalculateCount: number;
  createdAt: string;
  updatedAt: string;
  items?: PayslipItem[];
  employee?: { departmentId?: string | null };
}

export interface PayrollRun {
  id: string;
  period: string;
  status: PayrollRunStatus | string;
  totalGross: string | number;
  totalNet: string | number;
  anomalyCount: number;
  remark?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  submittedById?: string | null;
  reviewedAt?: string | null;
  reviewedById?: string | null;
  approvedAt?: string | null;
  approvedById?: string | null;
  locked: boolean;
  lockedAt?: string | null;
  payslips?: Payslip[];
}

export interface CreatePayrollRunRequest {
  period: string;
  deptIds?: string[];
  remark?: string;
}

export interface CreatePayrollRunResult {
  run: PayrollRun;
  payslipCount: number;
}

export interface PayrollRunListQuery {
  period?: string;
  status?: PayrollRunStatus;
  page?: number;
  pageSize?: number;
}

export interface ReviewPayrollRunRequest {
  comment?: string;
}

export interface RejectPayrollRunRequest {
  reason: string;
}

export interface PayslipListQuery {
  runId?: string;
  employeeId?: string;
  period?: string;
  status?: PayslipStatus;
  page?: number;
  pageSize?: number;
}

export type BankingExportFormat = 'icbc' | 'ccb' | 'cmb';

export interface BankingExportResult {
  runId: string;
  format: BankingExportFormat;
  filePath: string;
  content: string;
  recordCount: number;
  totalAmount: number;
  mockMode: true;
}

export interface TaxDeclareRequest {
  period: string;
}

export interface TaxLedgerRow {
  employeeId: string;
  period: string;
  taxableIncome: number;
  taxAmount: number;
  rate: number;
  quickDeduction: number;
}

export interface TaxDeclarationResult {
  runId: string;
  period: string;
  totalTaxableIncome: number;
  totalTax: number;
  recordCount: number;
  ledger: TaxLedgerRow[];
  mockMode: true;
}

export type ReportExportFormat = 'excel' | 'pdf';

export interface ReportExportResult {
  runId: string;
  format: ReportExportFormat;
  filePath: string;
  content: string;
  totalGross: number;
  totalNet: number;
  mockMode: true;
}

export interface AiSummaryResult {
  runId: string;
  summary: string;
  cost: number;
  tokens: number;
  durationMs: number;
  modelName: string;
  isAnomaly: boolean;
  highlights: string[];
}

export interface GeneratePayslipResult {
  payslipId: string;
  employeeId: string;
  period: string;
  html: string;
  pdf: string;
  fileName: string;
  generatedAt: string;
}

export interface PayslipDeliverRequest {
  methods?: Array<'email' | 'system'>;
}

export interface DeliverPayslipResult {
  payslipId: string;
  deliveredAt: string;
  emailStatus: string;
  systemStatus: string;
  methods: string[];
}
