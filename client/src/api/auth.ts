import request from './request';
import type { ApiResponse, LoginParams, LoginResponse, UserInfo } from '@/types';

/**
 * 用户登录
 */
export function login(params: LoginParams): Promise<ApiResponse<LoginResponse>> {
  return request.post('/auth/login', params) as unknown as Promise<ApiResponse<LoginResponse>>;
}

/**
 * 刷新 accessToken
 */
export function refreshToken(refreshTokenValue: string): Promise<ApiResponse<{ accessToken: string }>> {
  return request.post('/auth/refresh', {
    refreshToken: refreshTokenValue,
  }) as unknown as Promise<ApiResponse<{ accessToken: string }>>;
}

/**
 * 退出登录（需 Authorization 头）
 */
export function logout(refreshTokenValue: string): Promise<ApiResponse> {
  return request.post('/auth/logout', {
    refreshToken: refreshTokenValue,
  }) as unknown as Promise<ApiResponse>;
}

/**
 * 获取当前登录用户信息
 */
export function getCurrentUser(): Promise<ApiResponse<{ user: UserInfo }>> {
  return request.get('/auth/me') as unknown as Promise<ApiResponse<{ user: UserInfo }>>;
}
