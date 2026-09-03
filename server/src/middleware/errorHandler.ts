import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

import { logger } from '../lib/logger';

// 自定义应用错误类
export class AppError extends Error {
  public statusCode: number;

  public code?: number;

  constructor(message: string, statusCode: number = 500, code?: number) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 快速创建操作错误
 */
export const createError = (message: string, statusCode: number = 500): AppError => new AppError(message, statusCode);

// Prisma 错误码映射
const prismaErrorMap: Record<string, { message: string; statusCode: number }> = {
  P2002: { message: '记录已存在', statusCode: 409 },
  P2003: { message: '外键约束失败', statusCode: 400 },
  P2025: { message: '记录不存在', statusCode: 404 },
  P2014: { message: '关联关系错误', statusCode: 400 },
};

/**
 * 全局错误处理中间件
 */
export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  // 默认错误信息
  let message = '服务器内部错误';
  let statusCode = 500;
  let code: number | undefined;
  let details: unknown;

  // 处理自定义应用错误
  if (err instanceof AppError) {
    message = err.message;
    statusCode = err.statusCode;
    code = err.code;
  } else if (err instanceof ZodError) {
    // 处理 Zod 验证错误
    message = '请求参数验证失败';
    statusCode = 400;
    details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
  } else if ((err as Error & { type?: string }).type === 'entity.parse.failed') {
    // M5-04: body-parser 坏 JSON → 应 400（原落入通用 500）
    message = '请求体 JSON 解析失败';
    statusCode = 400;
  } else if ((err as Error & { type?: string }).type === 'entity.too.large') {
    // M5-04: body-parser 超限（limit 10mb）→ 应 413（原落入通用 500）
    message = '请求体超过大小限制';
    statusCode = 413;
  } else if ((err as Error & { type?: string }).type === 'charset.unsupported') {
    message = '不支持的字符集';
    statusCode = 415;
  } else if (err.name === 'PrismaClientKnownRequestError') {
    // 处理 Prisma 错误
    const prismaError = err as Error & { code: string };
    const errorInfo = prismaErrorMap[prismaError.code];

    if (errorInfo) {
      message = errorInfo.message;
      statusCode = errorInfo.statusCode;
    } else {
      message = `数据库错误: ${prismaError.code}`;
    }

    if (process.env.NODE_ENV === 'development') {
      logger.error({ err: prismaError }, '[Prisma Error]');
    }
  } else if (err.name === 'JsonWebTokenError') {
    // 处理 JWT 错误
    message = '无效的令牌';
    statusCode = 401;
  } else if (err.name === 'TokenExpiredError') {
    message = '令牌已过期';
    statusCode = 401;
  }

  // 开发环境输出详细错误（结构化日志）
  if (process.env.NODE_ENV === 'development') {
    logger.error({ err }, '[Error]');
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    code: code || statusCode,
    ...(details !== undefined && { details }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

/**
 * 异步路由处理包装器
 * 自动捕获 async 函数中的错误
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;

export const asyncHandler = (fn: AsyncRequestHandler) => (req: Request, res: Response, next: NextFunction): void => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 404 路由处理
 */
export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: '请求的资源不存在',
    code: 404,
  });
};
