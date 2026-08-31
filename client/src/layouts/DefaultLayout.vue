<script setup lang="ts">
/**
 * 默认布局：顶栏 + 侧栏 + 内容区 + 登出
 * 侧栏菜单按 5 角色过滤；M1-M4 业务入口 disabled（留 M5-2-A/B/C/D）
 */
import { computed, type Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ArrowDown,
  ChatDotRound,
  Clock,
  Money,
  Odometer,
  OfficeBuilding,
  SwitchButton,
  TrendCharts,
  User,
} from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import type { RoleCode } from '@/api/types';

interface MenuItem {
  path: string;
  title: string;
  icon: Component;
  disabled: boolean;
  roles: RoleCode[];
}

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const allMenus: MenuItem[] = [
  {
    path: '/dashboard',
    title: '工作台',
    icon: Odometer,
    disabled: false,
    roles: ['admin', 'hr', 'dept_head', 'executive', 'employee'],
  },
  {
    path: '/org',
    title: '组织人事',
    icon: OfficeBuilding,
    disabled: true,
    roles: ['admin', 'hr', 'dept_head'],
  },
  {
    path: '/attendance',
    title: '考勤假勤',
    icon: Clock,
    disabled: true,
    roles: ['admin', 'hr', 'dept_head', 'employee'],
  },
  {
    path: '/performance',
    title: '绩效管理',
    icon: TrendCharts,
    disabled: true,
    roles: ['admin', 'hr', 'dept_head', 'executive', 'employee'],
  },
  {
    path: '/salary',
    title: '薪酬核算',
    icon: Money,
    disabled: true,
    roles: ['admin', 'hr', 'executive'],
  },
  {
    path: '/ai',
    title: 'AI 智能问答',
    icon: ChatDotRound,
    disabled: true,
    roles: ['admin', 'hr', 'dept_head', 'executive', 'employee'],
  },
];

const activeMenu = computed(() => route.path);
const menuItems = computed(() =>
  allMenus.filter((item) => item.roles.includes(userStore.role)),
);

async function handleCommand(command: string): Promise<void> {
  if (command !== 'logout') {
    return;
  }
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await userStore.logout();
    ElMessage.success('已退出登录');
    await router.push({ name: 'Login' });
  } catch {
    /* 用户取消 */
  }
}
</script>

<template>
  <el-container class="layout-container">
    <el-aside class="sidebar" width="220px">
      <div class="logo">
        <span class="logo-text">辰航卓越 HRMS</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        class="sidebar-menu"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
      >
        <el-menu-item
          v-for="item in menuItems"
          :key="item.path"
          :index="item.path"
          :disabled="item.disabled"
        >
          <el-icon>
            <component :is="item.icon" />
          </el-icon>
          <template #title>{{ item.title }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container class="main-container">
      <el-header class="header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="route.meta.title">
              {{ route.meta.title }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              {{ userStore.displayName || '用户' }}
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile" disabled>
                  <el-icon><User /></el-icon>
                  改密 / 二次验证（入口预留）
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout-container {
  height: 100vh;
  width: 100vw;
}

.sidebar {
  background-color: #304156;
}

.sidebar .logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #1f2d3d;
}

.sidebar .logo .logo-text {
  color: #fff;
  font-size: 16px;
  font-weight: bold;
}

.sidebar .sidebar-menu {
  border-right: none;
}

.main-container {
  background-color: #f0f2f5;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #fff;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
}

.header .header-right .user-info {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header .header-right .user-info:hover {
  color: #409eff;
}

.main-content {
  padding: 20px;
  overflow-y: auto;
}
</style>
