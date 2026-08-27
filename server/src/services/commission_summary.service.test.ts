// M4-C6: commission_summary.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  employeeFindFirst: vi.fn(),
  departmentFindFirst: vi.fn(),
  commissionFindMany: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    user: { findUnique: mocks.userFindUnique },
    employee: { findFirst: mocks.employeeFindFirst },
    department: { findFirst: mocks.departmentFindFirst },
    performanceSalesCommission: { findMany: mocks.commissionFindMany },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as summary from './commission_summary.service';

const ACTOR = 'hr-1';

function paid(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    employeeId: 'e1',
    productId: 'p1',
    baseAmount: 100000,
    commissionRate: 0.05,
    finalAmount: 5000,
    period: '2026-01',
    employee: {
      id: 'e1',
      name: '张三',
      departmentId: 'd1',
      department: { id: 'd1', name: '销售部' },
    },
    product: {
      id: 'p1', code: 'UAV-01', name: '无人机整机', category: 'product',
    },
    ...overrides,
  };
}

const ROWS = [
  paid(),
  paid({
    id: 'c2',
    productId: 'p2',
    baseAmount: 80000,
    commissionRate: 0.08,
    finalAmount: 6400,
    period: '2026-03',
    product: {
      id: 'p2', code: 'SVC-01', name: '运维服务', category: 'service',
    },
  }),
  paid({
    id: 'c3',
    employeeId: 'e2',
    productId: 'p1',
    baseAmount: 60000,
    finalAmount: 3000,
    period: '2026-04',
    employee: {
      id: 'e2',
      name: '李四',
      departmentId: 'd1',
      department: { id: 'd1', name: '销售部' },
    },
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date('2026-03-15T00:00:00.000Z') });
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    if (key === 'commission.settlement.fiscal_quarter_start') return 1;
    if (key === 'commission.summary.default_group_by') return 'employee';
    return true;
  });
  mocks.userFindUnique.mockResolvedValue({
    id: ACTOR,
    userRoles: [{ role: { code: 'hr' } }],
  });
  mocks.commissionFindMany.mockResolvedValue(ROWS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('commission_summary.service', () => {
  describe('getSummary', () => {
    it('employee 维度汇总（含姓名 + 部门 + totalAmount + recordCount）', async () => {
      const r = await summary.getSummary(ACTOR, { groupBy: 'employee' });
      expect(r.groupBy).toBe('employee');
      expect(r.totalAmount).toBe(14400);
      const zhang = r.items.find((i) => i.employeeId === 'e1');
      expect(zhang?.employeeName).toBe('张三');
      expect(zhang?.departmentName).toBe('销售部');
      expect(zhang?.totalAmount).toBe(11400);
      expect(zhang?.recordCount).toBe(2);
    });

    it('department 维度汇总（含 employeeCount + totalAmount）', async () => {
      const r = await summary.getSummary(ACTOR, { groupBy: 'department' });
      expect(r.items[0].departmentName).toBe('销售部');
      expect(r.items[0].employeeCount).toBe(2);
      expect(r.items[0].totalAmount).toBe(14400);
    });

    it('product 维度汇总（含 productCode + category）', async () => {
      const r = await summary.getSummary(ACTOR, { groupBy: 'product' });
      const uav = r.items.find((i) => i.productCode === 'UAV-01');
      expect(uav?.category).toBe('product');
      expect(uav?.recordCount).toBe(2);
    });

    it('report 维度汇总（含 totalBaseAmount + employeeCount + productCount）', async () => {
      const r = await summary.getSummary(ACTOR, { groupBy: 'report' });
      expect(r.items[0].totalBaseAmount).toBe(240000);
      expect(r.items[0].employeeCount).toBe(2);
      expect(r.items[0].productCount).toBe(2);
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'COMMISSION_REPORT_QUERY' }),
      );
    });

    it('quarter=2026-Q1 过滤（Q1=1-3月）', async () => {
      await summary.getSummary(ACTOR, { groupBy: 'employee', quarter: '2026-Q1' });
      expect(mocks.commissionFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'paid',
            period: { in: ['2026-01', '2026-02', '2026-03'] },
          }),
        }),
      );
    });

    it('period=2026-03 过滤（仅 3 月）', async () => {
      await summary.getSummary(ACTOR, { groupBy: 'employee', period: '2026-03' });
      expect(mocks.commissionFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'paid', period: '2026-03' }),
        }),
      );
    });

    it('groupBy 非法抛 73601', async () => {
      await expect(summary.getSummary(ACTOR, { groupBy: 'foo' }))
        .rejects.toMatchObject({ statusCode: 400, code: 73601 });
    });

    it('quarter 格式错抛 73605', async () => {
      await expect(summary.getSummary(ACTOR, { groupBy: 'employee', quarter: '2026-Q5' }))
        .rejects.toMatchObject({ statusCode: 400, code: 73605 });
    });
  });

  describe('getEmployeeSummary', () => {
    it('员工维度汇总（含部门名 + 提成明细 items）', async () => {
      mocks.employeeFindFirst.mockResolvedValue({
        id: 'e1',
        name: '张三',
        departmentId: 'd1',
        department: { id: 'd1', name: '销售部' },
      });
      mocks.commissionFindMany.mockResolvedValue(ROWS.filter((r) => r.employeeId === 'e1'));
      const r = await summary.getEmployeeSummary(ACTOR, 'e1', { period: '2026-01' });
      expect(r.employeeName).toBe('张三');
      expect(r.departmentName).toBe('销售部');
      expect(r.items.length).toBeGreaterThan(0);
      expect(r.items[0].finalAmount).toBe(5000);
    });

    it('员工不存在抛 404', async () => {
      mocks.employeeFindFirst.mockResolvedValue(null);
      await expect(summary.getEmployeeSummary(ACTOR, 'missing'))
        .rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('getDepartmentSummary', () => {
    it('部门维度汇总（含 employeeCount + 按员工聚合）', async () => {
      mocks.departmentFindFirst.mockResolvedValue({ id: 'd1', name: '销售部' });
      const r = await summary.getDepartmentSummary(ACTOR, 'd1');
      expect(r.departmentName).toBe('销售部');
      expect(r.employeeCount).toBe(2);
      expect(r.items).toHaveLength(2);
    });
  });
});
