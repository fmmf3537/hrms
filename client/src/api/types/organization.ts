/**
 * 组织人事 API 类型（M5-2-A1）
 * @module api/types/organization
 * @description 对齐 Prisma Company / Department / Employee + 后端 { success, data } 信封
 */

import type { ApiResponse, PaginatedResponse } from '@/api/types';

/** A1 法人：schema 为 active / suspended（无 merged） */
export type CompanyStatus = 'active' | 'suspended';

/** A2 部门 */
export type DepartmentStatus = 'active' | 'suspended' | 'merged';

/** A3 员工 */
export type EmployeeStatus = 'probation' | 'active' | 'resigned';

export type Gender = 'male' | 'female';

export interface Company {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  city: string | null;
  address: string | null;
  contact: string | null;
  legalRep: string | null;
  taxNo: string | null;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CreateCompanyRequest {
  code: string;
  name: string;
  shortName?: string;
  city?: string;
  address?: string;
  contact?: string;
  legalRep?: string;
  taxNo?: string;
  status?: CompanyStatus;
}

export type UpdateCompanyRequest = Partial<Omit<CreateCompanyRequest, 'code'>>;

export interface ListCompanyFilter {
  status?: CompanyStatus;
  page?: number;
  pageSize?: number;
}

export interface CompanyStatistics {
  departmentCount: number;
  employeeCount: number;
  headcountTotal: number;
  headcountUsed: number;
  warningLevel: 'ok' | 'warning' | 'critical';
}

export interface Department {
  id: string;
  companyId: string;
  parentId: string | null;
  code: string;
  name: string;
  leaderId: string | null;
  headcount: number;
  order: number;
  status: DepartmentStatus;
  children?: Department[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateDepartmentRequest {
  companyId: string;
  parentId?: string | null;
  code: string;
  name: string;
  leaderId?: string;
  headcount?: number;
  order?: number;
  status?: DepartmentStatus;
}

export type UpdateDepartmentRequest = Partial<
  Omit<CreateDepartmentRequest, 'companyId' | 'code' | 'leaderId' | 'parentId'>
> & {
  leaderId?: string | null;
  parentId?: string | null;
};

export interface MoveDepartmentRequest {
  newParentId?: string | null;
  newOrder?: number;
}

export interface DepartmentHeadcount {
  departmentId: string;
  code: string;
  name: string;
  headcount: number;
  currentCount: number;
  warningLevel: 'ok' | 'warning' | 'critical';
}

export interface Employee {
  id: string;
  userId: string | null;
  employeeNo: string;
  name: string;
  gender: Gender | string | null;
  birthDate: string | null;
  idCard: string | null;
  phone: string | null;
  email: string | null;
  bankCard: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  companyId: string;
  departmentId: string | null;
  position?: string | null;
  hireDate: string;
  resignationDate: string | null;
  status: EmployeeStatus;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmployeeRequest {
  companyId: string;
  departmentId: string;
  name: string;
  hireDate: string;
  gender?: Gender;
  birthDate?: string;
  phone?: string;
  email?: string;
  idCard?: string;
  bankCard?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  position?: string;
  status?: EmployeeStatus;
}

export type UpdateEmployeeRequest = Partial<
  Omit<CreateEmployeeRequest, 'companyId' | 'hireDate'>
> & {
  resignationDate?: string | null;
};

export interface ListEmployeeFilter {
  companyId?: string;
  departmentId?: string;
  status?: EmployeeStatus;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface EmployeeStatistics {
  total: number;
  active: number;
  probation: number;
  resigned: number;
}

export interface TreeNodeData {
  id: string;
  label: string;
  children?: TreeNodeData[];
}

/**
 * 解包 { success, data }
 */
export function unwrapData<T>(raw: unknown): T {
  if (!raw || typeof raw !== 'object') {
    throw new Error('接口响应格式异常');
  }
  const envelope = raw as ApiResponse<T>;
  if (envelope.success === false) {
    throw new Error(envelope.error || envelope.message || '请求失败');
  }
  if ('data' in envelope && envelope.data !== undefined) {
    return envelope.data;
  }
  throw new Error('接口响应缺少 data');
}

/**
 * 解包列表：data[] + total/page/pageSize 与 data 同级（公司/员工 list）
 */
export function unwrapPage<T>(raw: unknown): PaginatedResponse<T> {
  if (!raw || typeof raw !== 'object') {
    throw new Error('接口响应格式异常');
  }
  const row = raw as ApiResponse<T[]> & {
    total?: number;
    page?: number;
    pageSize?: number;
  };
  const items = Array.isArray(row.data) ? row.data : [];
  return {
    items,
    total: typeof row.total === 'number' ? row.total : items.length,
    page: typeof row.page === 'number' ? row.page : 1,
    pageSize: typeof row.pageSize === 'number' ? row.pageSize : items.length,
  };
}

export function unwrapList<T>(raw: unknown): T[] {
  const data = unwrapData<T[]>(raw);
  return Array.isArray(data) ? data : [];
}

/**
 * 前端二次脱敏（后端 list/get 已 mask；缺字段时兜底）
 */
export function maskSensitiveDisplay(
  value: string | null | undefined,
  keepLast = 4,
): string {
  if (!value) {
    return '—';
  }
  if (value.includes('*')) {
    return value;
  }
  if (value.length <= keepLast) {
    return '****';
  }
  return `${'*'.repeat(Math.max(0, value.length - keepLast))}${value.slice(-keepLast)}`;
}
