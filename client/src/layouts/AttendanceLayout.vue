<script setup lang="ts">
/**
 * 考勤假勤模块布局（M5-2-B）
 * 独立 layout，不修改 DefaultLayout / OrganizationLayout
 */
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Calendar, Clock, DataAnalysis, Location, Sunny, Timer } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import { filterAttendanceMenu, resolveAttendanceActiveKey } from '@/router/attendance';

const ICONS = {
  Clock,
  Timer,
  Calendar,
  Sunny,
  Location,
  DataAnalysis,
} as const;

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const menuItems = computed(() => filterAttendanceMenu(userStore.userInfo));
const activeKey = computed(() => resolveAttendanceActiveKey(route.path));

function onSelect(key: string): void {
  const item = menuItems.value.find((m) => m.key === key);
  router.push(item?.to || '/attendance');
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
  <div class="att-layout">
    <aside class="att-layout__sidebar">
      <div class="att-layout__brand">考勤假勤</div>
      <el-menu :default-active="activeKey" class="att-layout__menu" @select="onSelect">
        <el-menu-item v-for="item in menuItems" :key="item.key" :index="item.key">
          <el-icon>
            <component :is="ICONS[item.icon as keyof typeof ICONS]" />
          </el-icon>
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
      <div class="att-layout__back">
        <el-button text type="primary" @click="goDashboard">返回工作台</el-button>
      </div>
    </aside>
    <main class="att-layout__content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.att-layout {
  display: flex;
  min-height: 100vh;
  background: #f0f2f5;
}

.att-layout__sidebar {
  width: 200px;
  background: #fff;
  border-right: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
}

.att-layout__brand {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #ebeef5;
}

.att-layout__menu {
  flex: 1;
  border-right: none;
}

.att-layout__back {
  padding: 12px;
  border-top: 1px solid #ebeef5;
}

.att-layout__content {
  flex: 1;
  padding: 20px;
  overflow: auto;
}
</style>
