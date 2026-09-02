import type { PaginatedResponse } from '@/api/types';
import http from './http';
import { unwrapData } from './types/organization';
import { unwrapPerformancePage } from './types/performance';
import type {
  AdjustmentApprovalResult,
  AdjustmentItem,
  AdjustmentResult,
  ApproveAdjustmentRequest,
  ListAdjustmentFilter,
  ListPipFilter,
  ListPromotionFilter,
  Pip,
  ProposeAdjustmentRequest,
  ProposePromotionRequest,
  PromotionItem,
  PromotionResult,
  ReviewPipRequest,
  ReviewPipResult,
  TriggerPipRequest,
} from './types/performanceApplication';

export const APPLICATION_PATHS = {
  adjustments: '/performance/applications/salary-adjustments',
  approveAdjustment: (id: string) => `${APPLICATION_PATHS.adjustments}/${id}/approve`,
  promotions: '/performance/applications/promotions',
  pips: '/performance/applications/pips',
  reviewPip: (id: string) => `${APPLICATION_PATHS.pips}/${id}/reviews`,
} as const;

export async function proposeAdjustment(body: ProposeAdjustmentRequest): Promise<AdjustmentResult> {
  return unwrapData<AdjustmentResult>(await http.post(APPLICATION_PATHS.adjustments, body));
}

export async function listAdjustments(
  filter: ListAdjustmentFilter = {},
): Promise<PaginatedResponse<AdjustmentItem>> {
  return unwrapPerformancePage<AdjustmentItem>(
    await http.get(APPLICATION_PATHS.adjustments, { params: filter }),
  );
}

export async function approveAdjustment(
  id: string,
  approved: boolean,
  comment?: string,
): Promise<AdjustmentApprovalResult> {
  const body: ApproveAdjustmentRequest = { approved };
  if (comment?.trim()) body.comment = comment.trim();
  return unwrapData<AdjustmentApprovalResult>(
    await http.patch(APPLICATION_PATHS.approveAdjustment(id), body),
  );
}

export async function proposePromotion(body: ProposePromotionRequest): Promise<PromotionResult> {
  return unwrapData<PromotionResult>(await http.post(APPLICATION_PATHS.promotions, body));
}

export async function listPromotions(
  filter: ListPromotionFilter = {},
): Promise<PaginatedResponse<PromotionItem>> {
  return unwrapPerformancePage<PromotionItem>(
    await http.get(APPLICATION_PATHS.promotions, { params: filter }),
  );
}

export async function triggerPip(body: TriggerPipRequest): Promise<Pip> {
  return unwrapData<Pip>(await http.post(APPLICATION_PATHS.pips, body));
}

export async function listPips(filter: ListPipFilter = {}): Promise<PaginatedResponse<Pip>> {
  return unwrapPerformancePage<Pip>(await http.get(APPLICATION_PATHS.pips, { params: filter }));
}

export async function reviewPip(
  id: string,
  rating: ReviewPipRequest['rating'],
  comment?: string,
): Promise<ReviewPipResult> {
  const body: ReviewPipRequest = { rating };
  if (comment?.trim()) body.comment = comment.trim();
  return unwrapData<ReviewPipResult>(await http.post(APPLICATION_PATHS.reviewPip(id), body));
}
