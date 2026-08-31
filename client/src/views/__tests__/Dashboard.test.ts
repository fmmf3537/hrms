/**
 * Dashboard 5 角色模块入口单测（M5-2-0）
 * 不引入 @vue/test-utils（未安装）；测 getDashboardModules 过滤逻辑
 */
import { getDashboardModules } from '@/utils/permission';
import Dashboard from '@/views/Dashboard.vue';

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

function keysOf(role: Parameters<typeof getDashboardModules>[0]): string {
  return getDashboardModules(role)
    .map((item) => item.key)
    .sort()
    .join(',');
}

describe('views/Dashboard.vue', () => {
  it('5 角色模块入口数量与 key 正确', () => {
    expectEqual(typeof Dashboard, 'object', 'component');
    expectEqual(getDashboardModules('admin').length, 5, 'admin 全开');
    expectEqual(keysOf('hr'), 'attendance,org,performance,salary', 'hr 4');
    expectEqual(keysOf('dept_head'), 'attendance,org,performance', 'dept_head 3');
    expectEqual(keysOf('executive'), 'ai,decision,performance,salary', 'executive');
    expectEqual(getDashboardModules('employee').length, 5, 'employee 自助 5');
    const allRoles: string[] = getDashboardModules('admin').flatMap((item) => item.roles);
    expectEqual(allRoles.includes('finance'), false, '无 finance');
  });

  it('空状态：无角色不渲染模块', () => {
    expectEqual(getDashboardModules(null).length, 0, 'null');
    expectEqual(getDashboardModules(undefined).length, 0, 'undefined');
  });
});

export function runDashboardTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const dashboardTestCount = cases.length;
