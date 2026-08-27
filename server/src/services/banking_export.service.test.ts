// M4-C5: banking_export.service 单元测试
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

import * as banking from './banking_export.service';

const ACTOR = 'hr-1';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date(2026, 8, 10) });
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    if (key === 'banking.mock_mode') return true;
    if (key === 'banking.formats') return ['icbc', 'ccb', 'cmb'];
    return true;
  });
  mocks.runFindUnique.mockResolvedValue({
    id: 'run-1',
    payslips: [{
      netAmount: 8900,
      employee: { employeeNo: 'CH001', name: '张三', bankCard: '6222' },
    }],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('banking_export.service', () => {
  it('工行 CSV 格式导出成功（mock）', async () => {
    const r = await banking.exportBankingFile(ACTOR, 'run-1', { format: 'icbc' });
    expect(r.content).toContain('工号|姓名|卡号|金额');
    expect(r.filePath.endsWith('.csv')).toBe(true);
    expect(r.mockMode).toBe(true);
  });

  it('建行 TXT 格式导出成功（mock）', async () => {
    const r = await banking.exportBankingFile(ACTOR, 'run-1', { format: 'ccb' });
    expect(r.content).toContain('序号|账号|金额');
    expect(r.filePath.endsWith('.txt')).toBe(true);
  });

  it('招行 XLS 格式导出成功（mock）', async () => {
    const r = await banking.exportBankingFile(ACTOR, 'run-1', { format: 'cmb' });
    expect(r.filePath.endsWith('.xls')).toBe(true);
    expect(r.mockMode).toBe(true);
  });

  it('format 不在白名单抛 73505', async () => {
    await expect(banking.exportBankingFile(ACTOR, 'run-1', { format: 'abc' as 'icbc' }))
      .rejects.toMatchObject({ code: 73505 });
  });

  it('run 不存在抛 404', async () => {
    mocks.runFindUnique.mockResolvedValue(null);
    await expect(banking.exportBankingFile(ACTOR, 'missing', { format: 'icbc' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('audit 记录 mockMode: true', async () => {
    await banking.exportBankingFile(ACTOR, 'run-1', { format: 'icbc' });
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'BANKING_EXPORT',
      newValue: expect.objectContaining({ mockMode: true }),
    }));
  });
});
