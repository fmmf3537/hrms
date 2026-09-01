/**
 * Vue Router 4 路由表（M5-2-0 共享基础设施）
 * @module router/index
 * @description /login 公开；/ 默认布局 + dashboard；M1-M4 业务路由留 M5-2-A/B/C/D
 * @auth 未登录访问需登录页；已登录访问 /login 回工作台
 * 注意：子路由 meta 默认不合并，守卫必须用 to.matched 判断 requiresAuth
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { getToken } from '@/utils/auth';
import organizationRoutes from './organization';
import attendanceRoutes from './attendance';
import salaryRoutes from './salary';
import performanceRoutes from './performance';

export interface AuthGuardResult {
  type: 'login' | 'dashboard' | 'allow';
  redirect?: string;
}

/**
 * 纯函数路由守卫（供单测，不依赖 Vue Router 实例）
 * 校验链：
 *  1. 目标需要登录 && 无 token → /login?redirect=*
 *  2. 目标是 Login && 有 token → /dashboard
 *  3. 其他 → 放行
 */
export function resolveAuthGuard(
  toName: string | symbol | undefined | null,
  requiresAuth: boolean,
  token: string | null,
  fullPath: string,
): AuthGuardResult {
  if (requiresAuth && !token) {
    return { type: 'login', redirect: fullPath };
  }
  if (toName === 'Login' && token) {
    return { type: 'dashboard' };
  }
  return { type: 'allow' };
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/dashboard' },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '工作台' },
      },
      // M5-2-A/B/C/D 子切片追加业务模块路由
    ],
  },
  ...organizationRoutes,
  ...attendanceRoutes,
  ...salaryRoutes,
  ...performanceRoutes,
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach((to, _from, next) => {
  if (to.meta.title) {
    document.title = `${String(to.meta.title)} - 辰航卓越 HRMS`;
  }

  const token = getToken();
  const requiresAuth = to.matched.some((record) => Boolean(record.meta.requiresAuth));
  const decision = resolveAuthGuard(to.name, requiresAuth, token, to.fullPath);

  if (decision.type === 'login') {
    next({ name: 'Login', query: { redirect: decision.redirect } });
    return;
  }
  if (decision.type === 'dashboard') {
    next({ name: 'Dashboard' });
    return;
  }
  next();
});

export default router;
