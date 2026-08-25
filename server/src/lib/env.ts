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

  // 字段加密（M0.5-3）
  // 主密钥：64 个十六进制字符（32 字节）= AES-256
  // 生产环境必须从 KMS 注入，禁止使用 dev-only 默认值
  ENCRYPTION_KEY: z.string()
    .regex(/^[a-f0-9]{64}$/, 'ENCRYPTION_KEY 必须是 64 位十六进制字符串（32 字节）')
    .refine((v) => !isProd || !isForbiddenSecret(v), {
      message: `ENCRYPTION_KEY in production must not contain any of: ${FORBIDDEN_SECRET_FRAGMENTS.join(', ')}`,
    })
    .default(isProd ? '' : 'a'.repeat(64)), // 开发占位（64 个 a），生产必须显式提供

  // 第三方对接（M0.5-4）
  // e-签宝 SaaS API
  ESIGN_APP_ID: z.string().default(''),
  ESIGN_APP_SECRET: z.string().default(''),
  ESIGN_ENDPOINT: z.string().default('https://openapi.esign.cn'),
  // 短信（阿里云 / 腾讯云）
  SMS_PROVIDER: z.enum(['mock', 'aliyun', 'tencent']).default('mock'),
  SMS_ACCESS_KEY: z.string().default(''),
  SMS_ACCESS_SECRET: z.string().default(''),
  SMS_SIGN_NAME: z.string().default(''),
  // 邮件 SMTP
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.string().default('587').transform((v) => parseInt(v, 10)),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_FROM: z.string().default('noreply@chenhang-zhuoyue.local'),
  // LLM 网关
  LLM_PROVIDER: z.enum(['mock', 'openai', 'deepseek', 'tongyi']).default('mock'),
  LLM_API_KEY: z.string().default(''),
  LLM_BASE_URL: z.string().default('https://api.openai.com/v1'),
  LLM_MODEL: z.string().default('gpt-4o-mini'),

  // AI 底座（M0.5-5）
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIM: z.string().default('1536').transform((v) => parseInt(v, 10)),
  LLM_DEFAULT_MODEL: z.string().default('gpt-4o-mini'),
  LLM_MAX_TOKENS_QA: z.string().default('1000').transform((v) => parseInt(v, 10)),
  LLM_MAX_TOKENS_SUMMARY: z.string().default('500').transform((v) => parseInt(v, 10)),
  LLM_TEMPERATURE: z.string().default('0.3').transform((v) => parseFloat(v)),
  AI_QA_TOP_K: z.string().default('5').transform((v) => parseInt(v, 10)),
  AI_SIMILARITY_THRESHOLD: z.string().default('0.7').transform((v) => parseFloat(v)),
  AI_DOCUMENT_CHUNK_SIZE: z.string().default('500').transform((v) => parseInt(v, 10)),
  AI_DOCUMENT_CHUNK_OVERLAP: z.string().default('50').transform((v) => parseInt(v, 10)),
  OCR_PROVIDER: z.enum(['mock', 'tencent', 'baidu']).default('mock'),
  OCR_SECRET_ID: z.string().default(''),
  OCR_SECRET_KEY: z.string().default(''),

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
