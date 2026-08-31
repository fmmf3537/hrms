/**
 * 合同管理 API（M5-2-A2）
 * @module api/contract
 * @description 消费后端 /api/contracts 6 端点
 * @type formal / intern / consultant / labor / nda
 * @status draft / pending_signature / signing / signed / expired / cancelled
 * @esign handleESignWebhook 调 mock webhook（真实 e-签宝 SaaS 留二期）
 * @note update 走 POST /:id/update（不是 PUT）
 */

import http from './http';
import type { PaginatedResponse } from './types';
import type {
  CancelReasonRequest,
  CreateContractRequest,
  ESignWebhookPayload,
  ListContractFilter,
  Contract,
  UpdateContractRequest,
} from './types/organization';
import { unwrapData, unwrapPage } from './types/organization';

export const CONTRACT_PATHS = {
  webhook: '/contracts/webhook/e-sign',
  list: '/contracts',
  item: (id: string) => `/contracts/${id}`,
  update: (id: string) => `/contracts/${id}/update`,
  cancel: (id: string) => `/contracts/${id}/cancel`,
} as const;

export async function listContracts(
  filter: ListContractFilter = {},
): Promise<PaginatedResponse<Contract>> {
  return unwrapPage<Contract>(await http.get(CONTRACT_PATHS.list, { params: filter }));
}

export async function getContract(id: string): Promise<Contract> {
  return unwrapData<Contract>(await http.get(CONTRACT_PATHS.item(id)));
}

export async function createContract(data: CreateContractRequest): Promise<Contract> {
  return unwrapData<Contract>(await http.post(CONTRACT_PATHS.list, data));
}

export async function updateContract(
  id: string,
  data: UpdateContractRequest,
): Promise<Contract> {
  return unwrapData<Contract>(await http.post(CONTRACT_PATHS.update(id), data));
}

export async function cancelContract(
  id: string,
  data: CancelReasonRequest,
): Promise<Contract> {
  return unwrapData<Contract>(await http.post(CONTRACT_PATHS.cancel(id), data));
}

/**
 * e-签宝 webhook（通常服务端对服务端；前端仅消费 mock，供联调/单测）
 */
export async function handleESignWebhook(payload: ESignWebhookPayload): Promise<void> {
  await http.post(CONTRACT_PATHS.webhook, payload);
}
