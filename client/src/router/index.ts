import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Odometer } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';

// 路由配置
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: {
      public: true,
      title: '登录',
    },
  },
  {
    path: '/',
    name: 'Layout',
    component: () => import('@/layouts/DefaultLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: '/dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: {
          title: '工作台',
          icon: Odometer,
        },
      },
    ],
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/views/error/403.vue'),
    meta: {
      public: true,
      title: '无权限',
    },
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('@/views/error/404.vue'),
    meta: {
      public: true,
      title: '页面不存在',
    },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/404',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

// 路由守卫
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  // 设置页面标题
  if (to.meta.title) {
    document.title = `${to.meta.title} - 辰航卓越 HRMS`;
  }

  // 公开路由直接放行
  if (to.meta.public) {
    // 已登录用户访问登录页，重定向到首页
    if (to.path === '/login' && authStore.isLoggedIn) {
      next('/');
      return;
    }
    next();
    return;
  }

  // 非公开路由：检查是否已登录
  if (!authStore.isLoggedIn) {
    ElMessage.warning('请先登录');
    next({ path: '/login', query: { redirect: to.fullPath } });
    return;
  }

  // 已登录但没有用户信息（如刷新页面后）：先拉取用户信息
  if (!authStore.userInfo) {
    const success = await authStore.fetchCurrentUser();
    if (!success) {
      ElMessage.error('获取用户信息失败，请重新登录');
      authStore.clearAuth();
      next({ path: '/login', query: { redirect: to.fullPath } });
      return;
    }
  }

  next();
});

export default router;
