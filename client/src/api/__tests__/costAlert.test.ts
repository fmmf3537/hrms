/**
 * 成本预警 API 单测（M5-2-C3）内联断言
 */
import { COST_ALERT_PATHS } from '@/api/costAlert';
import { canCostAlertAction } from '@/api/types/compensation';
import type { UserInfo } from '@/api/types';
import { hasPermission } from '@/utils/permission';

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

function mockUser(roles: string[], permissions: string[]): UserInfo {
  return {
    id: 'u1',
    username: 'tester',
    email: null,
    phone: null,
    status: 'active',
    mustChangePassword: false,
    roles,
    permissions,
    companyId: null,
    departmentId: null,
  };
}

describe('api/costAlert.ts', () => {
  it('COST_ALERT_PATHS 列表为根路径 /salary/cost-alerts', () => {
    expectEqual(COST_ALERT_PATHS.list, '/salary/cost-alerts', 'list root');
    expectEqual(COST_ALERT_PATHS.scan, '/salary/cost-alerts/scan', 'scan');
    expectEqual(COST_ALERT_PATHS.summary, '/salary/cost-alerts/summary', 'summary');
    expectEqual(COST_ALERT_PATHS.acknowledge('a1'), '/salary/cost-alerts/a1/acknowledge', 'ack');
  });

  it('canCostAlertAction + scan 仅 admin/hr', () => {
    const executive = mockUser(['executive'], ['salary:cost-alert:ack']);
    const hr = mockUser(['hr'], ['salary:cost-alert:scan', 'salary:cost-alert:close']);
    const employee = mockUser(['employee'], ['salary:commission:read']);
    expectEqual(
      canCostAlertAction('acknowledge', { status: 'active' }, executive),
      true,
      'ack+executive+active',
    );
    expectEqual(
      canCostAlertAction('close', { status: 'acknowledged' }, executive),
      false,
      'close+executive',
    );
    expectEqual(hasPermission(hr, 'salary:cost-alert:scan'), true, 'scan+hr');
    expectEqual(hasPermission(executive, 'salary:cost-alert:scan'), false, 'scan+executive');
    expectEqual(hasPermission(employee, 'salary:cost-alert:scan'), false, 'scan+employee');
  });
});

export function runCostAlertApiTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const costAlertApiTestCount = cases.length;
