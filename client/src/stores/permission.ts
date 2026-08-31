/**
 * v-permission 指令 + 权限判断再导出（M5-2-0）
 * @module stores/permission
 * @description 根据 user.permissions 显示/隐藏 DOM；含 * 视为全部权限
 */

import type { Directive } from 'vue';
import { hasPermission as checkPermission } from '@/utils/permission';
import type { UserInfo } from '@/api/types';
import { useUserStore } from './user';

export function hasPermission(user: UserInfo | null, permission: string): boolean {
  return checkPermission(user, permission);
}

/**
 * v-permission="'salary:read'"
 * 无权限时从 DOM 移除（非 v-if，避免残留）
 */
export const vPermission: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    const userStore = useUserStore();
    if (!checkPermission(userStore.userInfo, binding.value)) {
      el.parentNode?.removeChild(el);
    }
  },
};
