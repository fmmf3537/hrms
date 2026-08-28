// M4-C7: cost_alert.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  alertFindMany: vi.fn(),
  alertFindUnique: vi.fn(),
  alertCount: vi.fn(),
  alertUpdate: vi.fn(),
  userFindUnique: vi.fn(),
  auditLog: vi.fn(),
  scanOvertime: vi.fn(),
  scanAttrition: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    hrCostAlert: {
      findMany: mocks.alertFindMany,
      findUnique: mocks.alertFindUnique,
      count: mocks.alertCount,
      update: mocks.alertUpdate,
    },
    user: { findUnique: mocks.userFindUnique },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./overtime_ratio.service', () => ({
  scanOvertimeRatioAlerts: mocks.scanOvertime,
}));

vi.mock('./attrition.service', () => ({
  scanAttritionAlerts: mocks.scanAttrition,
}));

import * as costAlert from './cost_alert.service';

const ACTOR = '11111111-1111-1111-1111-111111111111';
const DEPT = '22222222-2222-2222-2222-222222222222';
const PERIOD = '2026-01';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    alertType: 'overtime_ratio',
    period: PERIOD,
    departmentId: DEPT,
    threshold: 0.2,
    actualValue: 0.25,
    severity: 'warning',
    status: 'active',
    scanAt: new Date('2026-01-15T00:00:00.000Z'),
    contextSnapshot: {},
    acknowledgedBy: null,
    acknowledgedAt: null,
    acknowledgeNote: null,
    closedBy: null,
    closedAt: null,
    closeReason: null,
    remark: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date('2026-01-15T00:00:00.000Z') });
  mocks.userFindUnique.mockResolvedValue({
    id: ACTOR,
    userRoles: [{ role: { code: 'hr' } }],
    employee: { departmentId: DEPT },
  });
  mocks.alertFindMany.mockResolvedValue([row()]);
  mocks.alertCount.mockResolvedValue(1);
  mocks.alertFindUnique.mockResolvedValue(row());
  mocks.alertUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...row(),
    ...data,
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cost_alert.service', () => {
  describe('listAlerts', () => {
    it('按 alertType + period + status 过滤列表', async () => {
      const r = await costAlert.listAlerts(ACTOR, {
        alertType: 'overtime_ratio',
        period: PERIOD,
        status: 'active',
        page: 1,
        pageSize: 10,
      });
      expect(r.total).toBe(1);
      expect(mocks.alertFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            alertType: 'overtime_ratio', period: PERIOD, status: 'active',
          },
        }),
      );
    });

    it('分页正确（page=1 / pageSize=10）', async () => {
      const r = await costAlert.listAlerts(ACTOR, { page: 1, pageSize: 10 });
      expect(r.page).toBe(1);
      expect(r.pageSize).toBe(10);
      expect(mocks.alertFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('dept_head 仅看本部门（权限过滤）', async () => {
      mocks.userFindUnique.mockResolvedValue({
        id: ACTOR,
        userRoles: [{ role: { code: 'dept_head' } }],
        employee: { departmentId: DEPT },
      });
      await costAlert.listAlerts(ACTOR, { page: 1, pageSize: 10 });
      expect(mocks.alertFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { departmentId: DEPT },
        }),
      );
    });
  });

  describe('acknowledgeAlert', () => {
    it('active → acknowledged 成功', async () => {
      const rec = await costAlert.acknowledgeAlert(ACTOR, 'a1', { note: 'ok' });
      expect(rec.status).toBe('acknowledged');
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'COST_ALERT_ACKNOWLEDGE' }),
      );
    });

    it('已 acknowledged 抛 73706', async () => {
      mocks.alertFindUnique.mockResolvedValue(row({ status: 'acknowledged' }));
      await expect(costAlert.acknowledgeAlert(ACTOR, 'a1'))
        .rejects.toMatchObject({ statusCode: 400, code: 73706 });
    });

    it('closed 状态抛 73702', async () => {
      mocks.alertFindUnique.mockResolvedValue(row({ status: 'closed' }));
      await expect(costAlert.acknowledgeAlert(ACTOR, 'a1'))
        .rejects.toMatchObject({ statusCode: 400, code: 73702 });
    });

    it('alert 不存在抛 73701', async () => {
      mocks.alertFindUnique.mockResolvedValue(null);
      await expect(costAlert.acknowledgeAlert(ACTOR, 'missing'))
        .rejects.toMatchObject({ statusCode: 404, code: 73701 });
    });
  });

  describe('closeAlert', () => {
    it('acknowledged → closed 成功', async () => {
      mocks.alertFindUnique.mockResolvedValue(row({ status: 'acknowledged' }));
      const rec = await costAlert.closeAlert(ACTOR, 'a1', { reason: '已处理' });
      expect(rec.status).toBe('closed');
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'COST_ALERT_CLOSE' }),
      );
    });

    it('active 状态抛 73710（必须先 ack）', async () => {
      await expect(costAlert.closeAlert(ACTOR, 'a1', { reason: 'x' }))
        .rejects.toMatchObject({ statusCode: 400, code: 73710 });
    });

    it('reason 必填校验', async () => {
      mocks.alertFindUnique.mockResolvedValue(row({ status: 'acknowledged' }));
      await expect(costAlert.closeAlert(ACTOR, 'a1', { reason: '  ' }))
        .rejects.toMatchObject({ statusCode: 400, code: 73710 });
    });
  });

  describe('getAlertSummary', () => {
    it('按 alertType / severity / status 统计正确', async () => {
      mocks.alertFindMany.mockResolvedValue([
        row(),
        row({
          id: 'a2', alertType: 'attrition_monthly', severity: 'critical', status: 'acknowledged',
        }),
      ]);
      const s = await costAlert.getAlertSummary(ACTOR, PERIOD);
      expect(s.total).toBe(2);
      expect(s.byAlertType.overtime_ratio.count).toBe(1);
      expect(s.byAlertType.attrition_monthly.count).toBe(1);
      expect(s.bySeverity.warning.count).toBe(1);
      expect(s.bySeverity.critical.count).toBe(1);
      expect(s.byStatus.active.count).toBe(1);
      expect(s.byStatus.acknowledged.count).toBe(1);
    });
  });
});
