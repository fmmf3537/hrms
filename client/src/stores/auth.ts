import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  login as loginApi,
  logout as logoutApi,
  refreshToken as refreshTokenApi,
  getCurrentUser,
} from '@/api/auth';
import type { LoginParams, UserInfo } from '@/types';

const ACCESS_TOKEN_KEY = 'hrms_access_token';
const REFRESH_TOKEN_KEY = 'hrms_refresh_token';
const USER_KEY = 'hrms_user';

export const useAuthStore = defineStore('auth', () => {
  // State
  const accessToken = ref<string>(localStorage.getItem(ACCESS_TOKEN_KEY) || '');
  const refreshToken = ref<string>(localStorage.getItem(REFRESH_TOKEN_KEY) || '');
  const userInfo = ref<UserInfo | null>(null);
  const isLoading = ref(false);

  // Getters
  const isLoggedIn = computed(() => !!accessToken.value);
  const isAdmin = computed(() => userInfo.value?.roles.includes('admin') ?? false);
  const isHR = computed(() => userInfo.value?.roles.includes('hr') ?? false);
  const userName = computed(() => userInfo.value?.employee?.name || userInfo.value?.username || '');

  // Actions

  /**
   * 设置 token（登录 / 刷新成功后调用）
   */
  function setTokens(newAccessToken: string, newRefreshToken?: string) {
    accessToken.value = newAccessToken;
    localStorage.setItem(ACCESS_TOKEN_KEY, newAccessToken);
    if (newRefreshToken) {
      refreshToken.value = newRefreshToken;
      localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
    }
  }

  /**
   * 清除登录态
   */
  function clearAuth() {
    accessToken.value = '';
    refreshToken.value = '';
    userInfo.value = null;
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  /**
   * 设置用户信息
   */
  function setUserInfo(user: UserInfo) {
    userInfo.value = user;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  /**
   * 从 localStorage 恢复登录态（页面刷新后调用）
   */
  function restoreFromStorage() {
    accessToken.value = localStorage.getItem(ACCESS_TOKEN_KEY) || '';
    refreshToken.value = localStorage.getItem(REFRESH_TOKEN_KEY) || '';
    const stored = localStorage.getItem(USER_KEY);
    if (stored) {
      try {
        userInfo.value = JSON.parse(stored);
      } catch {
        localStorage.removeItem(USER_KEY);
      }
    }
  }

  /**
   * 登录
   */
  async function login(params: LoginParams) {
    isLoading.value = true;
    try {
      const res = await loginApi(params);
      if (res.success && res.data) {
        setTokens(res.data.accessToken, res.data.refreshToken);
        setUserInfo(res.data.user);
        return { success: true };
      }
      return { success: false, message: res.error || res.message || '登录失败' };
    } catch (error: any) {
      return {
        success: false,
        message: error?.error || error?.message || '登录失败',
      };
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 刷新 accessToken
   */
  async function refreshAccessToken(): Promise<boolean> {
    if (!refreshToken.value) return false;
    try {
      const res = await refreshTokenApi(refreshToken.value);
      if (res.success && res.data?.accessToken) {
        setTokens(res.data.accessToken);
        return true;
      }
      return false;
    } catch {
      clearAuth();
      return false;
    }
  }

  /**
   * 获取当前用户信息
   */
  async function fetchCurrentUser(): Promise<boolean> {
    if (!accessToken.value) return false;
    try {
      const res = await getCurrentUser();
      if (res.success && res.data?.user) {
        setUserInfo(res.data.user);
        return true;
      }
      return false;
    } catch {
      clearAuth();
      return false;
    }
  }

  /**
   * 退出登录
   */
  async function logout() {
    // 尽力通知后端使 refreshToken 失效，失败也继续本地登出
    try {
      if (refreshToken.value) {
        await logoutApi(refreshToken.value);
      }
    } catch {
      // 忽略后端登出失败
    } finally {
      clearAuth();
    }
  }

  // 初始化时恢复登录态
  restoreFromStorage();

  return {
    accessToken,
    refreshToken,
    userInfo,
    isLoading,
    isLoggedIn,
    isAdmin,
    isHR,
    userName,
    setTokens,
    clearAuth,
    setUserInfo,
    restoreFromStorage,
    login,
    logout,
    fetchCurrentUser,
    refreshAccessToken,
  };
});
