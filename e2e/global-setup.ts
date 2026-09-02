/**
 * E2E Global Setup（M5-02）
 * @file e2e/global-setup.ts
 * @description
 *  1. 校验 3000/5173 可达
 *  2. 若 e2e/.auth/admin.json 中 token 仍有效，直接复用（避免触发登录限流 429）
 *  3. 否则 API 登录拿 token + user，写入 storageState
 *
 * 实读 client/src/utils/auth.ts：
 *  ACCESS_TOKEN_KEY = 'hrms_access_token'
 *  REFRESH_TOKEN_KEY = 'hrms_refresh_token'
 */
import { type FullConfig } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  API_BASE,
  CLIENT_BASE,
  STORAGE_STATE,
  apiLogin,
  waitForUrl,
} from './helpers';

/** 从 JWT 解析 exp（秒），并判断是否仍有效（留 30s 安全余量）*/
function getTokenExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString()) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  console.log('[global-setup] 等待服务可达...');
  await waitForUrl(`${API_BASE}/api/health`);
  await waitForUrl(CLIENT_BASE);

  // 尝试复用已有 storageState（避免触发登录限流 429）
  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  if (existsSync(STORAGE_STATE)) {
    try {
      const prev = JSON.parse(readFileSync(STORAGE_STATE, 'utf8')) as {
        origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
      };
      const ls = prev.origins?.[0]?.localStorage ?? [];
      accessToken = ls.find((x) => x.name === 'hrms_access_token')?.value;
      refreshToken = ls.find((x) => x.name === 'hrms_refresh_token')?.value;
      const exp = accessToken ? getTokenExp(accessToken) : null;
      if (accessToken && refreshToken && exp && exp * 1000 - 30_000 > Date.now()) {
        console.log(`[global-setup] 复用已有 token（exp=${new Date(exp * 1000).toISOString()}）`);
      } else {
        accessToken = undefined;
        refreshToken = undefined;
      }
    } catch {
      accessToken = undefined;
      refreshToken = undefined;
    }
  }

  if (!accessToken || !refreshToken) {
    console.log('[global-setup] API 登录 admin...');
    const login = await apiLogin(ADMIN_USERNAME, ADMIN_PASSWORD);
    accessToken = login.accessToken;
    refreshToken = login.refreshToken;
    console.log(
      `[global-setup] 登录成功 user=${login.user?.username} employee=${login.user?.employee?.employeeNo ?? '-'}`,
    );
  }

  // 写 storageState（client 通过 localStorage 读 token；origin 必须为客户端 baseURL）
  const state = {
    cookies: [],
    origins: [
      {
        origin: CLIENT_BASE,
        localStorage: [
          { name: 'hrms_access_token', value: accessToken },
          { name: 'hrms_refresh_token', value: refreshToken },
        ],
      },
    ],
  };

  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  writeFileSync(STORAGE_STATE, JSON.stringify(state, null, 2), 'utf8');
  console.log(`[global-setup] storageState 已写入 ${STORAGE_STATE}`);
}
