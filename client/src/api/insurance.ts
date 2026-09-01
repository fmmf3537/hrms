/**
 * 社保公积金 API（M5-2-C1）
 * @module api/insurance
 * @description 消费 social / housing-fund / employees 各 POST+GET+PATCH，共 9 端点
 * @permission salary:insurance:* / salary:housing-fund:*（参保登记写走 insurance:write）
 */

import http from './http';
import type { PaginatedResponse } from './types';
import { unwrapData } from './types/organization';
import {
  unwrapSalaryPage,
  type CreateEmployeeInsuranceRequest,
  type CreateHousingFundRequest,
  type CreateSocialSchemeRequest,
  type EmployeeInsuranceRegistration,
  type HousingFundScheme,
  type ListEmployeeInsuranceFilter,
  type ListHousingFundFilter,
  type ListSocialSchemeFilter,
  type SocialInsuranceScheme,
  type UpdateEmployeeInsuranceRequest,
  type UpdateHousingFundRequest,
  type UpdateSocialSchemeRequest,
} from './types/salary';

export const INSURANCE_PATHS = {
  social: '/salary/insurances/social',
  housingFund: '/salary/insurances/housing-fund',
  employees: '/salary/insurances/employees',
  item: (base: string, id: string) => `${base}/${id}`,
} as const;

/** GET /salary/insurances/social · salary:insurance:read */
export async function listSocialSchemes(
  filter: ListSocialSchemeFilter = {},
): Promise<PaginatedResponse<SocialInsuranceScheme>> {
  return unwrapSalaryPage<SocialInsuranceScheme>(
    await http.get(INSURANCE_PATHS.social, { params: filter }),
  );
}

/** POST /salary/insurances/social · salary:insurance:write */
export async function createSocialScheme(
  data: CreateSocialSchemeRequest,
): Promise<SocialInsuranceScheme> {
  return unwrapData<SocialInsuranceScheme>(await http.post(INSURANCE_PATHS.social, data));
}

/** PATCH /salary/insurances/social/:id · salary:insurance:write */
export async function updateSocialScheme(
  id: string,
  data: UpdateSocialSchemeRequest,
): Promise<SocialInsuranceScheme> {
  return unwrapData<SocialInsuranceScheme>(
    await http.patch(INSURANCE_PATHS.item(INSURANCE_PATHS.social, id), data),
  );
}

/** GET /salary/insurances/housing-fund · salary:housing-fund:read */
export async function listHousingFundSchemes(
  filter: ListHousingFundFilter = {},
): Promise<PaginatedResponse<HousingFundScheme>> {
  return unwrapSalaryPage<HousingFundScheme>(
    await http.get(INSURANCE_PATHS.housingFund, { params: filter }),
  );
}

/** POST /salary/insurances/housing-fund · salary:housing-fund:write */
export async function createHousingFundScheme(
  data: CreateHousingFundRequest,
): Promise<HousingFundScheme> {
  return unwrapData<HousingFundScheme>(await http.post(INSURANCE_PATHS.housingFund, data));
}

/** PATCH /salary/insurances/housing-fund/:id · salary:housing-fund:write */
export async function updateHousingFundScheme(
  id: string,
  data: UpdateHousingFundRequest,
): Promise<HousingFundScheme> {
  return unwrapData<HousingFundScheme>(
    await http.patch(INSURANCE_PATHS.item(INSURANCE_PATHS.housingFund, id), data),
  );
}

/** GET /salary/insurances/employees · salary:insurance:read */
export async function listEmployeeInsurances(
  filter: ListEmployeeInsuranceFilter = {},
): Promise<PaginatedResponse<EmployeeInsuranceRegistration>> {
  return unwrapSalaryPage<EmployeeInsuranceRegistration>(
    await http.get(INSURANCE_PATHS.employees, { params: filter }),
  );
}

/** POST /salary/insurances/employees · salary:insurance:write */
export async function createEmployeeInsurance(
  data: CreateEmployeeInsuranceRequest,
): Promise<EmployeeInsuranceRegistration> {
  return unwrapData<EmployeeInsuranceRegistration>(
    await http.post(INSURANCE_PATHS.employees, data),
  );
}

/** PATCH /salary/insurances/employees/:id · salary:insurance:write */
export async function updateEmployeeInsurance(
  id: string,
  data: UpdateEmployeeInsuranceRequest,
): Promise<EmployeeInsuranceRegistration> {
  return unwrapData<EmployeeInsuranceRegistration>(
    await http.patch(INSURANCE_PATHS.item(INSURANCE_PATHS.employees, id), data),
  );
}
