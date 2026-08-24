import type { Request, Response, NextFunction } from 'express';
import { z, type ZodSchema, type ZodError } from 'zod';

import { AppError } from './errorHandler';

/**
 * 格式化 Zod 错误信息
 */
const formatZodError = (error: ZodError): string => {
  const errors = error.errors.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });
  return errors.join('; ');
};

/**
 * 请求参数验证中间件
 * @param schema Zod 验证 schema
 * @param source 验证的数据来源: 'body' | 'query' | 'params'
 */
export const validate = (
  schema: ZodSchema,
  source: 'body' | 'query' | 'params' = 'body',
) => (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const data: unknown = req[source];
    const result = schema.safeParse(data);

    if (!result.success) {
      const errorMessage = formatZodError(result.error);
      throw new AppError(errorMessage, 400);
    }

    // 将验证后的数据替换到请求对象
    const parsedData: unknown = result.data;
    req[source] = parsedData;
    next();
  } catch (error) {
    next(error);
  }
};

// 密码策略：至少 8 位，需同时包含大小写字母、数字和特殊字符
// 仅用于"设置新密码"场景；登录等校验既有密码的场景不使用
export const passwordSchema = z
  .string()
  .min(8, '密码至少 8 位字符')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, '密码需同时包含大小写字母、数字和特殊字符');

export default validate;
