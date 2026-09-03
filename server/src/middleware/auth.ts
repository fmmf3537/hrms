import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../lib/env';

import { AppError } from './errorHandler';
import { userLimiter } from './rate-limit';

// JWT Payload 类型
export interface JwtPayload {
  userId: string;
  username: string;
  companyId: string | null;
  departmentId: string | null;
  roles: string[];
  // 合并后的权限点（服务端从角色派生，admin 为 ['*']）
  permissions: string[];
  /** 改密即全端下线：与 users.token_version 对齐 */
  tokenVersion: number;
  /** 首次/强制改密标记（业务路由拦截用） */
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// 从 Authorization Header 提取 token
function extractTokenFromHeader(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return undefined;
}

/**
 * JWT 认证中间件（强制 HS256，防算法混淆）
 * M5-09 fix2: verify 成功后串联 userLimiter（300/min，按 userId 取桶），
 *   保证用户级限流真正按人隔离——避免单用户占满 IP 配额拖累全公司。
 */
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) {
      throw new AppError('未提供认证令牌', 401, 10101);
    }

    try {
      req.user = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ['HS256'],
      }) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('认证令牌已过期', 401, 10102);
      }
      throw new AppError('无效的认证令牌', 401, 10103);
    }
    // 认证成功 → 用户级限流（按 userId），超限由 limiter 直接 429
    userLimiter(req, res, (err?: unknown) => {
      if (err) return next(err as Error);
      next();
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 强制改密拦截：mustChangePassword=true 时仅允许改密 / 登出 / me
 * 挂在业务路由组上（不要挂在 /auth/change-password 本身）
 */
export const rejectIfMustChangePassword = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (req.user?.mustChangePassword) {
    next(new AppError('必须先修改密码', 403, 10112));
    return;
  }
  next();
};

/**
 * 角色鉴权中间件：用户 roles 与目标 codes 有交集即放行
 */
export const requireRole = (...codes: string[]) => (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    next(new AppError('未认证', 401, 10101));
    return;
  }

  const hasRole = req.user.roles.some((r) => codes.includes(r));
  if (!hasRole) {
    next(new AppError('没有权限执行此操作', 403, 10120));
    return;
  }

  next();
};

/**
 * 权限点鉴权中间件：用户 permissions 含 '*' 或任一目标权限点即放行
 */
export const requirePermission = (...required: string[]) => (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    next(new AppError('未认证', 401, 10101));
    return;
  }

  const perms = req.user.permissions ?? [];
  const allowed = perms.includes('*') || required.some((p) => perms.includes(p));
  if (!allowed) {
    next(new AppError('没有权限执行此操作', 403, 10121));
    return;
  }

  next();
};
