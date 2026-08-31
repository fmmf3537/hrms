<script setup lang="ts">
/**
 * 根组件：有 token 时拉取当前用户（刷新页面恢复会话）
 */
import { onMounted } from 'vue';
import { useUserStore } from '@/stores/user';
import { getToken } from '@/utils/auth';

const userStore = useUserStore();

onMounted(async () => {
  if (getToken()) {
    try {
      await userStore.fetchUserInfo();
    } catch {
      /* 拦截器会处理 401；此处避免未捕获 Promise */
    }
  }
});
</script>

<template>
  <router-view />
</template>
