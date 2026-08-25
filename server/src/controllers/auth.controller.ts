import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as authService from '../services/auth.service';

/**
 * POST /api/auth/login
 * 审计埋点已下沉到 auth.service.login（成功与失败均记录）
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body as { username: string; password: string };
  const result = await authService.login(username, password, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });

  res.json({
    success: true,
    message: '登录成功',
    data: result,
  });
});

/**
 * POST /api/auth/refresh
 * 每次刷新都换发新 refreshToken（rotation），旧 token 立即失效
 */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken: string };
  const result = await authService.refresh(refreshToken);
  res.json({
    success: true,
    data: result,
  });
});

/**
 * POST /api/auth/logout
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  await authService.logout(req.user!.userId, refreshToken);
  res.json({
    success: true,
    message: '登出成功',
  });
});

/**
 * GET /api/auth/me
 */
export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.me(req.user!.userId);
  res.json({
    success: true,
    data: { user },
  });
});

/**
 * GET /api/auth/permission-demo
 * M0-07 联调用：返回当前用户的权限点（由 requirePermission('salary:read') 保护）
 */
export const permissionDemo = (req: Request, res: Response): void => {
  res.json({
    success: true,
    data: {
      userId: req.user!.userId,
      username: req.user!.username,
      permissions: req.user!.permissions,
    },
  });
};
