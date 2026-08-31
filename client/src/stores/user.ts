/**
 * 用户状态（M5-2-0）
 * @module stores/user
 * @description login / logout / refresh / fetchUserInfo；角色由 roles[] 派生，无 finance
 */

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  getUserInfo as apiGetUserInfo,
  login as apiLogin,
  logout as apiLogout,
  refreshToken as apiRefreshToken,
} from '@/api/auth';
import type { LoginRequest, RoleCode, UserInfo } from '@/api/types';
import { clearToken, getRefreshToken, getToken, setToken } from '@/utils/auth';
import { primaryRole } from '@/utils/permission';

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<UserInfo | null>(null);

  const isLoggedIn = computed(() => Boolean(getToken()) || userInfo.value !== null);
  const role = computed<RoleCode>(() => primaryRole(userInfo.value?.roles));
  const permissions = computed(() => userInfo.value?.permissions ?? []);
  const displayName = computed(
    () => userInfo.value?.employee?.name || userInfo.value?.username || '',
  );

  /**
   * 登录成功后写入 token + userInfo
   */
  async function login(data: LoginRequest): Promise<void> {
    const res = await apiLogin(data);
    setToken(res.accessToken, res.refreshToken);
    userInfo.value = res.user;
  }

  /**
   * 登出：先调后端，再清本地（后端失败也清）
   */
  async function logout(): Promise<void> {
    try {
      const refreshTokenValue = getRefreshToken();
      if (refreshTokenValue) {
        await apiLogout(refreshTokenValue);
      }
    } catch {
      /* 忽略登出接口失败，保证本地一定清掉 */
    }
    clearToken();
    userInfo.value = null;
  }

  /**
   * 有 token 时拉取 /auth/me（刷新页面恢复会话）
   */
  async function fetchUserInfo(): Promise<void> {
    if (!getToken()) {
      return;
    }
    userInfo.value = await apiGetUserInfo();
  }

  /**
   * 用 refresh token 换新 access（rotation）
   */
  async function refresh(): Promise<void> {
    const refreshTokenValue = getRefreshToken();
    if (!refreshTokenValue) {
      throw new Error('No refresh token');
    }
    const res = await apiRefreshToken(refreshTokenValue);
    setToken(res.accessToken, res.refreshToken);
  }

  return {
    userInfo,
    isLoggedIn,
    role,
    permissions,
    displayName,
    login,
    logout,
    fetchUserInfo,
    refresh,
  };
});
