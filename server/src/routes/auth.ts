import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as authController from '../controllers/auth.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { loginLimiter, refreshLimiter } from '../middleware/rate-limit';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

// 登录请求验证 schema
const loginSchema = z.object({
  username: z.string().min(2, '用户名至少 2 位').max(50),
  password: z.string().min(6, '密码至少 6 位'),
});

// 刷新令牌请求验证 schema
const refreshSchema = z.object({
  refreshToken: z.string().min(1, '缺少 refreshToken'),
});

/**
 * POST /api/auth/login
 * 用户登录（username + password）
 */
router.post('/login', loginLimiter, validate(loginSchema), authController.login);

/**
 * POST /api/auth/refresh
 * 刷新 Access Token（同时换新 refreshToken，原 token 立即失效）
 */
router.post('/refresh', refreshLimiter, validate(refreshSchema), authController.refresh);

/**
 * POST /api/auth/logout
 * 用户登出（删除 Redis 中的 refresh token）
 */
router.post(
  '/logout',
  authenticate,
  validate(z.object({ refreshToken: z.string().optional() })),
  authController.logout,
);

/**
 * GET /api/auth/me
 * 获取当前登录用户信息
 */
router.get('/me', authenticate, authController.me);

/**
 * GET /api/auth/permission-demo
 * M0-07 联调用：仅拥有 salary:read（或 admin 通配）的用户可访问
 * M1 正式业务模块路由将自行挂载 requirePermission
 */
router.get(
  '/permission-demo',
  authenticate,
  requirePermission(PERMISSIONS.SALARY_READ),
  authController.permissionDemo,
);

export default router;
