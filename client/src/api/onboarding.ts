/**
 * 入职管理 API（M5-2-A2）
 * @module api/onboarding
 * @description 消费后端 /api/onboarding 5 端点（list / get / create / parse-ocr / confirm）
 * @ocr parseOcr JSON body { type, imageBase64 }（非 multipart），调 M0.5-5 OCR
 * @status draft → submitted → approved / cancelled
 */

import http from './http';
import type { PaginatedResponse } from './types';
import type {
  ConfirmOnboardingRequest,
  CreateOnboardingRequest,
  ListOnboardingFilter,
  Onboarding,
  ParseOcrRequest,
} from './types/organization';
import { unwrapData, unwrapPage } from './types/organization';

export const ONBOARDING_PATHS = {
  list: '/onboarding',
  item: (id: string) => `/onboarding/${id}`,
  parseOcr: (id: string) => `/onboarding/${id}/parse-ocr`,
  confirm: (id: string) => `/onboarding/${id}/confirm`,
} as const;

export async function listOnboardings(
  filter: ListOnboardingFilter = {},
): Promise<PaginatedResponse<Onboarding>> {
  return unwrapPage<Onboarding>(await http.get(ONBOARDING_PATHS.list, { params: filter }));
}

export async function getOnboarding(id: string): Promise<Onboarding> {
  return unwrapData<Onboarding>(await http.get(ONBOARDING_PATHS.item(id)));
}

export async function createOnboarding(data: CreateOnboardingRequest): Promise<Onboarding> {
  return unwrapData<Onboarding>(await http.post(ONBOARDING_PATHS.list, data));
}

export async function parseOcr(id: string, data: ParseOcrRequest): Promise<Onboarding> {
  return unwrapData<Onboarding>(await http.post(ONBOARDING_PATHS.parseOcr(id), data));
}

export async function confirmOnboarding(
  id: string,
  data: ConfirmOnboardingRequest = {},
): Promise<Onboarding> {
  return unwrapData<Onboarding>(await http.post(ONBOARDING_PATHS.confirm(id), data));
}
