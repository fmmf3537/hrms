<script setup lang="ts">
/**
 * 组织人事模块布局（M5-2-A1）
 * 左侧子菜单 + 右侧 router-view；不修改 DefaultLayout
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Connection, OfficeBuilding, Share, User } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import { filterOrgMenu, resolveOrgActiveKey } from '@/router/organization';

const ICONS = {
  OfficeBuilding,
  Connection,
  User,
  Share,
} as const;

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const menuItems = computed(() => filterOrgMenu(userStore.userInfo));
const activeKey = computed(() => resolveOrgActiveKey(route.path));

function onSelect(key: string): void {
  const item = menuItems.value.find((m) => m.key === key);
  router.push(item?.to || '/org');
}

function goDashboard(): void {
  router.push({ name: 'Dashboard' });
}
</script>

<template>
  <div class="org-layout">
    <aside class="org-layout__sidebar">
      <div class="org-layout__brand">组织人事</div>
      <el-menu :default-active="activeKey" class="org-layout__menu" @select="onSelect">
        <el-menu-item v-for="item in menuItems" :key="item.key" :index="item.key">
          <el-icon>
            <component :is="ICONS[item.icon as keyof typeof ICONS]" />
          </el-icon>
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
      <div class="org-layout__back">
        <el-button text type="primary" @click="goDashboard">返回工作台</el-button>
      </div>
    </aside>
    <main class="org-layout__content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.org-layout {
  display: flex;
  min-height: 100vh;
  background: #f0f2f5;
}

.org-layout__sidebar {
  width: 200px;
  background: #fff;
  border-right: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
}

.org-layout__brand {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #ebeef5;
}

.org-layout__menu {
  flex: 1;
  border-right: none;
}

.org-layout__back {
  padding: 12px;
  border-top: 1px solid #ebeef5;
}

.org-layout__content {
  flex: 1;
  padding: 20px;
  overflow: auto;
}
</style>
