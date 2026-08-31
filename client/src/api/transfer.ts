/**
 * 调动管理 API（M5-2-A2）
 * @module api/transfer
 * @description 消费后端 /api/transfers 5 端点（list / get / create / update / cancel）
 * @note update 走 POST /:id/update（不是 PUT）
 * @status draft / submitted / approved / rejected / cancelled
 * @type transfer / promote / demote
 */

import http from './http';
import type { PaginatedResponse } from './types';
import type {
  CancelReasonRequest,
  CreateTransferRequest,
  ListTransferFilter,
  Transfer,
  UpdateTransferRequest,
} from './types/organization';
import { unwrapData, unwrapPage } from './types/organization';

export const TRANSFER_PATHS = {
  list: '/transfers',
  item: (id: string) => `/transfers/${id}`,
  update: (id: string) => `/transfers/${id}/update`,
  cancel: (id: string) => `/transfers/${id}/cancel`,
} as const;

export async function listTransfers(
  filter: ListTransferFilter = {},
): Promise<PaginatedResponse<Transfer>> {
  return unwrapPage<Transfer>(await http.get(TRANSFER_PATHS.list, { params: filter }));
}

export async function getTransfer(id: string): Promise<Transfer> {
  return unwrapData<Transfer>(await http.get(TRANSFER_PATHS.item(id)));
}

export async function createTransfer(data: CreateTransferRequest): Promise<Transfer> {
  return unwrapData<Transfer>(await http.post(TRANSFER_PATHS.list, data));
}

export async function updateTransfer(
  id: string,
  data: UpdateTransferRequest,
): Promise<Transfer> {
  return unwrapData<Transfer>(await http.post(TRANSFER_PATHS.update(id), data));
}

export async function cancelTransfer(
  id: string,
  data: CancelReasonRequest,
): Promise<Transfer> {
  return unwrapData<Transfer>(await http.post(TRANSFER_PATHS.cancel(id), data));
}
