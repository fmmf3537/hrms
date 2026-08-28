// M4-C7: attrition.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { AppError } from '../middleware/errorHandler';

const mocks = vi.hoisted(() => ({
  offboardingFindMany: vi.fn(),
  employeeFindMany: vi.fn(),
  departmentFindMany: vi.fn(),
  alertFindFirst: vi.fn(),
  alertCreate: vi.fn(),
  transaction: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    offboardingRecord: { findMany: mocks.offboardingFindMany },
    employee: { findMany: mocks.employeeFindMany },
    department: { findMany: mocks.departmentFindMany },
    hrCostAlert: {
      findFirst: mocks.alertFindFirst,
      create: mocks.alertCreate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

vi.mock('./notification.service', () => ({
  sendNotification: mocks.sendNotification,
}));

import * as attrition from './attrition.service';

const ACTOR = '11111111-1111-1111-1111-111111111111';
const DEPT = '22222222-2222-2222-2222-222222222222';
const DEPT2 = '33333333-3333-3333-3333-333333333333';
const PERIOD = '2026-01';

function emp(
  id: string,
  departmentId: string,
  status: string,
  extras: Record<string, unknown> = {},
) {
  return {
    id, departmentId, status, deletedAt: null, ...extras,
  };
}

function alertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    alertType: 'attrition_monthly',
    period: PERIOD,
    departmentId: DEPT,
    threshold: 0.05,
    actualValue: 0.2,
    severity: 'critical',
    status: 'active',
    scanAt: new Date('2026-01-15T00:00:00.000Z'),
    contextSnapshot: {},
    ...overrides,
  };
}

/**
 * employee.findMany 按调用顺序：resigned → active → A6 未覆盖 lookup
 */
function stubEmployees(resigned: unknown[], active: unknown[], lookup: unknown[] = []) {
  let call = 0;
  mocks.employeeFindMany.mockImplementation(async () => {
    call += 1;
    if (call === 1) return resigned;
    if (call === 2) return active;
    return lookup;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date('2026-01-15T00:00:00.000Z') });
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    if (key === 'hr_attrition.monthly_threshold' || key === 'monthly_threshold') return 0.05;
    if (key === 'cost_alert.attrition.severity_critical') return 0.1;
    if (key === 'cost_alert.scan.include_deactivated_employees') return false;
    if (key === 'cost_alert.notification.template_attrition') return 'attrition_alert';
    throw new AppError(`配置不存在: ${_c}.${key}`, 404, 70101);
  });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
    hrCostAlert: {
      findFirst: mocks.alertFindFirst,
      create: mocks.alertCreate,
    },
  }));
  mocks.alertFindFirst.mockResolvedValue(null);
  mocks.alertCreate.mockResolvedValue(alertRow());
  mocks.departmentFindMany.mockResolvedValue([{ id: DEPT }, { id: DEPT2 }]);
  mocks.sendNotification.mockResolvedValue({ logId: 'n1', status: 'pending' });
  mocks.offboardingFindMany.mockResolvedValue([{ employeeId: 'r1' }]);
  stubEmployees(
    [emp('r1', DEPT, 'resigned')],
    [
      emp('a1', DEPT, 'active'),
      emp('a2', DEPT, 'active'),
      emp('a3', DEPT, 'active'),
      emp('a4', DEPT, 'active'),
    ],
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('attrition.service', () => {
  describe('scanAttritionAlerts', () => {
    it('attritionRate > 0.10 创建 critical 预警', async () => {
      // 1 resigned + 4 active = 0.2
      const r = await attrition.scanAttritionAlerts(ACTOR, PERIOD);
      expect(r.alertCount).toBe(1);
      expect(mocks.alertCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            alertType: 'attrition_monthly',
            severity: 'critical',
            actualValue: 0.2,
          }),
        }),
      );
    });

    it('attritionRate 0.05-0.10 创建 warning 预警', async () => {
      // 1 resigned + 14 active = 1/15 ≈ 0.0667
      const actives = Array.from({ length: 14 }, (_, i) => emp(`a${i}`, DEPT, 'active'));
      stubEmployees([emp('r1', DEPT, 'resigned')], actives);
      mocks.alertCreate.mockResolvedValue(alertRow({ severity: 'warning', actualValue: 0.0667 }));
      await attrition.scanAttritionAlerts(ACTOR, PERIOD);
      expect(mocks.alertCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ severity: 'warning' }),
        }),
      );
      const ratio = mocks.alertCreate.mock.calls[0][0].data.actualValue as number;
      expect(ratio).toBeGreaterThan(0.05);
      expect(ratio).toBeLessThanOrEqual(0.1);
    });

    it('attritionRate < 0.05 不创建预警', async () => {
      const actives = Array.from({ length: 30 }, (_, i) => emp(`a${i}`, DEPT, 'active'));
      stubEmployees([emp('r1', DEPT, 'resigned')], actives);
      const r = await attrition.scanAttritionAlerts(ACTOR, PERIOD);
      expect(r.alertCount).toBe(0);
      expect(mocks.alertCreate).not.toHaveBeenCalled();
    });

    it('A6 + M1 resigned 取并集（按 employeeId 去重）', async () => {
      mocks.offboardingFindMany.mockResolvedValue([{ employeeId: 'r1' }]);
      stubEmployees([emp('r1', DEPT, 'resigned')], [emp('a1', DEPT, 'active')]);
      await attrition.scanAttritionAlerts(ACTOR, PERIOD);
      const snap = mocks.alertCreate.mock.calls[0][0].data.contextSnapshot;
      expect(snap.resignedCount).toBe(1);
    });

    it('M1 兜底：仅有 A6 时也正确计算', async () => {
      mocks.offboardingFindMany.mockResolvedValue([{ employeeId: 'r9' }]);
      stubEmployees([], [emp('a1', DEPT, 'active')], [emp('r9', DEPT, 'resigned')]);
      await attrition.scanAttritionAlerts(ACTOR, PERIOD);
      const snap = mocks.alertCreate.mock.calls[0][0].data.contextSnapshot;
      expect(snap.resignedCount).toBe(1);
      expect(snap.activeCount).toBe(1);
    });

    it('M1 兜底：仅有 M1 resignationDate 时也正确计算', async () => {
      mocks.offboardingFindMany.mockResolvedValue([]);
      stubEmployees(
        [emp('r1', DEPT, 'resigned')],
        [emp('a1', DEPT, 'active'), emp('a2', DEPT, 'active')],
      );
      await attrition.scanAttritionAlerts(ACTOR, PERIOD);
      const snap = mocks.alertCreate.mock.calls[0][0].data.contextSnapshot;
      expect(snap.resignedCount).toBe(1);
      expect(snap.activeCount).toBe(2);
    });

    it('按部门聚合（每个部门独立计算 rate）', async () => {
      mocks.offboardingFindMany.mockResolvedValue([{ employeeId: 'r1' }]);
      stubEmployees(
        [emp('r1', DEPT, 'resigned')],
        [
          emp('a1', DEPT, 'active'),
          emp('b1', DEPT2, 'active'),
          emp('b2', DEPT2, 'active'),
          emp('b3', DEPT2, 'active'),
          emp('b4', DEPT2, 'active'),
        ],
      );
      await attrition.scanAttritionAlerts(ACTOR, PERIOD);
      expect(mocks.alertCreate).toHaveBeenCalledTimes(1);
      expect(mocks.alertCreate.mock.calls[0][0].data.departmentId).toBe(DEPT);
    });

    it('period 格式错抛 73707', async () => {
      await expect(attrition.scanAttritionAlerts(ACTOR, '202601'))
        .rejects.toMatchObject({ statusCode: 400, code: 73707 });
    });

    it('通知走 notification.sendNotification（mock）', async () => {
      await attrition.scanAttritionAlerts(ACTOR, PERIOD);
      expect(mocks.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          templateKey: 'attrition_alert',
          bypassTemplate: expect.objectContaining({ channel: 'email' }),
        }),
      );
    });

    it('audit 记录 alertType=attrition_monthly + actorType', async () => {
      await attrition.scanAttritionAlerts(ACTOR, PERIOD);
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COST_ALERT_SCAN',
          actorType: 'USER',
          newValue: expect.objectContaining({ alertType: 'attrition_monthly', period: PERIOD }),
        }),
      );
    });
  });
});
