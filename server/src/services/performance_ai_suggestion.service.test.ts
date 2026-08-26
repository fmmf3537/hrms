// M3-D2: performance_ai_suggestion.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  suggestScore: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    performanceRecord: { findUnique: mocks.findUnique, findMany: mocks.findMany },
    performanceAiSuggestion: { count: mocks.count, create: mocks.create, findMany: mocks.findMany },
    attendanceRecord: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('./ai/score.service', () => ({
  suggestScore: mocks.suggestScore,
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as aiService from './performance_ai_suggestion.service';

const baseRecord = {
  id: 'rec-1',
  employeeId: 'emp-1',
  cycleId: 'cyc-1',
  status: 'manager_scoring',
  employee: { id: 'emp-1', name: '张三' },
  scores: [{ items: [{ indicatorId: 'ind-1', scoreValue: 80 }] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation((_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'ai.suggestion_history_months': 6,
      'ai.suggestion_count': 3,
      'ai.fallback_strategy': 'mock',
      'ai.input_template_key': 'performance_ai_suggestion',
    };
    return map[key] ?? null;
  });
  mocks.findUnique.mockResolvedValue(baseRecord);
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
  mocks.suggestScore.mockResolvedValue({
    suggestions: [{ grade: 'A', confidence: 0.8, reasons: ['达标'] }],
    cost: 0.01,
    tokens: 100,
  });
  mocks.create.mockResolvedValue({
    id: 'ai-1',
    recordId: 'rec-1',
    suggestions: [{ grade: 'A', confidence: 0.8, reasons: ['达标'] }],
  });
});

describe('requestAiSuggestion', () => {
  it('调用 suggestScore 成功 + 写 ai_suggestions', async () => {
    const result = await aiService.requestAiSuggestion('user-1', 'rec-1');
    expect(result.suggestionId).toBe('ai-1');
    expect(mocks.suggestScore).toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalled();
  });

  it('AI 失败 fallback=mock 返 mock 建议', async () => {
    mocks.suggestScore.mockRejectedValue(new Error('LLM down'));
    mocks.getValue.mockImplementation((_c: string, key: string) => {
      if (key === 'ai.fallback_strategy') return 'mock';
      return 6;
    });
    const result = await aiService.requestAiSuggestion('user-1', 'rec-1');
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('AI 失败 fallback=error 抛 72514', async () => {
    mocks.suggestScore.mockRejectedValue(new Error('LLM down'));
    mocks.getValue.mockImplementation((_c: string, key: string) => {
      if (key === 'ai.fallback_strategy') return 'error';
      return 6;
    });
    await expect(aiService.requestAiSuggestion('user-1', 'rec-1'))
      .rejects.toMatchObject({ code: 72514 });
  });

  it('24h 内第 6 次调用抛 72516', async () => {
    mocks.count.mockResolvedValue(5);
    await expect(aiService.requestAiSuggestion('user-1', 'rec-1'))
      .rejects.toMatchObject({ code: 72516 });
  });

  it('status 不在 manager_scoring 抛 72513', async () => {
    mocks.findUnique.mockResolvedValue({ ...baseRecord, status: 'draft' });
    await expect(aiService.requestAiSuggestion('user-1', 'rec-1'))
      .rejects.toMatchObject({ code: 72513 });
  });

  it('审计 actorType=AGENT', async () => {
    await aiService.requestAiSuggestion('user-1', 'rec-1');
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({ actorType: 'AGENT' }));
  });
});

describe('listAiSuggestions', () => {
  it('返近 6 月历史按 createdAt DESC', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'ai-2' }, { id: 'ai-1' }]);
    const items = await aiService.listAiSuggestions('user-1', 'rec-1');
    expect(items).toHaveLength(2);
  });

  it('无历史返空数组', async () => {
    mocks.findMany.mockResolvedValue([]);
    const items = await aiService.listAiSuggestions('user-1', 'rec-1');
    expect(items).toEqual([]);
  });
});
