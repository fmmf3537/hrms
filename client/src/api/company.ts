/**
 * 法人公司 API（M5-2-A1）
 * @module api/company
 * @description 消费 GET/POST/PUT/DELETE /companies + statistics + headcount-warning（共 7 端点）
 * 暂停/恢复走 PUT status（后端无 /suspend /reactivate）
 */

import http from './http';
import type { PaginatedResponse } from './types';
import type {
  Company,
  CompanyStatistics,
  CreateCompanyRequest,
  ListCompanyFilter,
  UpdateCompanyRequest,
} from './types/organization';
import { unwrapData, unwrapPage } from './types/organization';

export const COMPANY_PATHS = {
  list: '/companies',
  item: (id: string) => `/companies/${id}`,
  statistics: (id: string) => `/companies/${id}/statistics`,
  headcountWarning: (id: string) => `/companies/${id}/headcount-warning`,
} as const;

export async function listCompanies(
  filter: ListCompanyFilter = {},
): Promise<PaginatedResponse<Company>> {
  return unwrapPage<Company>(await http.get(COMPANY_PATHS.list, { params: filter }));
}

export async function getCompany(id: string): Promise<Company> {
  return unwrapData<Company>(await http.get(COMPANY_PATHS.item(id)));
}

export async function createCompany(data: CreateCompanyRequest): Promise<Company> {
  return unwrapData<Company>(await http.post(COMPANY_PATHS.list, data));
}

export async function updateCompany(id: string, data: UpdateCompanyRequest): Promise<Company> {
  return unwrapData<Company>(await http.put(COMPANY_PATHS.item(id), data));
}

export async function deleteCompany(id: string): Promise<void> {
  await http.delete(COMPANY_PATHS.item(id));
}

export async function getCompanyStatistics(id: string): Promise<CompanyStatistics> {
  return unwrapData<CompanyStatistics>(await http.get(COMPANY_PATHS.statistics(id)));
}

export async function getCompanyHeadcountWarning(id: string): Promise<unknown> {
  return unwrapData<unknown>(await http.get(COMPANY_PATHS.headcountWarning(id)));
}

/** UI 便捷：PUT status=suspended */
export async function suspendCompany(id: string): Promise<Company> {
  return updateCompany(id, { status: 'suspended' });
}

/** UI 便捷：PUT status=active */
export async function reactivateCompany(id: string): Promise<Company> {
  return updateCompany(id, { status: 'active' });
}
