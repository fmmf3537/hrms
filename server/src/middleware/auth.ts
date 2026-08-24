import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../lib/env';

import { AppError } from './errorHandler';

// JWT Payload 类型
export interface JwtPayload {
  userId: string;
  username: string;
  companyId: string | null;
  departmentId: string | null;
  roles: string[];
  // 合并后的权限点（服务端从角色派生，admin 为 ['*']）
  permissions: string[];
  // JWT 吊销版本号（预留给"改密即全端下线"，当前 users 表暂无该字段，签发时固定 0）
  tokenVersion?: number;
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
 * JWT 认证中间件
 */
export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) {
      throw new AppError('未提供认证令牌', 401);
    }

    try {
      req.user = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('认证令牌已过期', 401);
      }
      throw new AppError('无效的认证令牌', 401);
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * 角色鉴权中间件：用户 roles 与目标 codes 有交集即放行
 */
export const requireRole = (...codes: string[]) => (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: '未认证',
      code: 401,
    });
    return;
  }

  const hasRole = req.user.roles.some((r) => codes.includes(r));
  if (!hasRole) {
    res.status(403).json({
      success: false,
      error: '没有权限执行此操作',
      code: 403,
    });
    return;
  }

  next();
};

/**
 * 权限点鉴权中间件：用户 permissions 含 '*' 或任一目标权限点即放行
 */
export const requirePermission = (...required: string[]) => (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: '未认证',
      code: 401,
    });
    return;
  }

  const perms = req.user.permissions ?? [];
  const allowed = perms.includes('*') || required.some((p) => perms.includes(p));
  if (!allowed) {
    res.status(403).json({
      success: false,
      error: '没有权限执行此操作',
      code: 403,
    });
    return;
  }

  next();
};
