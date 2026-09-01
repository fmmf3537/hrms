/**
 * 工资单 / ESS 工资条 API（M5-2-C2）
 * @module api/payslip
 * @description HR 走 /payrolls/payslips；ESS 走 /payslips/:id/payslip/* + deliver
 * @permission salary:payslip:read / write / generate（5 角色无 finance）
 */

import http from './http';
import type { PaginatedResponse } from './types';
import { unwrapData } from './types/organization';
import {
  unwrapSalaryPage,
  type DeliverPayslipResult,
  type GeneratePayslipResult,
  type Payslip,
  type PayslipDeliverRequest,
  type PayslipListQuery,
} from './types/payroll';

export const PAYSLIP_PATHS = {
  list: '/salary/payrolls/payslips',
  detail: (id: string) => `/salary/payrolls/payslips/${id}`,
  recalculate: (id: string) => `/salary/payrolls/payslips/${id}/recalculate`,
  generate: (id: string) => `/salary/payslips/${id}/payslip/generate`,
  html: (id: string) => `/salary/payslips/${id}/payslip/html`,
  pdf: (id: string) => `/salary/payslips/${id}/payslip/pdf`,
  deliver: (id: string) => `/salary/payslips/${id}/deliver`,
} as const;

/** GET /salary/payrolls/payslips · salary:payslip:read */
export async function listPayslips(
  query: PayslipListQuery = {},
): Promise<PaginatedResponse<Payslip>> {
  return unwrapSalaryPage<Payslip>(
    await http.get(PAYSLIP_PATHS.list, { params: query }),
  );
}

/** GET /salary/payrolls/payslips/:id · salary:payslip:read */
export async function getPayslip(id: string): Promise<Payslip> {
  return unwrapData<Payslip>(await http.get(PAYSLIP_PATHS.detail(id)));
}

/** POST /salary/payrolls/payslips/:id/recalculate · salary:payslip:write */
export async function recalculatePayslip(id: string): Promise<Payslip> {
  return unwrapData<Payslip>(await http.post(PAYSLIP_PATHS.recalculate(id)));
}

/** POST /salary/payslips/:id/payslip/generate · salary:payslip:generate */
export async function generatePayslip(id: string): Promise<GeneratePayslipResult> {
  return unwrapData<GeneratePayslipResult>(await http.post(PAYSLIP_PATHS.generate(id)));
}

/** GET /salary/payslips/:id/payslip/html · salary:payslip:generate */
export async function getPayslipHtml(id: string): Promise<string> {
  const data = unwrapData<{ html: string }>(await http.get(PAYSLIP_PATHS.html(id)));
  return data.html;
}

/** POST /salary/payslips/:id/deliver · salary:payslip:generate */
export async function deliverPayslip(
  id: string,
  body: PayslipDeliverRequest = {},
): Promise<DeliverPayslipResult> {
  return unwrapData<DeliverPayslipResult>(await http.post(PAYSLIP_PATHS.deliver(id), body));
}

/** GET /api/salary/payslips/:id/payslip/pdf · salary:payslip:generate · 二进制下载 */
export async function downloadPayslipPdf(
  id: string,
  fallbackName = 'payslip.pdf',
): Promise<void> {
  const blob = (await http.get(PAYSLIP_PATHS.pdf(id), {
    responseType: 'blob',
  })) as unknown as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackName;
  a.click();
  URL.revokeObjectURL(url);
}
