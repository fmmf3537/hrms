// M0.5-5: qa.service 单元测试 | HRMS
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, import/first */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  searchSimilar: vi.fn(),
  send: vi.fn(),
  auditLog: vi.fn(),
  conversationCreate: vi.fn(),
  documentFindMany: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  default: {
    aiConversation: {
      create: mocks.conversationCreate,
      count: vi.fn(),
      findMany: vi.fn(),
    },
    aiDocument: {
      findMany: mocks.documentFindMany,
    },
  },
}));

vi.mock('../integration.service', () => ({
  send: mocks.send,
}));

vi.mock('../audit.service', () => ({
  AUDIT_ACTIONS: {
    AI_QA: 'AI_QA', AI_OCR: 'AI_OCR', AI_SUMMARIZE: 'AI_SUMMARIZE', AI_SCORE: 'AI_SCORE',
  },
  AUDIT_RESOURCE_TYPES: { AI: 'Ai' },
  auditLog: mocks.auditLog,
}));

vi.mock('./embedding.service', () => ({
  searchSimilar: mocks.searchSimilar,
}));

import * as qaService from './qa.service';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.conversationCreate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'conv-1',
      ...data,
      createdAt: new Date(),
    }),
  );
  mocks.documentFindMany.mockResolvedValue([
    { id: 'doc-1', title: '年假制度细则' },
  ]);
  mocks.auditLog.mockResolvedValue(undefined);
});

describe('ask', () => {
  it('基本问答（mock embedding + mock LLM）', async () => {
    mocks.searchSimilar.mockResolvedValue([
      {
        id: 'e1', documentId: 'doc-1', chunkText: '年假申请流程...', similarity: 0.91,
      },
    ]);
    mocks.send.mockResolvedValue({
      success: true,
      data: { content: '请在系统提交年假申请。', tokens: 120, cost: 0.02 },
    });

    const result = await qaService.ask({
      userId: '11111111-1111-1111-1111-111111111111',
      question: '年假怎么请？',
    });

    expect(result.answer).toContain('年假');
    expect(result.tokens).toBe(120);
    expect(result.sources.length).toBe(1);
    expect(result.sources[0]?.title).toBe('年假制度细则');
    expect(mocks.send).toHaveBeenCalled();
    expect(mocks.conversationCreate).toHaveBeenCalled();
  });

  it('无相关文档返回 fallback', async () => {
    mocks.searchSimilar.mockResolvedValue([]);

    const result = await qaService.ask({
      userId: '11111111-1111-1111-1111-111111111111',
      question: '公司战略是什么？',
    });

    expect(result.answer).toContain('联系 HR');
    expect(result.sources).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('token 统计正确', async () => {
    mocks.searchSimilar.mockResolvedValue([
      {
        id: 'e1', documentId: 'doc-1', chunkText: '工资条说明', similarity: 0.88,
      },
    ]);
    mocks.send.mockResolvedValue({
      success: true,
      data: { content: '详见工资条说明。', tokens: 456, cost: 0.012 },
    });

    const result = await qaService.ask({
      userId: '11111111-1111-1111-1111-111111111111',
      question: '工资条怎么看？',
    });

    expect(result.tokens).toBe(456);
    expect(result.cost).toBe(0.012);
  });

  it('audit 写入', async () => {
    mocks.searchSimilar.mockResolvedValue([]);
    await qaService.ask({
      userId: '11111111-1111-1111-1111-111111111111',
      question: '测试审计',
    });
    expect(mocks.auditLog).toHaveBeenCalled();
    const arg = mocks.auditLog.mock.calls[0][0] as { action: string };
    expect(arg.action).toBe('AI_QA');
  });

  it('问题过长抛 60140', async () => {
    await expect(
      qaService.ask({
        userId: '11111111-1111-1111-1111-111111111111',
        question: '啊'.repeat(2001),
      }),
    ).rejects.toMatchObject({ code: 60140, statusCode: 400 });
  });
});
