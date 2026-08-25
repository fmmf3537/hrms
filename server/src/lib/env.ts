import dotenv from 'dotenv';
import { z } from 'zod';

// 加载 .env 文件（monorepo 根目录）
dotenv.config();

/**
 * 禁止在生产环境使用的默认 / 占位 secret。
 * 命中任一即视为配置错误，进程直接退出。
 * 注意：必须先解析 NODE_ENV 才能把这一约束挂到后续字段上。
 */
const FORBIDDEN_SECRET_FRAGMENTS = ['dev-only', 'change-in-prod', 'changeme'];

const isForbiddenSecret = (v: string): boolean => FORBIDDEN_SECRET_FRAGMENTS.some(
  (frag) => v.toLowerCase().includes(frag),
);

// 第一步：只解析 NODE_ENV，用于决定后续 secret 校验强度
const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const baseParse = baseEnvSchema.safeParse(process.env);
if (!baseParse.success) {
  console.error('❌ Invalid environment variables:');
  baseParse.error.issues.forEach((issue) => {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}
const isProd = baseParse.data.NODE_ENV === 'production';

// 环境变量验证 schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform((val) => parseInt(val, 10)),

  // 数据库
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6401'),

  // JWT 配置
  // 生产环境强制禁止 dev-only / changeme 等默认值，避免凭示例文档上线
  JWT_SECRET: z.string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .refine((v) => !isProd || !isForbiddenSecret(v), {
      message: `JWT_SECRET in production must not contain any of: ${FORBIDDEN_SECRET_FRAGMENTS.join(', ')}`,
    }),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters')
    .refine((v) => !isProd || !isForbiddenSecret(v), {
      message: `JWT_REFRESH_SECRET in production must not contain any of: ${FORBIDDEN_SECRET_FRAGMENTS.join(', ')}`,
    }),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

// 验证环境变量
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:');
  parsedEnv.error.issues.forEach((issue) => {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

// 导出验证后的环境变量
export const env = parsedEnv.data;

export default env;
