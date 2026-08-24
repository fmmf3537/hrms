// 用户与登录相关类型
export interface UserInfo {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  status: string;
  /** 首次登录/默认口令用户必须改密（M1 改密接口上线后由前端跳转改密页） */
  mustChangePassword: boolean;
  roles: string[];
  companyId: string | null;
  departmentId: string | null;
  employee?: {
    id: string;
    employeeNo: string;
    name: string;
  } | null;
}

export interface LoginParams {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: UserInfo;
  accessToken: string;
  refreshToken: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  code?: number;
  message?: string;
  error?: string;
  data?: T;
}
