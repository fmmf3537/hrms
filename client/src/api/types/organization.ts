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

/** StatusTag 颜色覆盖（不改 StatusTag.vue） */
export type LifecycleTagType = 'success' | 'warning' | 'info' | 'danger';

export const LIFECYCLE_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  submitted: '已提交',
  approved: '已通过',
  cancelled: '已取消',
  rejected: '已驳回',
  handover_pending: '待交接',
  certificate_issued: '已发证明',
  pending_signature: '待签署',
  signing: '签署中',
  signed: '已签署',
  expired: '已到期',
};

export function lifecycleStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '—';
  }
  return LIFECYCLE_STATUS_LABELS[status] ?? status;
}

export function lifecycleTagType(status: string | null | undefined): LifecycleTagType {
  if (
    status === 'approved' ||
    status === 'signed' ||
    status === 'certificate_issued'
  ) {
    return 'success';
  }
  if (
    status === 'rejected' ||
    status === 'cancelled' ||
    status === 'expired'
  ) {
    return 'danger';
  }
  if (
    status === 'submitted' ||
    status === 'pending_signature' ||
    status === 'signing' ||
    status === 'handover_pending'
  ) {
    return 'warning';
  }
  return 'info';
}

// ===== A3 入职（对齐 Prisma OnboardingRecord，无 employeeNo 字段；工号在 confirm 后写入 Employee）=====
export type OnboardingStatus = 'draft' | 'submitted' | 'approved' | 'cancelled';

export type OnboardingContractType = 'formal' | 'intern' | 'consultant' | 'labor';

export type OcrType = 'idCard' | 'bankCard' | 'certificate';

export interface OrgNameRef {
  id: string;
  name: string;
  employeeNo?: string | null;
}

export interface OnboardingTask {
  id: string;
  onboardingId: string;
  name: string;
  category: string;
  status: string;
  ownerId?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  remark?: string | null;
}

export interface Onboarding {
  id: string;
  name: string;
  gender?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  companyId: string;
  departmentId: string;
  hireDate: string;
  contractType: OnboardingContractType | string;
  probationMonths?: number | null;
  baseSalary?: string | number | null;
  idCard?: string | null;
  bankName?: string | null;
  bankCard?: string | null;
  certificates?: unknown;
  materialsChecklist?: Record<string, boolean> | null;
  status: OnboardingStatus;
  approvalInstanceId?: string | null;
  employeeId?: string | null;
  cancelledAt?: string | null;
  cancelledReason?: string | null;
  createdAt: string;
  updatedAt: string;
  company?: OrgNameRef;
  department?: OrgNameRef;
  tasks?: OnboardingTask[];
}

export interface CreateOnboardingRequest {
  name: string;
  companyId: string;
  departmentId: string;
  hireDate: string;
  contractType: OnboardingContractType;
  gender?: Gender;
  birthDate?: string;
  phone?: string;
  email?: string;
  probationMonths?: number;
  baseSalary?: number;
  idCard?: string;
  bankName?: string;
  bankCard?: string;
}

export interface ParseOcrRequest {
  type: OcrType;
  imageBase64: string;
}

export interface ConfirmOnboardingRequest {
  approved?: boolean;
  reason?: string;
  instanceId?: string;
}

