/**
 * 出差管理 API（M5-2-B）
 * @module api/businessTrip
 * @description 消费 /api/business-trips 3 端点（连字符）；**没有 GET /:id**
 */

import http from './http';
import type { PaginatedResponse } from './types';
import type {
  BusinessTrip,
  CancelReasonBody,
  CreateBusinessTripRequest,
  ListBusinessTripFilter,
} from './types/attendance';
import { unwrapData, unwrapPage } from './types/organization';

export const BUSINESS_TRIP_PATHS = {
  requests: '/business-trips/requests',
  cancel: (id: string) => `/business-trips/requests/${id}/cancel`,
} as const;

export async function createBusinessTrip(
  data: CreateBusinessTripRequest,
): Promise<BusinessTrip> {
  return unwrapData<BusinessTrip>(await http.post(BUSINESS_TRIP_PATHS.requests, data));
}

export async function listBusinessTrips(
  filter: ListBusinessTripFilter = {},
): Promise<PaginatedResponse<BusinessTrip>> {
  return unwrapPage<BusinessTrip>(
    await http.get(BUSINESS_TRIP_PATHS.requests, { params: filter }),
  );
}

export async function cancelBusinessTrip(
  id: string,
  data: CancelReasonBody,
): Promise<BusinessTrip> {
  return unwrapData<BusinessTrip>(await http.post(BUSINESS_TRIP_PATHS.cancel(id), data));
}
