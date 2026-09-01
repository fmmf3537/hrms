/**
 * 算薪 Run API（M5-2-C2）
 * @module api/payroll
 * @description 消费 /api/salary/payrolls/runs 9 状态机 + 3 类导出；0 新增后端端点
 * @permission salary:payroll-run:* / salary:banking:export / salary:tax:declare / salary:report:export（5 角色无 finance）
 */

import http from './http';
import type { PaginatedResponse } from './types';
import { unwrapData } from './types/organization';
import {
  unwrapSalaryPage,
  type AiSummaryResult,
  type BankingExportFormat,
  type BankingExportResult,
  type CreatePayrollRunRequest,
  type CreatePayrollRunResult,
  type PayrollRun,
  type PayrollRunListQuery,
  type RejectPayrollRunRequest,
  type ReportExportFormat,
  type ReportExportResult,
  type ReviewPayrollRunRequest,
  type TaxDeclarationResult,
} from './types/payroll';

export const PAYROLL_PATHS = {
  runs: '/salary/payrolls/runs',
  run: (id: string) => `/salary/payrolls/runs/${id}`,
  submit: (id: string) => `/salary/payrolls/runs/${id}/submit`,
  review: (id: string) => `/salary/payrolls/runs/${id}/review`,
  reject: (id: string) => `/salary/payrolls/runs/${id}/reject`,
  approve: (id: string) => `/salary/payrolls/runs/${id}/approve`,
  aiSummary: (id: string) => `/salary/payrolls/runs/${id}/ai-summary`,
  lock: (id: string) => `/salary/payrolls/runs/${id}/lock`,
  bankingExport: (id: string) => `/salary/payrolls/runs/${id}/banking-export`,
  taxDeclare: (id: string) => `/salary/payrolls/runs/${id}/tax-declare`,
  reportExport: (id: string) => `/salary/payrolls/runs/${id}/report-export`,
} as const;

function triggerTextDownload(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function fileNameFromPath(filePath: string, fallback: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || fallback;
}

/** POST /salary/payrolls/runs · salary:payroll-run:write */
export async function createPayrollRun(
  body: CreatePayrollRunRequest,
): Promise<CreatePayrollRunResult> {
  return unwrapData<CreatePayrollRunResult>(await http.post(PAYROLL_PATHS.runs, body));
}

/** GET /salary/payrolls/runs · salary:payroll-run:read */
export async function listPayrollRuns(
  query: PayrollRunListQuery = {},
): Promise<PaginatedResponse<PayrollRun>> {
  return unwrapSalaryPage<PayrollRun>(
    await http.get(PAYROLL_PATHS.runs, { params: query }),
  );
}

/** GET /salary/payrolls/runs/:id · salary:payroll-run:read */
export async function getPayrollRun(id: string): Promise<PayrollRun> {
  return unwrapData<PayrollRun>(await http.get(PAYROLL_PATHS.run(id)));
}

/** POST /salary/payrolls/runs/:id/submit · salary:payroll-run:write */
export async function submitPayrollRun(id: string): Promise<PayrollRun> {
  return unwrapData<PayrollRun>(await http.post(PAYROLL_PATHS.submit(id)));
}

/** POST /salary/payrolls/runs/:id/review · salary:payroll-run:approve */
export async function reviewPayrollRun(
  id: string,
  body: ReviewPayrollRunRequest = {},
): Promise<PayrollRun> {
  return unwrapData<PayrollRun>(await http.post(PAYROLL_PATHS.review(id), body));
}

/** POST /salary/payrolls/runs/:id/reject · salary:payroll-run:approve */
export async function rejectPayrollRun(
  id: string,
  body: RejectPayrollRunRequest,
): Promise<PayrollRun> {
  return unwrapData<PayrollRun>(await http.post(PAYROLL_PATHS.reject(id), body));
}

/** POST /salary/payrolls/runs/:id/approve · salary:payroll-run:approve */
export async function approvePayrollRun(id: string): Promise<PayrollRun> {
  return unwrapData<PayrollRun>(await http.post(PAYROLL_PATHS.approve(id)));
}

/** POST /salary/payrolls/runs/:id/ai-summary · salary:payroll-run:write */
export async function requestAiSummary(id: string): Promise<AiSummaryResult> {
  return unwrapData<AiSummaryResult>(await http.post(PAYROLL_PATHS.aiSummary(id)));
}

/** POST /salary/payrolls/runs/:id/lock · salary:payroll-run:approve */
export async function lockPayrollRun(id: string): Promise<PayrollRun> {
  return unwrapData<PayrollRun>(await http.post(PAYROLL_PATHS.lock(id)));
}

/** POST /salary/payrolls/runs/:id/banking-export · salary:banking:export */
export async function exportBankingFile(
  id: string,
  format: BankingExportFormat,
): Promise<BankingExportResult> {
  const data = unwrapData<BankingExportResult>(
    await http.post(PAYROLL_PATHS.bankingExport(id), { format }),
  );
  triggerTextDownload(data.content, fileNameFromPath(data.filePath, `banking-${format}.txt`));
  return data;
}

/** POST /salary/payrolls/runs/:id/tax-declare · salary:tax:declare */
export async function declareTax(id: string, period: string): Promise<TaxDeclarationResult> {
  return unwrapData<TaxDeclarationResult>(
    await http.post(PAYROLL_PATHS.taxDeclare(id), { period }),
  );
}

/** POST /salary/payrolls/runs/:id/report-export · salary:report:export */
export async function exportReport(
  id: string,
  format: ReportExportFormat,
): Promise<ReportExportResult> {
  const data = unwrapData<ReportExportResult>(
    await http.post(PAYROLL_PATHS.reportExport(id), { format }),
  );
  const ext = format === 'excel' ? 'xlsx' : 'pdf';
  triggerTextDownload(data.content, fileNameFromPath(data.filePath, `report.${ext}`));
  return data;
}
