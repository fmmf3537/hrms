/**
 * Axios 拦截器纯函数单测（M5-2-0）
 * 不引入 vitest；验证 401 刷新判定与错误文案
 */
import axios from 'axios';
import { getRequestErrorMessage, isAuthLoginOrRefresh, shouldAttemptTokenRefresh } from '@/api/http';

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

describe('api/http.ts', () => {
  it('登录/刷新 URL 不走 token 刷新', () => {
    expectEqual(isAuthLoginOrRefresh('/auth/login'), true, 'login');
    expectEqual(isAuthLoginOrRefresh('/auth/refresh'), true, 'refresh');
    expectEqual(isAuthLoginOrRefresh('/auth/me'), false, 'me');
    expectEqual(shouldAttemptTokenRefresh(401, '/auth/login', false), false, 'skip login 401');
    expectEqual(shouldAttemptTokenRefresh(401, '/auth/me', false), true, 'me 401 refresh');
    expectEqual(shouldAttemptTokenRefresh(401, '/auth/me', true), false, 'already retried');
  });

  it('401 且非登录接口 → 应尝试刷新', () => {
    expectEqual(shouldAttemptTokenRefresh(401, '/employees', false), true, 'employees 401');
    expectEqual(shouldAttemptTokenRefresh(403, '/employees', false), false, '403');
  });

  it('业务错误码优先展示 error/message，无响应则网络异常', () => {
    const withError = {
      isAxiosError: true,
      response: { status: 500, data: { success: false, error: '算薪失败', code: 73401 } },
    };
    expectEqual(getRequestErrorMessage(withError), '算薪失败', 'toast');
    expectEqual(getRequestErrorMessage(new Error('oops')), '网络异常', 'non-axios');
    expectEqual(axios.isAxiosError(withError), true, 'axios flag');
  });
});

export function runHttpTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const httpTestCount = cases.length;
