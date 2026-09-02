/**
 * Playwright E2E 配置（M5-02）
 * @file playwright.config.ts
 * @description 5 条主流程 E2E；webServer 双服务（server + client）；Chromium headless
 *
 * 运行：pnpm test:e2e
 * 单条：pnpm test:e2e --grep "登录"
 * 有头：pnpm test:e2e --headed
 * 报告：pnpm exec playwright show-report
 */
import { defineConfig, devices } from '@playwright/test';

const PORTAL = 'http://localhost:5173';
const API_BASE = 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: PORTAL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  expect: {
    timeout: 10000,
  },
  timeout: 60_000,
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
    },
  ],
  globalSetup: './e2e/global-setup.ts',
  webServer: [
    {
      command: 'pnpm --filter hrms-server dev',
      url: `${API_BASE}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter hrms-client dev',
      url: PORTAL,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
