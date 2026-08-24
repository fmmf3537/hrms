import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 为被测模块（间接 import lib/env.ts 会校验环境变量）提供合法的测试环境变量
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/hrms_test',
      REDIS_URL: 'redis://localhost:6401',
      JWT_SECRET: 'vitest-jwt-secret-vitest-jwt-secret',
      JWT_REFRESH_SECRET: 'vitest-refresh-secret-vitest-refresh',
    },
  },
});
