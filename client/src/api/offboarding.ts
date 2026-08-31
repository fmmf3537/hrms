/**
 * 离职管理 API（M5-2-A2）
 * @module api/offboarding
 * @description 消费后端 /api/offboarding 6 端点
 * @status 7 状态：draft / handover_pending / submitted / approved / certificate_issued / rejected / cancelled
 * @certificate issueCertificate 无请求体，后端生成 mock 证明（真实 PDF 留二期）
 */

import http from './http';
import type { PaginatedResponse } from './types';
import type {
  CancelReasonRequest,
  CreateOffboardingRequest,
  ListOffboardingFilter,
  Offboarding,
} from './types/organization';
import { unwrapData, unwrapPage } from './types/organization';

export const OFFBOARDING_PATHS = {
  list: '/offboarding',
  item: (id: string) => `/offboarding/${id}`,
  confirmHandover: (id: string) => `/offboarding/${id}/confirm-handover`,
  cancel: (id: string) => `/offboarding/${id}/cancel`,
  issueCertificate: (id: string) => `/offboarding/${id}/issue-certificate`,
} as const;

export async function listOffboardings(
  filter: ListOffboardingFilter = {},
): Promise<PaginatedResponse<Offboarding>> {
  return unwrapPage<Offboarding>(await http.get(OFFBOARDING_PATHS.list, { params: filter }));
}

export async function getOffboarding(id: string): Promise<Offboarding> {
  return unwrapData<Offboarding>(await http.get(OFFBOARDING_PATHS.item(id)));
}

export async function createOffboarding(data: CreateOffboardingRequest): Promise<Offboarding> {
  return unwrapData<Offboarding>(await http.post(OFFBOARDING_PATHS.list, data));
}

export async function confirmHandover(id: string): Promise<Offboarding> {
  return unwrapData<Offboarding>(await http.post(OFFBOARDING_PATHS.confirmHandover(id)));
}

export async function cancelOffboarding(
  id: string,
  data: CancelReasonRequest,
): Promise<Offboarding> {
  return unwrapData<Offboarding>(await http.post(OFFBOARDING_PATHS.cancel(id), data));
}

export async function issueCertificate(id: string): Promise<Offboarding> {
  return unwrapData<Offboarding>(await http.post(OFFBOARDING_PATHS.issueCertificate(id)));
}
