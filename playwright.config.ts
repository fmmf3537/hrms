/**
 * Playwright E2E 配置（M5-02 / M5-12 远程实例回归）
 * @file playwright.config.ts
 * @description 5 条主流程 E2E；默认 webServer 双服务（server + client）；Chromium headless
 *
 * 运行：pnpm test:e2e
 * 远程实例回归（已部署的 8081 / 云上）：
 *   $env:E2E_REMOTE='1'; $env:E2E_CLIENT_BASE='http://IP:8081'; $env:E2E_API_BASE='http://IP:8081'; $env:E2E_ADMIN_PASSWORD='...'
 *   pnpm test:e2e
 * 单条：pnpm test:e2e --grep "登录"
 */
import { defineConfig, devices } from '@playwright/test';

const REMOTE = process.env.E2E_REMOTE === '1';
const PORTAL = process.env.E2E_CLIENT_BASE ?? 'http://localhost:5173';
const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:3000';

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
  webServer: REMOTE
    ? [] // 远程实例已运行，不启动本地服务
    : [
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
