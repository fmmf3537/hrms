import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as auditService from '../services/audit.service';
import * as authService from '../services/auth.service';

/**
 * POST /api/auth/login
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body as { username: string; password: string };
  const result = await authService.login(username, password);

  // M0-08 示范埋点：登录成功写审计日志（fire-and-forget，失败不影响登录响应）
  auditService.auditLog({
    userId: result.user.id,
    action: auditService.AUDIT_ACTIONS.LOGIN,
    resourceType: 'Auth',
    resourceId: result.user.id,
    description: `用户 ${result.user.username} 登录成功`,
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    status: auditService.AUDIT_STATUS.SUCCESS,
  }).catch(() => {
    // auditLog 内部已兜底，此处仅防御性吞掉异常，保证不阻塞登录响应
  });

  res.json({
    success: true,
    message: '登录成功',
    data: result,
  });
});

/**
 * POST /api/auth/refresh
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
