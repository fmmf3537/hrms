// M4-C5: report_export.service 单元测试
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

import * as report from './report_export.service';

const ACTOR = 'hr-1';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date(2026, 8, 10) });
  mocks.getValue.mockResolvedValue(['excel', 'pdf']);
  mocks.runFindUnique.mockResolvedValue({
    id: 'run-1',
    period: '2026-09',
    totalGross: 20000,
    totalNet: 17800,
    anomalyCount: 0,
    payslips: [{
      grossAmount: 10000,
      netAmount: 8900,
      taxAmount: 150,
      employee: { name: '张三' },
    }],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('report_export.service', () => {
  it('Excel 格式导出成功（mock）', async () => {
    const r = await report.exportReport(ACTOR, 'run-1', { format: 'excel' });
    expect(r.filePath.endsWith('.xlsx')).toBe(true);
    expect(r.content).toContain('汇总表');
    expect(r.mockMode).toBe(true);
  });

  it('PDF 格式导出成功（mock）', async () => {
    const r = await report.exportReport(ACTOR, 'run-1', { format: 'pdf' });
    expect(r.filePath.endsWith('.pdf')).toBe(true);
    expect(r.totalGross).toBe(20000);
  });

  it('format 不在白名单抛 400', async () => {
    await expect(report.exportReport(ACTOR, 'run-1', { format: 'csv' as 'excel' }))
      .rejects.toMatchObject({ statusCode: 400, code: 73509 });
  });

  it('audit 记录 mockMode: true', async () => {
    await report.exportReport(ACTOR, 'run-1', { format: 'excel' });
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'REPORT_EXPORT',
      newValue: expect.objectContaining({ mockMode: true }),
    }));
  });
});
