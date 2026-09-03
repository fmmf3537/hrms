import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as authController from '../controllers/auth.controller';
import { authenticate, requirePermission, requireRole } from '../middleware/auth';
import {
  loginLimiter, refreshLimiter, request2faLimiter, verify2faLimiter,
} from '../middleware/rate-limit';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

const loginSchema = z.object({
  username: z.string().min(2, '用户名至少 2 位').max(50),
  password: z.string().min(6, '密码至少 6 位'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, '缺少 refreshToken'),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8, '新密码至少 8 位'),
});

const forceChangePasswordSchema = z.object({
  userId: z.string().uuid(),
});

const twoFaSchema = z.object({
  channel: z.enum(['sms', 'email']),
});

const verify2faSchema = z.object({
  channel: z.enum(['sms', 'email']),
  code: z.string().min(4).max(10),
});

router.post('/login', loginLimiter, validate(loginSchema), authController.login);

router.post('/refresh', refreshLimiter, validate(refreshSchema), authController.refresh);

router.post(
  '/logout',
  authenticate,
  validate(z.object({ refreshToken: z.string().optional() })),
  authController.logout,
);

router.get('/me', authenticate, authController.me);

/** 自助改密 — 允许 mustChangePassword=true */
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword,
);

/** Admin 强制目标用户下次登录改密 */
router.post(
  '/force-change-password',
  authenticate,
  requireRole('admin'),
  validate(forceChangePasswordSchema),
  authController.forceChangePassword,
);

router.post(
  '/request-2fa',
  authenticate,
  request2faLimiter,
  validate(twoFaSchema),
  authController.request2fa,
);

router.post(
  '/verify-2fa',
  authenticate,
  verify2faLimiter,
  validate(verify2faSchema),
  authController.verify2fa,
);

router.get(
  '/permission-demo',
  authenticate,
  requirePermission(PERMISSIONS.SALARY_READ),
  authController.permissionDemo,
);

export default router;
