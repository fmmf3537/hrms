/**
 * 路由守卫单测（M5-2-0）
 * client 未安装 vitest（严禁改 package.json），使用内联断言；可由 runRouterTests() 执行
 */
import { resolveAuthGuard } from '@/router/index';

interface Case {
  name: string;
  fn: () => void;
}

const cases: Case[] = [];

function describe(_name: string, fn: () => void): void {
  fn();
}

function it(name: string, fn: () => void): void {
  cases.push({ name, fn });
}

function expectEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

describe('router/index.ts', () => {
  it('未登录访问需登录路由 → login + redirect', () => {
    const result = resolveAuthGuard('Dashboard', true, null, '/dashboard');
    expectEqual(result.type, 'login', 'type');
    expectEqual(result.redirect, '/dashboard', 'redirect');
  });

  it('已登录访问 /login → dashboard', () => {
    const result = resolveAuthGuard('Login', false, 'mock-token', '/login');
    expectEqual(result.type, 'dashboard', 'type');
  });

  it('已登录访问 /dashboard → allow', () => {
    const result = resolveAuthGuard('Dashboard', true, 'mock-token', '/dashboard');
    expectEqual(result.type, 'allow', 'type');
  });
});

export function runRouterTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const routerTestCount = cases.length;
