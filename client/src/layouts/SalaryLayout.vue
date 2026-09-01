<script setup lang="ts">
/**
 * 薪酬核算模块布局（M5-2-C1）
 * 独立 layout，不修改 DefaultLayout / OrganizationLayout / AttendanceLayout
 */
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Coin, DataLine, Money, Operation, Postcard, Tickets, Wallet } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import { filterSalaryMenu, resolveSalaryActiveKey } from '@/router/salary';

const ICONS = {
  Money,
  Coin,
  Tickets,
  Wallet,
  Postcard,
  Operation,
  DataLine,
} as const;

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const menuItems = computed(() => filterSalaryMenu(userStore.userInfo));
const activeKey = computed(() => resolveSalaryActiveKey(route.path));

function onSelect(key: string): void {
  const item = menuItems.value.find((m) => m.key === key);
  router.push(item?.to || '/salary');
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
  <div class="salary-layout">
    <aside class="salary-layout__sidebar">
      <div class="salary-layout__brand">薪酬核算</div>
      <el-menu :default-active="activeKey" class="salary-layout__menu" @select="onSelect">
        <el-menu-item v-for="item in menuItems" :key="item.key" :index="item.key">
          <el-icon>
            <component :is="ICONS[item.icon as keyof typeof ICONS]" />
          </el-icon>
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
      <div class="salary-layout__back">
        <el-button text type="primary" @click="goDashboard">返回工作台</el-button>
      </div>
    </aside>
    <main class="salary-layout__content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.salary-layout {
  display: flex;
  min-height: 100vh;
  background: #f0f2f5;
}

.salary-layout__sidebar {
  width: 200px;
  background: #fff;
  border-right: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
}

.salary-layout__brand {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #ebeef5;
}

.salary-layout__menu {
  flex: 1;
  border-right: none;
}

.salary-layout__back {
  padding: 12px;
  border-top: 1px solid #ebeef5;
}

.salary-layout__content {
  flex: 1;
  padding: 20px;
  overflow: auto;
}
</style>
