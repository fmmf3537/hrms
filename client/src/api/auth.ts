/**
 * 认证 API（M5-2-0）
 * @module api/auth
 * @description 复用 POST /api/auth/login|refresh|logout 与 GET /api/auth/me；0 新端点
 */

import http from './http';
import type {
  ApiResponse,
  HealthCheck,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  UserInfo,
} from './types';

function asEnvelope<T>(value: unknown): ApiResponse<T> {
  if (value && typeof value === 'object' && 'success' in value) {
    return value as ApiResponse<T>;
  }
  throw new Error('接口响应格式异常');
}

/**
 * 登录。成功返回 tokens + user（含 roles / permissions）
 */
export async function login(data: LoginRequest): Promise<LoginResponse> {
  const envelope = asEnvelope<LoginResponse>(await http.post('/auth/login', data));
  if (!envelope.success || !envelope.data) {
    throw new Error(envelope.error || envelope.message || '登录失败');
  }
  return envelope.data;
}

/**
 * 登出（尽力通知后端吊销 refresh；body 需带 refreshToken）
 */
export async function logout(refreshTokenValue?: string | null): Promise<void> {
  await http.post('/auth/logout', { refreshToken: refreshTokenValue ?? undefined });
}

/**
 * Refresh token rotation：必须用新 refresh 覆盖本地存储
 */
export async function refreshToken(refreshTokenValue: string): Promise<RefreshResponse> {
  const envelope = asEnvelope<RefreshResponse>(
    await http.post('/auth/refresh', { refreshToken: refreshTokenValue }),
  );
  if (!envelope.success || !envelope.data) {
    throw new Error(envelope.error || envelope.message || '刷新登录态失败');
  }
  return envelope.data;
}

/**
 * 当前用户（GET /api/auth/me → { user }）
 */
export async function getUserInfo(): Promise<UserInfo> {
  const envelope = asEnvelope<{ user: UserInfo }>(await http.get('/auth/me'));
  if (!envelope.success || !envelope.data?.user) {
    throw new Error(envelope.error || envelope.message || '获取用户信息失败');
  }
  return envelope.data.user;
}

/**
 * 运维健康检查（M5-1 裸 JSON：{ status, uptime, db, redis }）
 */
export async function getHealth(): Promise<HealthCheck> {
  const raw: unknown = await http.get('/health');
  if (raw && typeof raw === 'object' && 'status' in raw) {
    return raw as HealthCheck;
  }
  const envelope = asEnvelope<HealthCheck>(raw);
  if (envelope.data) {
    return envelope.data;
  }
  throw new Error('健康检查响应格式异常');
}
