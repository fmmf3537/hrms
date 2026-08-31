/**
 * 部门管理 API（M5-2-A1）
 * @module api/department
 * @description 消费 list / tree / get / create / update / delete / move / headcount（共 8 端点）
 * 部门员工走 GET /employees?departmentId=（后端无 /departments/:id/employees）
 */

import http from './http';
import { listEmployees } from './employee';
import type { PaginatedResponse } from './types';
import type {
  CreateDepartmentRequest,
  Department,
  DepartmentHeadcount,
  Employee,
  MoveDepartmentRequest,
  UpdateDepartmentRequest,
} from './types/organization';
import { unwrapData, unwrapList } from './types/organization';

export const DEPARTMENT_PATHS = {
  list: '/departments',
  tree: '/departments/tree',
  item: (id: string) => `/departments/${id}`,
  move: (id: string) => `/departments/${id}/move`,
  headcount: (id: string) => `/departments/${id}/headcount`,
} as const;

export async function listDepartments(params?: {
  companyId?: string;
  parentId?: string;
  status?: string;
}): Promise<Department[]> {
  return unwrapList<Department>(await http.get(DEPARTMENT_PATHS.list, { params }));
}

export async function getDepartmentTree(companyId: string, rootId?: string): Promise<Department[]> {
  return unwrapList<Department>(
    await http.get(DEPARTMENT_PATHS.tree, { params: { companyId, rootId } }),
  );
}

export async function getDepartment(id: string): Promise<Department> {
  return unwrapData<Department>(await http.get(DEPARTMENT_PATHS.item(id)));
}

export async function createDepartment(data: CreateDepartmentRequest): Promise<Department> {
  return unwrapData<Department>(await http.post(DEPARTMENT_PATHS.list, data));
}

export async function updateDepartment(
  id: string,
  data: UpdateDepartmentRequest,
): Promise<Department> {
  return unwrapData<Department>(await http.put(DEPARTMENT_PATHS.item(id), data));
}

export async function deleteDepartment(id: string): Promise<void> {
  await http.delete(DEPARTMENT_PATHS.item(id));
}

export async function moveDepartment(id: string, data: MoveDepartmentRequest): Promise<Department> {
  return unwrapData<Department>(await http.post(DEPARTMENT_PATHS.move(id), data));
}

export async function getDepartmentHeadcount(id: string): Promise<DepartmentHeadcount> {
  return unwrapData<DepartmentHeadcount>(await http.get(DEPARTMENT_PATHS.headcount(id)));
}

export async function listDepartmentEmployees(
  id: string,
  page = 1,
  pageSize = 20,
): Promise<PaginatedResponse<Employee>> {
  return listEmployees({ departmentId: id, page, pageSize });
}
