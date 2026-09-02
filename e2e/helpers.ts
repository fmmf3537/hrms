/**
 * E2E API 助手 + 通用工具（M5-02）
 * @file e2e/helpers.ts
 * @description API login / get / post；localStorage token 注入；唯一名 + 清理工具
 */
import { type APIRequestContext, request as pwRequest } from '@playwright/test';

export const API_BASE = 'http://localhost:3000';
export const API_PREFIX = '/api';
export const CLIENT_BASE = 'http://localhost:5173';
export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = 'Admin@2026';
export const STORAGE_STATE = 'e2e/.auth/admin.json';

export interface LoginResponse {
  success: boolean;
  data?: {
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      username: string;
      employee?: {
        id: string;
        employeeNo: string;
        name: string;
      };
    };
  };
  message?: string;
  error?: string;
}

let _context: APIRequestContext | null = null;

export async function getContext(): Promise<APIRequestContext> {
  if (_context) {
    return _context;
  }
  _context = await pwRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  });
  return _context;
}

export async function disposeContext(): Promise<void> {
  if (_context) {
    await _context.dispose();
    _context = null;
  }
}

/**
 * 通过后端登录拿 accessToken + refreshToken（不走 UI；单测中直接调用）
 */
export async function apiLogin(
  username: string = ADMIN_USERNAME,
  password: string = ADMIN_PASSWORD,
): Promise<{ accessToken: string; refreshToken: string; user: LoginResponse['data']['user'] }> {
  const ctx = await getContext();
  const res = await ctx.post(`${API_PREFIX}/auth/login`, { data: { username, password } });
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`登录失败 HTTP ${res.status()}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as LoginResponse;
  if (!body.success || !body.data) {
    throw new Error(`登录业务失败: ${body.error || body.message || JSON.stringify(body)}`);
  }
  return {
    accessToken: body.data.accessToken,
    refreshToken: body.data.refreshToken,
    user: body.data.user,
  };
}

/**
 * 带 Bearer token 调 GET；返回 JSON
 */
export async function apiGet<T = unknown>(
  token: string,
  path: string,
  query?: Record<string, unknown>,
): Promise<T> {
  const ctx = await getContext();
  const res = await ctx.get(`${API_PREFIX}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    params: query,
  });
  const body = (await res.json()) as { success: boolean; data?: T; error?: string; message?: string };
  if (!res.ok() || body.success === false) {
    throw new Error(
      `GET ${path} 失败 HTTP ${res.status()}: ${body.error || body.message || JSON.stringify(body).slice(0, 200)}`,
    );
  }
  return body.data as T;
}

/**
 * 带 Bearer token 调 POST；返回 JSON；不抛错（用于前置数据准备时容错）
 */
export async function apiPost<T = unknown>(
  token: string,
  path: string,
  body: Record<string, unknown>,
  opts: { throwOnError?: boolean } = { throwOnError: true },
): Promise<T> {
  const ctx = await getContext();
  const res = await ctx.post(`${API_PREFIX}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
  const data = (await res.json()) as {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    code?: number;
  };
  if (!res.ok() || data.success === false) {
    if (opts.throwOnError !== false) {
      throw new Error(
        `POST ${path} 失败 HTTP ${res.status()}: ${data.error || data.message || JSON.stringify(data).slice(0, 200)}`,
      );
    }
  }
  return data.data as T;
}

/**
 * 生成 E2E-<prefix>-<timestamp> 唯一标识
 */
export function uniqueName(prefix: string): string {
  return `E2E-${prefix}-${Date.now()}`;
}

/**
 * 等待端口可达（用于 webServer 未启动时的容错）
 */
export async function waitForUrl(
  url: string,
  timeoutMs: number = 30000,
  intervalMs: number = 500,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status >= 200 && res.status < 500) {
        return;
      }
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`等待 ${url} 超时 (${timeoutMs}ms)`);
}

/**
 * 业务数据是否在测试期间残留（仅审计用，无副作用）
 */
export function isE2EData(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('E2E-');
}
