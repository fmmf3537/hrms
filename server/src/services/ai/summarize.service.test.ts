// M0.5-5: summarize.service 单元测试 | HRMS
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, import/first */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  auditLog: vi.fn(),
  summaryFindFirst: vi.fn(),
  summaryCreate: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  default: {
    aiSummary: {
      findFirst: mocks.summaryFindFirst,
      create: mocks.summaryCreate,
    },
  },
}));

vi.mock('../integration.service', () => ({
  send: mocks.send,
}));

vi.mock('../audit.service', () => ({
  AUDIT_ACTIONS: {
    AI_SUMMARIZE: 'AI_SUMMARIZE', AI_QA: 'AI_QA', AI_OCR: 'AI_OCR', AI_SCORE: 'AI_SCORE',
  },
  AUDIT_RESOURCE_TYPES: { AI: 'Ai' },
  auditLog: mocks.auditLog,
}));

import * as summarizeService from './summarize.service';

const REF = '22222222-2222-2222-2222-222222222222';
const USER = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auditLog.mockResolvedValue(undefined);
  mocks.summaryCreate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'sum-new',
      ...data,
      createdAt: new Date(),
    }),
  );
});

describe('summarize', () => {
  it('缓存命中（不调 LLM）', async () => {
    mocks.summaryFindFirst.mockResolvedValue({
      id: 'sum-1',
      type: 'payroll_diff',
      referenceId: REF,
      content: '缓存摘要内容',
      highlights: ['要点A'],
      tokens: 50,
      cost: 0.01,
      duration: 10,
      expiresAt: new Date(Date.now() + 3600_000),
      createdAt: new Date(),
    });

    const result = await summarizeService.summarize({
      type: 'payroll_diff',
      referenceId: REF,
      data: { foo: 1 },
      userId: USER,
    });

    expect(result.cached).toBe(true);
    expect(result.summary).toBe('缓存摘要内容');
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.summaryCreate).not.toHaveBeenCalled();
  });

  it('缓存未命中（调 LLM 写库）', async () => {
    mocks.summaryFindFirst.mockResolvedValue(null);
    mocks.send.mockResolvedValue({
      success: true,
      data: {
        content: JSON.stringify({
          summary: '本月工资减少因事假扣款',
          highlights: ['事假扣款'],
        }),
        tokens: 80,
        cost: 0.08,
      },
    });

    const result = await summarizeService.summarize({
      type: 'payroll_diff',
      referenceId: REF,
      data: { current: 8500, last: 10000 },
      userId: USER,
    });

    expect(result.cached).toBe(false);
    expect(result.summary).toContain('事假');
    expect(mocks.send).toHaveBeenCalled();
    expect(mocks.summaryCreate).toHaveBeenCalled();
  });

  it('缓存过期（重新生成）', async () => {
    mocks.summaryFindFirst.mockResolvedValue({
      id: 'sum-old',
      type: 'payroll_diff',
      referenceId: REF,
      content: '过期摘要',
      highlights: [],
      tokens: 10,
      cost: 0,
      duration: 1,
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(Date.now() - 86_400_000),
    });
    mocks.send.mockResolvedValue({
      success: true,
      data: {
        content: JSON.stringify({ summary: '新摘要', highlights: ['新要点'] }),
        tokens: 90,
        cost: 0.05,
      },
    });

    const result = await summarizeService.summarize({
      type: 'payroll_diff',
      referenceId: REF,
      data: {},
      userId: USER,
    });

    expect(result.cached).toBe(false);
    expect(result.summary).toBe('新摘要');
    expect(mocks.send).toHaveBeenCalled();
    expect(mocks.summaryCreate).toHaveBeenCalled();
  });
});
