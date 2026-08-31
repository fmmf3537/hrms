/**
 * Axios 实例 + 拦截器（M5-2-0 共享基础设施）
 * @module api/http
 * @description
 *  - 请求拦截器自动加 Bearer token
 *  - 401 单飞 refresh（后端 rotation + reuse 检测，并发 refresh 会踢全端下线）
 *  - 登录/刷新接口的 401 不走 refresh
 *  - 业务错误 toast；网络错误提示「网络异常」
 */

import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { ElMessage } from 'element-plus';
import { clearToken, getRefreshToken, getToken, setToken } from '@/utils/auth';
import type { ApiError, ApiResponse, RefreshResponse } from './types';

type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

/** 并发 401 只发一次 refresh，其余请求等待同一 Promise */
let refreshQueue: Promise<string | null> | null = null;

/**
 * 登录 / 刷新接口的 401 是业务失败，不能再去 refresh（会死循环 / 误杀 token）
 */
export function isAuthLoginOrRefresh(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  return url.includes('/auth/login') || url.includes('/auth/refresh');
}

/**
 * 是否应尝试 token 刷新后重放
 */
export function shouldAttemptTokenRefresh(
  status: number | undefined,
  url: string | undefined,
  alreadyRetried: boolean,
): boolean {
  return status === 401 && !alreadyRetried && !isAuthLoginOrRefresh(url);
}

function extractApiMessage(body: ApiResponse | ApiError | undefined): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  if ('error' in body && typeof body.error === 'string' && body.error) {
    return body.error;
  }
  if ('message' in body && typeof body.message === 'string' && body.message) {
    return body.message;
  }
  return undefined;
}

/**
 * 从 Axios 错误提取 toast 文案
 */
export function getRequestErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return '网络异常';
  }
  const axiosError = error as AxiosError<ApiResponse | ApiError>;
  if (!axiosError.response) {
    return '网络异常';
  }
  const body = axiosError.response.data;
  const fromBody = extractApiMessage(body);
  if (fromBody) {
    return fromBody;
  }
  return `请求失败 (${axiosError.response.status})`;
}

function redirectToLogin(): void {
  clearToken();
  if (typeof window === 'undefined') {
    return;
  }
  if (window.location.pathname !== '/login') {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?redirect=${redirect}`;
  }
}

/**
 * 用裸 axios 调 refresh，避免进入本实例拦截器死循环
 */
async function doRefreshToken(): Promise<string | null> {
  const refreshTokenValue = getRefreshToken();
  if (!refreshTokenValue) {
    return null;
  }
  const baseURL = http.defaults.baseURL ?? '/api';
  try {
    const res = await axios.post<ApiResponse<RefreshResponse>>(
      `${baseURL}/auth/refresh`,
      { refreshToken: refreshTokenValue },
      { timeout: 30000, headers: { 'Content-Type': 'application/json' } },
    );
    const payload = res.data?.data;
    if (res.data?.success && payload?.accessToken) {
      setToken(payload.accessToken, payload.refreshToken);
      return payload.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

function queueRefresh(): Promise<string | null> {
  if (!refreshQueue) {
    refreshQueue = doRefreshToken().finally(() => {
      refreshQueue = null;
    });
  }
  return refreshQueue;
}

http.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

http.interceptors.response.use(
  (response: AxiosResponse) => response.data,
  async (error: AxiosError<ApiResponse | ApiError>) => {
    const originalRequest = error.config as RetryableConfig | undefined;
    const status = error.response?.status;
    const url = originalRequest?.url;

    if (originalRequest && shouldAttemptTokenRefresh(status, url, Boolean(originalRequest._retry))) {
      originalRequest._retry = true;
      const newToken = await queueRefresh();
      if (newToken) {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return http(originalRequest);
      }
      ElMessage.error('登录已过期，请重新登录');
      redirectToLogin();
      return Promise.reject(error);
    }

    const body = error.response?.data;
    const code = body && typeof body === 'object' && 'code' in body ? body.code : undefined;
    if (code === 10112) {
      ElMessage.warning(extractApiMessage(body) || '必须先修改密码');
      return Promise.reject(error);
    }

    ElMessage.error(getRequestErrorMessage(error));
    return Promise.reject(error);
  },
);

export default http;
