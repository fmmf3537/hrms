/**
 * 员工薪酬方案 API（M5-2-C1）
 * @module api/salaryPlan
 * @description 消费 /api/salary/plans 3 端点；停用为 PATCH /:id/deactivate
 * @permission salary:plan:read / salary:plan:write（5 角色无 finance）
 */

import http from './http';
import type { PaginatedResponse } from './types';
import { unwrapData } from './types/organization';
import {
  unwrapSalaryPage,
  type CreateSalaryPlanRequest,
  type DeactivatePlanRequest,
  type ListSalaryPlanFilter,
  type SalaryPlan,
} from './types/salary';

export const SALARY_PLAN_PATHS = {
  plans: '/salary/plans',
  deactivate: (id: string) => `/salary/plans/${id}/deactivate`,
} as const;

/** GET /salary/plans · salary:plan:read */
export async function listPlans(
  filter: ListSalaryPlanFilter = {},
): Promise<PaginatedResponse<SalaryPlan>> {
  return unwrapSalaryPage<SalaryPlan>(
    await http.get(SALARY_PLAN_PATHS.plans, { params: filter }),
  );
}

/** POST /salary/plans · salary:plan:write */
export async function createPlan(data: CreateSalaryPlanRequest): Promise<SalaryPlan> {
  return unwrapData<SalaryPlan>(await http.post(SALARY_PLAN_PATHS.plans, data));
}

/** PATCH /salary/plans/:id/deactivate · salary:plan:write */
export async function deactivatePlan(
  id: string,
  data: DeactivatePlanRequest,
): Promise<SalaryPlan> {
  return unwrapData<SalaryPlan>(await http.patch(SALARY_PLAN_PATHS.deactivate(id), data));
}
