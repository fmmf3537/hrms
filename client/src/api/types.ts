/**
 * 前端 API 类型（M5-2-0 共享基础设施）
 * @module api/types
 * @description 与后端 { success, data, code, message/error } 信封对齐；角色仅 5 个，无 finance
 */

/** 5 角色 RBAC（V1.2 §三.6，无 finance） */
export type RoleCode = 'admin' | 'hr' | 'dept_head' | 'executive' | 'employee';

/** 5 位业务错误码 */
export type ErrorCode = number;

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  code?: ErrorCode;
  message?: string;
  error?: string;
  data?: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EmployeeBrief {
  id: string;
  employeeNo: string;
  name: string;
}

/**
 * 当前用户（对齐 auth.service toSafeUser / GET /api/auth/me）
 * 后端返回 roles[] + permissions[]，前端用 primaryRole 派生单一 RoleCode
 */
export interface UserInfo {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  status: string;
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
  companyId: string | null;
  departmentId: string | null;
  employee?: EmployeeBrief | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserInfo;
  /** 后端 login 未返回该字段，保留可选以兼容提示词契约 */
  expiresIn?: number;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

/** GET /api/health（M5-1 裸 JSON，无 success 信封） */
export interface HealthCheck {
  status: 'ok' | 'error';
  uptime: number;
  db: 'ok' | 'error';
  redis: 'ok' | 'error';
}