export interface ListOnboardingFilter {
  companyId?: string;
  departmentId?: string;
  status?: OnboardingStatus;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

// ===== A4 转正（后端状态 draft/submitted/approved/rejected/cancelled，无 pending）=====
export type RegularizationStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface Regularization {
  id: string;
  employeeId: string;
  hireDate: string;
  probationEndDate: string;
  appliedAt: string;
  selfEvaluation?: string | null;
  managerEvaluation?: string | null;
  hrEvaluation?: string | null;
  performanceScore?: number | null;
  newBaseSalary?: string | number | null;
  newPerformanceSalary?: string | number | null;
  newTotalSalary?: string | number | null;
  status: RegularizationStatus;
  approvalInstanceId?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectedReason?: string | null;
  cancelledReason?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: OrgNameRef;
}

export interface CreateRegularizationRequest {
  employeeId: string;
  selfEvaluation?: string;
  managerEvaluation?: string;
  hrEvaluation?: string;
  performanceScore?: number;
  newBaseSalary?: number;
  newPerformanceSalary?: number;
  newTotalSalary?: number;
}

export interface ListRegularizationFilter {
  companyId?: string;
  departmentId?: string;
  status?: RegularizationStatus;
  page?: number;
  pageSize?: number;
}

export interface CancelReasonRequest {
  reason: string;
}

// ===== A5 调动（类型 transfer/promote/demote；状态无 executed）=====
export type TransferType = 'transfer' | 'promote' | 'demote';

export type TransferStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface Transfer {
  id: string;
  employeeId: string;
  transferType: TransferType | string;
  reason?: string | null;
  fromCompanyId: string;
  fromDeptId: string;
  fromPosition?: string | null;
  toCompanyId: string;
  toDeptId: string;
  toPosition: string;
  newBaseSalary?: string | number | null;
  newPerformanceSalary?: string | number | null;
  newTotalSalary?: string | number | null;
  effectiveDate: string;
  status: TransferStatus;
  approvalInstanceId?: string | null;
  rejectedReason?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: OrgNameRef;
}

export interface CreateTransferRequest {
  employeeId: string;
  transferType: TransferType;
  toCompanyId: string;
  toDeptId: string;
  toPosition: string;
  effectiveDate: string;
  reason?: string;
  newBaseSalary?: number;
  newPerformanceSalary?: number;
  newTotalSalary?: number;
}

export interface UpdateTransferRequest {
  transferType?: TransferType;
  toCompanyId?: string;
  toDeptId?: string;
  toPosition?: string;
  effectiveDate?: string;
  reason?: string;
  newBaseSalary?: number | null;
  newPerformanceSalary?: number | null;
  newTotalSalary?: number | null;
}

export interface ListTransferFilter {
  employeeId?: string;
  status?: TransferStatus;
  fromDeptId?: string;
  toDeptId?: string;
  page?: number;
  pageSize?: number;
}

// ===== A6 离职 =====
export type OffboardingStatus =
  | 'draft'
  | 'handover_pending'
  | 'submitted'
  | 'approved'
  | 'certificate_issued'
  | 'rejected'
  | 'cancelled';

export type ResignationType = 'employee_initiated' | 'company_initiated';

export interface HandoverTask {
  id: string;
  offboardingId: string;
  name: string;
  category: string;
  status: string;
  ownerId?: string | null;
  remark?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
}

export interface Offboarding {
  id: string;
  employeeId: string;
  resignationType: ResignationType | string;
  reason?: string | null;
  lastWorkingDate: string;
  handoverCompleted: boolean;
  handoverCompletedBy?: string | null;
  handoverCompletedAt?: string | null;
  approvalInstanceId?: string | null;
  certificateIssued: boolean;
  certificateIssuedAt?: string | null;
  certificateNumber?: string | null;
  certificateUrl?: string | null;
  archiveRetentionYears: number;
  status: OffboardingStatus;
  cancelledReason?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: OrgNameRef;
  tasks?: HandoverTask[];
}

export interface CreateOffboardingRequest {
  employeeId: string;
  resignationType: ResignationType;
  lastWorkingDate: string;
  reason?: string;
}

export interface ListOffboardingFilter {
  companyId?: string;
  departmentId?: string;
  status?: OffboardingStatus;
  page?: number;
  pageSize?: number;
}

// ===== A7 合同 =====
export type ContractType = 'formal' | 'intern' | 'consultant' | 'labor' | 'nda';

export type ContractStatus =
  | 'draft'
  | 'pending_signature'
  | 'signing'
  | 'signed'
  | 'expired'
  | 'cancelled';

export interface ContractAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedAt?: string;
}

export interface ContractSignatory {
  name: string;
  role: string;
  phone?: string;
  email?: string;
  signed?: boolean;
}

export interface Contract {
  id: string;
  employeeId: string;
  contractNo: string;
  contractType: ContractType | string;
  title: string;
  startDate: string;
  endDate: string;
  probationMonths?: number | null;
  baseSalary?: string | number | null;
  position?: string | null;
  workLocation?: string | null;
  templateKey: string;
  attachments?: ContractAttachment[] | null;
  signatories?: ContractSignatory[] | null;
  esignProvider?: string;
  esignFlowId?: string | null;
  esignFlowUrl?: string | null;
  status: ContractStatus;
  signedAt?: string | null;
  cancelledReason?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: OrgNameRef;
}

export interface CreateContractRequest {
  employeeId: string;
  contractType: ContractType;
  title: string;
  startDate: string;
  endDate: string;
  templateKey: string;
  probationMonths?: number;
  baseSalary?: number;
  position?: string;
  workLocation?: string;
  attachments?: ContractAttachment[];
}

export interface UpdateContractRequest {
  contractType?: ContractType;
  title?: string;
  startDate?: string;
  endDate?: string;
  templateKey?: string;
  probationMonths?: number | null;
  baseSalary?: number | null;
  position?: string | null;
  workLocation?: string | null;
  attachments?: ContractAttachment[] | null;
}

export interface ListContractFilter {
  employeeId?: string;
  contractType?: ContractType;
  status?: ContractStatus;
  page?: number;
  pageSize?: number;
}

/** e-签宝 webhook mock（真实 SaaS 留二期） */
export interface ESignWebhookPayload {
  flowId: string;
  signStatus: string;
  signedAt?: string;
  signatories?: ContractSignatory[];
}
