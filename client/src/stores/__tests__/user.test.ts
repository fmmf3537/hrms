/**
 * user store 状态机单测（M5-2-0）
 * 不 mock API：直接写入 userInfo，logout 在无 refresh token 时只清本地
 */
import { createPinia, setActivePinia } from 'pinia';
import { useUserStore } from '@/stores/user';
import { clearToken } from '@/utils/auth';
import type { UserInfo } from '@/api/types';

interface Case {
  name: string;
  fn: () => void | Promise<void>;
}

const cases: Case[] = [];

function describe(_name: string, fn: () => void): void {
  fn();
}

function it(name: string, fn: () => void | Promise<void>): void {
  cases.push({ name, fn });
}

function expectEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function mockUser(role: string): UserInfo {
  return {
    id: 'u1',
    username: 'admin',
    email: null,
    phone: null,
    status: 'active',
    mustChangePassword: false,
    roles: [role],
    permissions: ['*'],
    companyId: null,
    departmentId: null,
    employee: { id: 'e1', employeeNo: 'CH001', name: '管理员' },
  };
}

describe('stores/user.ts', () => {
  it('写入 userInfo 后 role / permissions / 登录态更新', () => {
    setActivePinia(createPinia());
    clearToken();
    const store = useUserStore();
    store.userInfo = mockUser('admin');
    expectEqual(store.userInfo?.username, 'admin', 'username');
    expectEqual(store.role, 'admin', 'role');
    expectEqual(store.permissions[0], '*', 'permissions');
    expectEqual(store.displayName, '管理员', 'displayName');
    expectEqual(store.isLoggedIn, true, 'isLoggedIn');
  });

  it('logout 清空 userInfo', async () => {
    setActivePinia(createPinia());
    clearToken();
    const store = useUserStore();
    store.userInfo = mockUser('hr');
    await store.logout();
    expectEqual(store.userInfo, null, 'userInfo');
    expectEqual(store.isLoggedIn, false, 'isLoggedIn');
  });
});

export async function runUserStoreTests(): Promise<number> {
  await Promise.all(cases.map((item) => item.fn()));
  return cases.length;
}

export const userTestCount = cases.length;
