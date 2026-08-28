// M4-C7: overtime_ratio.service 单元测试
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
  payslipFindMany: vi.fn(),
  overtimeFindMany: vi.fn(),
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
    payslip: { findMany: mocks.payslipFindMany },
    overtimeRequest: { findMany: mocks.overtimeFindMany },
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

import * as overtimeRatio from './overtime_ratio.service';

const ACTOR = '11111111-1111-1111-1111-111111111111';
const DEPT = '22222222-2222-2222-2222-222222222222';
const DEPT2 = '33333333-3333-3333-3333-333333333333';
const PERIOD = '2026-01';

function slip(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ps1',
    employeeId: 'e1',
    period: PERIOD,
    status: 'approved',
    grossAmount: 10000,
    overtimeAmount: 4000,
    employee: {
      id: 'e1', departmentId: DEPT, status: 'active', deletedAt: null,
    },
    items: [{ itemType: 'earning_overtime', amount: 4000 }],
    ...overrides,
  };
}

function alertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    alertType: 'overtime_ratio',
    period: PERIOD,
    departmentId: DEPT,
    threshold: 0.2,
    actualValue: 0.4,
    severity: 'critical',
    status: 'active',
    scanAt: new Date('2026-01-15T00:00:00.000Z'),
    contextSnapshot: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date('2026-01-15T00:00:00.000Z') });
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    if (key === 'hr_attrition.overtime_ratio_threshold' || key === 'overtime_ratio_threshold') return 0.2;
    if (key === 'cost_alert.overtime_ratio.severity_critical') return 0.3;
    if (key === 'cost_alert.scan.include_deactivated_employees') return false;
    if (key === 'cost_alert.notification.template_overtime') return 'overtime_ratio_alert';
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
  mocks.overtimeFindMany.mockResolvedValue([]);
  mocks.departmentFindMany.mockResolvedValue([{ id: DEPT }, { id: DEPT2 }]);
  mocks.sendNotification.mockResolvedValue({ logId: 'n1', status: 'pending' });
  mocks.payslipFindMany.mockResolvedValue([slip()]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('overtime_ratio.service', () => {
  describe('scanOvertimeRatioAlerts', () => {
    it('overtimeRatio > 0.30 创建 critical 预警', async () => {
      const r = await overtimeRatio.scanOvertimeRatioAlerts(ACTOR, PERIOD);
      expect(r.alertCount).toBe(1);
      expect(mocks.alertCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            alertType: 'overtime_ratio',
            period: PERIOD,
            departmentId: DEPT,
            severity: 'critical',
            status: 'active',
            actualValue: 0.4,
          }),
        }),
      );
    });

    it('overtimeRatio 0.20-0.30 创建 warning 预警', async () => {
      mocks.payslipFindMany.mockResolvedValue([slip({
        overtimeAmount: 2500,
        items: [{ itemType: 'earning_overtime', amount: 2500 }],
      })]);
      mocks.alertCreate.mockResolvedValue(alertRow({ severity: 'warning', actualValue: 0.25 }));
      await overtimeRatio.scanOvertimeRatioAlerts(ACTOR, PERIOD);
      expect(mocks.alertCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ severity: 'warning', actualValue: 0.25 }),
        }),
      );
    });

    it('overtimeRatio < 0.20 不创建预警', async () => {
      mocks.payslipFindMany.mockResolvedValue([slip({
        overtimeAmount: 1000,
        items: [{ itemType: 'earning_overtime', amount: 1000 }],
      })]);
      const r = await overtimeRatio.scanOvertimeRatioAlerts(ACTOR, PERIOD);
      expect(r.alertCount).toBe(0);
      expect(mocks.alertCreate).not.toHaveBeenCalled();
    });

    it('按部门聚合（每个部门独立计算 ratio）', async () => {
      mocks.payslipFindMany.mockResolvedValue([
        slip(),
        slip({
          id: 'ps2',
          employeeId: 'e2',
          overtimeAmount: 500,
          items: [{ itemType: 'earning_overtime', amount: 500 }],
          employee: {
            id: 'e2', departmentId: DEPT2, status: 'active', deletedAt: null,
          },
        }),
      ]);
      await overtimeRatio.scanOvertimeRatioAlerts(ACTOR, PERIOD);
      expect(mocks.alertCreate).toHaveBeenCalledTimes(1);
      expect(mocks.alertCreate.mock.calls[0][0].data.departmentId).toBe(DEPT);
    });

    it('去重：同 (period, departmentId) 已有 active 不重复', async () => {
      mocks.alertFindFirst.mockResolvedValue(alertRow());
      const r = await overtimeRatio.scanOvertimeRatioAlerts(ACTOR, PERIOD);
      expect(r.alertCount).toBe(0);
      expect(mocks.alertCreate).not.toHaveBeenCalled();
    });

    it('period 格式错抛 73707', async () => {
      await expect(overtimeRatio.scanOvertimeRatioAlerts(ACTOR, '2026/01'))
        .rejects.toMatchObject({ statusCode: 400, code: 73707 });
    });

    it('阈值配置缺失抛 73708', async () => {
      mocks.getValue.mockRejectedValue(new AppError('配置不存在', 404, 70101));
      await expect(overtimeRatio.scanOvertimeRatioAlerts(ACTOR, PERIOD))
        .rejects.toMatchObject({ statusCode: 400, code: 73708 });
    });

    it('payslips 数据缺失抛 73704', async () => {
      mocks.payslipFindMany.mockResolvedValue([]);
      await expect(overtimeRatio.scanOvertimeRatioAlerts(ACTOR, PERIOD))
        .rejects.toMatchObject({ statusCode: 400, code: 73704 });
    });

    it('通知走 notification.sendNotification（mock）', async () => {
      await overtimeRatio.scanOvertimeRatioAlerts(ACTOR, PERIOD);
      expect(mocks.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          templateKey: 'overtime_ratio_alert',
          userId: ACTOR,
          bypassTemplate: expect.objectContaining({ channel: 'email' }),
        }),
      );
    });

    it('audit 记录 alertType=overtime_ratio + actorType', async () => {
      await overtimeRatio.scanOvertimeRatioAlerts(ACTOR, PERIOD);
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COST_ALERT_SCAN',
          actorType: 'USER',
          resourceType: 'hr_cost_alert',
          newValue: expect.objectContaining({ alertType: 'overtime_ratio', period: PERIOD }),
        }),
      );
    });
  });
});
