// M4-C6: commission_report.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  commissionFindMany: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    performanceSalesCommission: { findMany: mocks.commissionFindMany },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as report from './commission_report.service';

const ACTOR = 'hr-1';

const ROWS = [
  {
    id: 'c1',
    employeeId: 'e1',
    productId: 'p1',
    baseAmount: 100000,
    finalAmount: 5000,
    period: '2026-01',
    employee: {
      id: 'e1',
      name: '张三',
      departmentId: 'd1',
      department: { id: 'd1', name: '销售部' },
    },
    product: {
      id: 'p1',
      code: 'UAV-01',
      name: '无人机整机',
      category: 'product',
    },
  },
  {
    id: 'c2',
    employeeId: 'e2',
    productId: 'p2',
    baseAmount: 80000,
    finalAmount: 6400,
    period: '2026-04',
    employee: {
      id: 'e2',
      name: '李四',
      departmentId: 'd2',
      department: { id: 'd2', name: '市场部' },
    },
    product: {
      id: 'p2',
      code: 'SVC-01',
      name: '运维服务',
      category: 'service',
    },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date('2026-03-15T00:00:00.000Z') });
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    if (key === 'commission.settlement.fiscal_quarter_start') return 1;
    if (key === 'commission.report.summary_fields') {
      return ['totalAmount', 'recordCount', 'employeeCount'];
    }
    if (key === 'commission.settlement.mock_mode') return true;
    return true;
  });
  mocks.commissionFindMany.mockResolvedValue(ROWS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('commission_report.service', () => {
  it('overall 维度报表（含 totalAmount + recordCount + employeeCount）', async () => {
    const r = await report.getReport(ACTOR, { groupBy: 'overall' });
    expect(r.mockMode).toBe(true);
    expect(r.totalAmount).toBe(11400);
    expect(r.summary.totalAmount).toBe(11400);
    expect(r.summary.recordCount).toBe(2);
    expect(r.summary.employeeCount).toBe(2);
  });

  it('employee 维度报表（含每员工明细）', async () => {
    const r = await report.getReport(ACTOR, { groupBy: 'employee' });
    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.label)).toEqual(expect.arrayContaining(['张三', '李四']));
  });

  it('department 维度报表（含部门汇总 + 员工数）', async () => {
    const r = await report.getReport(ACTOR, { groupBy: 'department' });
    expect(r.items).toHaveLength(2);
    const sales = r.items.find((i) => i.label === '销售部');
    expect(sales?.employeeCount).toBe(1);
    expect(sales?.totalAmount).toBe(5000);
  });

  it('product 维度报表（含产品分类汇总）', async () => {
    const r = await report.getReport(ACTOR, { groupBy: 'product' });
    expect(r.items).toHaveLength(2);
    expect(r.items[0].label).toContain('UAV-01');
  });

  it('quarter=2026-Q2 过滤（Q2=4-6月）', async () => {
    await report.getReport(ACTOR, { groupBy: 'overall', quarter: '2026-Q2' });
    expect(mocks.commissionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'paid',
          period: { in: ['2026-04', '2026-05', '2026-06'] },
        }),
      }),
    );
  });

  it('audit 记录 summaryFields + mockMode: true', async () => {
    await report.getReport(ACTOR, { groupBy: 'overall' });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COMMISSION_REPORT_QUERY',
        newValue: expect.objectContaining({
          mockMode: true,
          summaryFields: ['totalAmount', 'recordCount', 'employeeCount'],
        }),
      }),
    );
  });

  it('groupBy 非法抛 73601', async () => {
    await expect(report.getReport(ACTOR, { groupBy: 'foo' }))
      .rejects.toMatchObject({ statusCode: 400, code: 73601 });
  });
});
