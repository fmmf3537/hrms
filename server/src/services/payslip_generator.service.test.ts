// M4-C5: payslip_generator.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  payslipFindUnique: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    payslip: { findUnique: mocks.payslipFindUnique },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as gen from './payslip_generator.service';

const ACTOR = 'hr-1';

function approvedSlip(status: 'approved' | 'locked' | 'calculated' = 'approved') {
  return {
    id: 'ps-1',
    employeeId: 'e1',
    period: '2026-09',
    status,
    grossAmount: 10000,
    deductionAmount: 1100,
    netAmount: 8900,
    taxAmount: 150,
    items: [
      { itemName: '基本工资', amount: 10000 },
      { itemName: '个人所得税', amount: -150 },
    ],
    employee: { name: '张三', employeeNo: 'CH001' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date(2026, 8, 10) });
  mocks.getValue.mockResolvedValue('default');
  mocks.payslipFindUnique.mockResolvedValue(approvedSlip());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('payslip_generator.service generatePayslip', () => {
  it('approved 状态生成 HTML + PDF 成功', async () => {
    const r = await gen.generatePayslip(ACTOR, 'ps-1');
    expect(r.html).toContain('电子工资条');
    expect(r.pdf).toBeInstanceOf(Buffer);
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PAYSLIP_GENERATE',
    }));
  });

  it('locked 状态可生成', async () => {
    mocks.payslipFindUnique.mockResolvedValue(approvedSlip('locked'));
    const r = await gen.generatePayslip(ACTOR, 'ps-1');
    expect(r.payslipId).toBe('ps-1');
  });

  it('calculated 状态抛 73502（未审批）', async () => {
    mocks.payslipFindUnique.mockResolvedValue(approvedSlip('calculated'));
    await expect(gen.generatePayslip(ACTOR, 'ps-1')).rejects.toMatchObject({ code: 73502 });
  });

  it('payslipId 不存在抛 73501', async () => {
    mocks.payslipFindUnique.mockResolvedValue(null);
    await expect(gen.generatePayslip(ACTOR, 'missing')).rejects.toMatchObject({ code: 73501 });
  });

  it('HTML 包含应发合计 + 各项扣款 + 实发金额 + 个税明细', async () => {
    const r = await gen.generatePayslip(ACTOR, 'ps-1');
    expect(r.html).toContain('应发合计');
    expect(r.html).toContain('各项扣款');
    expect(r.html).toContain('实发金额');
    expect(r.html).toContain('个税明细');
  });

  it('PDF 留 mock（fileName 以 .pdf 结尾）', async () => {
    const r = await gen.generatePayslip(ACTOR, 'ps-1');
    expect(r.fileName.endsWith('.pdf')).toBe(true);
  });
});

describe('payslip_generator.service getPayslipHtml / getPayslipPdf', () => {
  it('获取已生成的 HTML 工资条', async () => {
    const html = await gen.getPayslipHtml(ACTOR, 'ps-1');
    expect(html).toContain('张三');
  });

  it('获取已生成的 PDF 工资条（二进制）', async () => {
    const r = await gen.getPayslipPdf(ACTOR, 'ps-1');
    expect(r.pdf.length).toBeGreaterThan(0);
  });
});
