// M4-C4: payroll_ai_summary.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  runFindUnique: vi.fn(),
  runFindFirst: vi.fn(),
  auditFindMany: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  summarize: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    payrollRun: {
      findUnique: mocks.runFindUnique,
      findFirst: mocks.runFindFirst,
    },
    auditLog: { findMany: mocks.auditFindMany },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

vi.mock('./ai/summarize.service', () => ({
  summarize: mocks.summarize,
}));

import * as aiService from './payroll_ai_summary.service';

const ACTOR = 'hr-1';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockResolvedValue('payroll_ai_summary');
  mocks.runFindUnique.mockResolvedValue({
    id: 'run-1',
    period: '2026-09',
    totalGross: 20000,
    totalNet: 17800,
    anomalyCount: 0,
    payslips: [{ employeeId: 'e1', netAmount: 8900 }],
  });
  mocks.runFindFirst.mockResolvedValue(null);
  mocks.summarize.mockResolvedValue({
    summary: '本月工资平稳',
    highlights: ['无显著异常'],
    cost: 0.01,
    tokens: 120,
    cached: false,
    summaryId: 'sum-1',
  });
});

describe('payroll_ai_summary.service', () => {
  it('AI 摘要成功（mock aiSummarizeService）', async () => {
    const r = await aiService.requestAiSummary(ACTOR, 'run-1');
    expect(r.summary).toBe('本月工资平稳');
    expect(mocks.summarize).toHaveBeenCalled();
  });

  it('runId 不存在抛 73401', async () => {
    mocks.runFindUnique.mockResolvedValue(null);
    await expect(aiService.requestAiSummary(ACTOR, 'missing'))
      .rejects.toMatchObject({ code: 73401 });
  });

  it('AI 调用失败抛 73410', async () => {
    mocks.summarize.mockRejectedValue(new Error('LLM down'));
    await expect(aiService.requestAiSummary(ACTOR, 'run-1'))
      .rejects.toMatchObject({ code: 73410 });
  });

  it('audit 记录 actorType=USER', async () => {
    await aiService.requestAiSummary(ACTOR, 'run-1');
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorType: 'USER',
      action: 'PAYROLL_AI_SUMMARY',
    }));
  });

  it('fallback 配置 key 使用 configs.salary.payroll.ai_summary_template_key', async () => {
    await aiService.requestAiSummary(ACTOR, 'run-1');
    expect(mocks.getValue).toHaveBeenCalledWith('salary', 'payroll.ai_summary_template_key');
    expect(mocks.summarize).toHaveBeenCalledWith(expect.objectContaining({
      type: 'payroll_ai_summary',
    }));
  });

  it('复用 M0.5-5 aiSummarizeService（不重写）', async () => {
    await aiService.requestAiSummary(ACTOR, 'run-1');
    expect(mocks.summarize).toHaveBeenCalledTimes(1);
  });
});
