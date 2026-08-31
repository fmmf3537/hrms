/**
 * 转正管理 API（M5-2-A2）
 * @module api/regularization
 * @description 消费后端 /api/regularizations 4 端点（list / get / create / cancel）
 * @status draft / submitted / approved / rejected / cancelled
 */

import http from './http';
import type { PaginatedResponse } from './types';
import type {
  CancelReasonRequest,
  CreateRegularizationRequest,
  ListRegularizationFilter,
  Regularization,
} from './types/organization';
import { unwrapData, unwrapPage } from './types/organization';

export const REGULARIZATION_PATHS = {
  list: '/regularizations',
  item: (id: string) => `/regularizations/${id}`,
  cancel: (id: string) => `/regularizations/${id}/cancel`,
} as const;

export async function listRegularizations(
  filter: ListRegularizationFilter = {},
): Promise<PaginatedResponse<Regularization>> {
  return unwrapPage<Regularization>(
    await http.get(REGULARIZATION_PATHS.list, { params: filter }),
  );
}

export async function getRegularization(id: string): Promise<Regularization> {
  return unwrapData<Regularization>(await http.get(REGULARIZATION_PATHS.item(id)));
}

export async function createRegularization(
  data: CreateRegularizationRequest,
): Promise<Regularization> {
  return unwrapData<Regularization>(await http.post(REGULARIZATION_PATHS.list, data));
}

export async function cancelRegularization(
  id: string,
  data: CancelReasonRequest,
): Promise<Regularization> {
  return unwrapData<Regularization>(await http.post(REGULARIZATION_PATHS.cancel(id), data));
}
