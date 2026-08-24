<template>
  <el-container class="layout-container">
    <!-- 侧边栏 -->
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
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path" :disabled="item.disabled">
          <el-icon>
            <component :is="item.icon" />
          </el-icon>
          <template #title>{{ item.title }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container class="main-container">
      <!-- 顶部导航 -->
      <el-header class="header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="route.meta.title">{{ route.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="header-right">
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              {{ authStore.userName }}
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile" disabled>
                  <el-icon><User /></el-icon>个人中心（待上线）
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 主内容区 -->
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Odometer,
  OfficeBuilding,
  AlarmClock,
  Money,
  TrendCharts,
  ArrowDown,
  SwitchButton,
  User,
} from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// 当前激活的菜单
const activeMenu = computed(() => route.path);

// 菜单项：Dashboard 可用，其余模块为 M1+ 占位（disabled）
const menuItems = [
  { path: '/dashboard', title: '工作台', icon: Odometer, disabled: false },
  { path: '/organization', title: '组织人事', icon: OfficeBuilding, disabled: true },
  { path: '/attendance', title: '考勤管理', icon: AlarmClock, disabled: true },
  { path: '/payroll', title: '薪酬管理', icon: Money, disabled: true },
  { path: '/performance', title: '绩效管理', icon: TrendCharts, disabled: true },
];

// 处理用户下拉菜单命令
async function handleCommand(command: string) {
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      });
      await authStore.logout();
      ElMessage.success('已退出登录');
      router.push('/login');
    } catch {
      // 用户取消
    }
  }
}
</script>

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
