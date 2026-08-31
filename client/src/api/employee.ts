/**
 * 员工档案 API（M5-2-A1）
 * @module api/employee
 * @description 消费 list / statistics / get / create / update / delete + 3 OCR + contract-expiring（共 10 端点）
 * 调动/转正/离职/导入导出不在本路由，留 M5-2-A2
 */

import http from './http';
import type { PaginatedResponse } from './types';
import type {
  CreateEmployeeRequest,
  Employee,
  EmployeeStatistics,
  ListEmployeeFilter,
  UpdateEmployeeRequest,
} from './types/organization';
import { unwrapData, unwrapPage } from './types/organization';

export const EMPLOYEE_PATHS = {
  list: '/employees',
  statistics: '/employees/statistics',
  item: (id: string) => `/employees/${id}`,
  parseIdCard: (id: string) => `/employees/${id}/parse-id-card`,
  parseBankCard: (id: string) => `/employees/${id}/parse-bank-card`,
  parseCertificate: (id: string) => `/employees/${id}/parse-certificate`,
  contractExpiring: (id: string) => `/employees/${id}/contract-expiring`,
} as const;

export async function listEmployees(
  filter: ListEmployeeFilter = {},
): Promise<PaginatedResponse<Employee>> {
  return unwrapPage<Employee>(await http.get(EMPLOYEE_PATHS.list, { params: filter }));
}

export async function getEmployeeStatistics(companyId?: string): Promise<EmployeeStatistics> {
  return unwrapData<EmployeeStatistics>(
    await http.get(EMPLOYEE_PATHS.statistics, { params: { companyId } }),
  );
}

export async function getEmployee(id: string): Promise<Employee> {
  return unwrapData<Employee>(await http.get(EMPLOYEE_PATHS.item(id)));
}

export async function createEmployee(data: CreateEmployeeRequest): Promise<Employee> {
  return unwrapData<Employee>(await http.post(EMPLOYEE_PATHS.list, data));
}

export async function updateEmployee(id: string, data: UpdateEmployeeRequest): Promise<Employee> {
  return unwrapData<Employee>(await http.put(EMPLOYEE_PATHS.item(id), data));
}

export async function deleteEmployee(id: string): Promise<void> {
  await http.delete(EMPLOYEE_PATHS.item(id));
}

export async function parseEmployeeIdCard(
  id: string,
  imageBase64: string,
): Promise<unknown> {
  return unwrapData<unknown>(
    await http.post(EMPLOYEE_PATHS.parseIdCard(id), { imageBase64 }),
  );
}

export async function parseEmployeeBankCard(
  id: string,
  imageBase64: string,
): Promise<unknown> {
  return unwrapData<unknown>(
    await http.post(EMPLOYEE_PATHS.parseBankCard(id), { imageBase64 }),
  );
}

export async function parseEmployeeCertificate(
  id: string,
  imageBase64: string,
): Promise<unknown> {
  return unwrapData<unknown>(
    await http.post(EMPLOYEE_PATHS.parseCertificate(id), { imageBase64 }),
  );
}

export async function listContractExpiring(
  companyId: string,
  days = 30,
): Promise<Employee[]> {
  const data = unwrapData<Employee[]>(
    await http.get(EMPLOYEE_PATHS.contractExpiring(companyId), {
      params: { companyId, days },
    }),
  );
  return Array.isArray(data) ? data : [];
}
