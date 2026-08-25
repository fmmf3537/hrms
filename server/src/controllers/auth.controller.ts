import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as authService from '../services/auth.service';

/**
 * POST /api/auth/login
 * 审计埋点已下沉到 auth.service.login（成功与失败均记录）
 * mustChangePassword=true → HTTP 403 + 10112，但仍返回 tokens 供改密页使用
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body as { username: string; password: string };
  const result = await authService.login(username, password, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });

  if (result.user.mustChangePassword) {
    res.status(403).json({
      success: false,
      error: '必须先修改密码',
      code: 10112,
      data: result,
    });
    return;
  }

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

/**
 * POST /api/auth/change-password
 * 自助改密（允许 mustChangePassword=true 用户调用）
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body as {
    oldPassword: string;
    newPassword: string;
  };
  await authService.changePassword(req.user!.userId, oldPassword, newPassword, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });
  res.json({ success: true, message: '密码已修改，请重新登录' });
});

/**
 * POST /api/auth/force-change-password
 * Admin 强制目标用户下次登录改密
 */
export const forceChangePassword = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.body as { userId: string };
  await authService.forceChangePassword(req.user!.userId, userId);
  res.json({ success: true, message: '已强制该用户下次登录改密' });
});

/**
 * POST /api/auth/request-2fa
 */
export const request2fa = asyncHandler(async (req: Request, res: Response) => {
  const { channel } = req.body as { channel: 'sms' | 'email' };
  const result = await authService.request2fa(req.user!.userId, channel);
  res.json({ success: true, data: result });
});

/**
 * POST /api/auth/verify-2fa
 */
export const verify2fa = asyncHandler(async (req: Request, res: Response) => {
  const { channel, code } = req.body as { channel: 'sms' | 'email'; code: string };
  const result = await authService.verify2fa(req.user!.userId, channel, code);
  res.json({ success: true, data: result });
});
