import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';
import type { ApiResponse } from '@/types';

// axios 实例：baseURL 走 vite proxy（/api -> http://localhost:3000）
const request = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// ============ 刷新 token 并发控制 ============
// 多个请求同时 401 时，只发起一次 refresh，其余请求等待该 promise
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

/**
 * 用 refreshToken 换取新的 accessToken
 * 服务端做 refresh token rotation：返回的 refreshToken 也会更新，
 * 本函数把新的 refreshToken 同步写入 localStorage，避免下次 refresh 失败
 * 返回新 accessToken；失败返回 null（调用方负责跳登录页）
 */
function doRefreshToken(): Promise<string | null> {
  if (!refreshPromise) {
    const refreshToken = localStorage.getItem('hrms_refresh_token');
    if (!refreshToken) {
      return Promise.resolve(null);
    }
    // 注意：这里用裸 axios 而不是 request 实例，避免进入拦截器死循环
    refreshPromise = axios
      .post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
        '/api/auth/refresh',
        { refreshToken },
      )
      .then((res) => {
        const newAccess = res.data?.data?.accessToken;
        const newRefresh = res.data?.data?.refreshToken;
        if (res.data?.success && newAccess) {
          localStorage.setItem('hrms_access_token', newAccess);
          if (newRefresh) {
            localStorage.setItem('hrms_refresh_token', newRefresh);
          }
          return newAccess;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * 清除登录态并跳转登录页
 */
function redirectToLogin() {
  localStorage.removeItem('hrms_access_token');
  localStorage.removeItem('hrms_refresh_token');
  localStorage.removeItem('hrms_user');
  // 避免在登录页重复跳转
  if (window.location.pathname !== '/login') {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?redirect=${redirect}`;
  }
}

// ============ 请求拦截器：自动携带 accessToken ============
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('hrms_access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ============ 响应拦截器：统一返回 data + 401 自动刷新 ============
request.interceptors.response.use(
  // 成功：直接返回 response.data（后端统一 {success, data, ...} 结构）
  (response) => response.data,
  // 失败处理
  async (error: AxiosError<ApiResponse>) => {
    const { response, config } = error;

    // 网络错误或请求被取消，没有 response
    if (!response) {
      ElMessage.error('网络异常，请检查网络连接');
      return Promise.reject(error);
    }

    const originalRequest = config as AxiosRequestConfig & { _retry?: boolean };

    // 401：尝试用 refreshToken 换新 token 并重放原请求
    if (response.status === 401 && !originalRequest._retry && !isRefreshing) {
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const newToken = await doRefreshToken();
        if (newToken) {
          // 重放原请求
          originalRequest.headers = {
            ...originalRequest.headers,
            Authorization: `Bearer ${newToken}`,
          };
          return request(originalRequest);
        }
        // 刷新失败：清除登录态，跳登录页
        ElMessage.error('登录已过期，请重新登录');
        redirectToLogin();
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    // 其他错误：统一提示后端返回的 error/message
    const message = response.data?.error || response.data?.message || `请求失败 (${response.status})`;
    ElMessage.error(message);
    return Promise.reject(error);
  },
);

export default request;
