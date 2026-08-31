<script setup lang="ts">
/**
 * 工作台（M5-2-0）
 * 5 角色模块入口卡片 + 健康检查状态；未登录 / 无角色时 EmptyState
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/EmptyState.vue';
import { useUserStore } from '@/stores/user';
import { getHealth } from '@/api/auth';
import { getDashboardModules } from '@/utils/permission';
import type { HealthCheck } from '@/api/types';

const router = useRouter();
const userStore = useUserStore();

const health = ref<HealthCheck | null>(null);
const healthError = ref(false);

const visibleModules = computed(() => getDashboardModules(userStore.userInfo ? userStore.role : null));

const healthText = computed(() => {
  if (healthError.value) {
    return '服务不可达';
  }
  if (!health.value) {
    return '检测中…';
  }
  return health.value.status === 'ok' ? '服务正常' : '服务异常';
});

onMounted(async () => {
  try {
    health.value = await getHealth();
    healthError.value = health.value.status !== 'ok';
  } catch {
    healthError.value = true;
  }
});

function openModule(to: string): void {
  router.push(to);
}
</script>

<template>
  <div class="dashboard">
    <PageHeader title="工作台" :breadcrumb="[{ label: '工作台' }]" />
    <el-card v-if="userStore.userInfo" class="dashboard__welcome" shadow="never">
      <div class="dashboard__welcome-row">
        <div>
          欢迎，{{ userStore.displayName }}（{{ userStore.role }}）
        </div>
        <el-tag :type="healthError ? 'danger' : 'success'" size="small">
          {{ healthText }}
        </el-tag>
      </div>
    </el-card>
    <EmptyState v-if="!userStore.userInfo" description="未登录或会话已失效，请重新登录" />
    <div v-else class="dashboard__modules">
      <el-card
        v-for="item in visibleModules"
        :key="item.key"
        class="module-card"
        shadow="hover"
        @click="openModule(item.to)"
      >
        <el-icon :size="40">
          <component :is="item.icon" />
        </el-icon>
        <h2>{{ item.title }}</h2>
        <p>{{ item.description }}</p>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 1200px;
}

.dashboard__welcome {
  margin-bottom: 20px;
}

.dashboard__welcome-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 16px;
  color: #303133;
}

.dashboard__modules {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.module-card {
  cursor: pointer;
  text-align: center;
}

.module-card h2 {
  margin: 12px 0 8px;
  font-size: 16px;
  color: #303133;
}

.module-card p {
  margin: 0;
  font-size: 13px;
  color: #909399;
}
</style>
