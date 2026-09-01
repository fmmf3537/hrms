<script setup lang="ts">
/**
 * 绩效管理模块布局（M5-2-D1）
 * 独立 layout，不修改 DefaultLayout / OrganizationLayout / AttendanceLayout / SalaryLayout
 * 侧栏菜单由 router/performance.ts 的 filterPerformanceMenu(userInfo) 驱动
 * 员工角色进入 /performance 时菜单为空 → EmptyState 兜底
 */
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Aim, Calendar, Files, Medal, SetUp } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import { filterPerformanceMenu, resolvePerformanceActiveKey } from '@/router/performance';
import EmptyState from '@/components/EmptyState.vue';

const ICONS = {
  Calendar,
  Aim,
  Files,
  SetUp,
  Medal,
} as const;

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const menuItems = computed(() => filterPerformanceMenu(userStore.userInfo));
const activeKey = computed(() => resolvePerformanceActiveKey(route.path));

function onSelect(key: string): void {
  const item = menuItems.value.find((m) => m.key === key);
  router.push(item?.to || '/performance');
}

watch(
  [menuItems, activeKey],
  () => {
    const items = menuItems.value;
    if (!items.length) {
      return;
    }
    const allowed = items.some((m) => m.key === activeKey.value);
    if (!allowed) {
      const first = items[0];
      if (first) {
        router.replace(first.to);
      }
    }
  },
  { immediate: true },
);

function goDashboard(): void {
  router.push({ name: 'Dashboard' });
}
</script>

<template>
  <div class="perf-layout">
    <aside class="perf-layout__sidebar">
      <div class="perf-layout__brand">绩效管理</div>
      <el-menu
        v-if="menuItems.length"
        :default-active="activeKey"
        class="perf-layout__menu"
        @select="onSelect"
      >
        <el-menu-item v-for="item in menuItems" :key="item.key" :index="item.key">
          <el-icon>
            <component :is="ICONS[item.icon as keyof typeof ICONS]" />
          </el-icon>
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
      <div v-else class="perf-layout__empty">
        <EmptyState description="当前角色暂无可访问的绩效模块" />
      </div>
      <div class="perf-layout__back">
        <el-button text type="primary" @click="goDashboard">返回工作台</el-button>
      </div>
    </aside>
    <main class="perf-layout__content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.perf-layout {
  display: flex;
  min-height: 100vh;
  background: #f0f2f5;
}

.perf-layout__sidebar {
  width: 200px;
  background: #fff;
  border-right: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
}

.perf-layout__brand {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #ebeef5;
}

.perf-layout__menu {
  flex: 1;
  border-right: none;
}

.perf-layout__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.perf-layout__back {
  padding: 12px;
  border-top: 1px solid #ebeef5;
}

.perf-layout__content {
  flex: 1;
  padding: 20px;
  overflow: auto;
}
</style>
