// M4-C5: tax_declaration.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  runFindUnique: vi.fn(),
  auditFindMany: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    payrollRun: { findUnique: mocks.runFindUnique },
    auditLog: { findMany: mocks.auditFindMany },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as taxDecl from './tax_declaration.service';

const ACTOR = 'hr-1';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date(2026, 8, 10) });
  mocks.getValue.mockResolvedValue(true);
  mocks.runFindUnique.mockResolvedValue({
    id: 'run-1',
    payslips: [{
      employeeId: 'e1',
      grossAmount: 10000,
      socialInsuranceAmount: 800,
      housingFundAmount: 300,
      taxAmount: 150,
    }],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('tax_declaration.service', () => {
  it('个税申报成功（mock）', async () => {
    const r = await taxDecl.declareTax(ACTOR, 'run-1', { period: '2026-09' });
    expect(r.mockMode).toBe(true);
    expect(r.recordCount).toBe(1);
  });

  it('period 格式错抛 73507', async () => {
    await expect(taxDecl.declareTax(ACTOR, 'run-1', { period: '2026-13' }))
      .rejects.toMatchObject({ code: 73507 });
  });

  it('run 不存在抛 404', async () => {
    mocks.runFindUnique.mockResolvedValue(null);
    await expect(taxDecl.declareTax(ACTOR, 'missing', { period: '2026-09' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('audit 记录 mockMode: true', async () => {
    await taxDecl.declareTax(ACTOR, 'run-1', { period: '2026-09' });
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'TAX_DECLARE',
      newValue: expect.objectContaining({ mockMode: true }),
    }));
  });

  it('累计 totalTaxableIncome + totalTax 正确', async () => {
    const r = await taxDecl.declareTax(ACTOR, 'run-1', { period: '2026-09' });
    expect(r.totalTaxableIncome).toBe(8900);
    expect(r.totalTax).toBe(150);
  });
});
