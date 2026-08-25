// M0.5-5: embedding.service 单元测试 | HRMS
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, import/first */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  executeRawUnsafe: vi.fn(),
  queryRawUnsafe: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  default: {
    $executeRawUnsafe: mocks.executeRawUnsafe,
    $queryRawUnsafe: mocks.queryRawUnsafe,
  },
}));

vi.mock('../integration.service', () => ({
  send: mocks.send,
}));

import * as embeddingService from './embedding.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('chunkText', () => {
  it('按 chunkSize + overlap 切分文本', () => {
    const text = 'ABCDEFGHIJ';
    const chunks = embeddingService.chunkText(text, 4, 1);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toBe('ABCD');
    expect(chunks[1]?.startsWith('D')).toBe(true);
    expect(chunks.join('').includes('J')).toBe(true);
  });

  it('空文本返回空数组', () => {
    expect(embeddingService.chunkText('   ')).toEqual([]);
  });
});

describe('storeDocumentEmbeddings', () => {
  it('写入 embedding（mock LLM 返回固定 vector）', async () => {
    const vec = Array.from({ length: 8 }, () => 0.1);
    mocks.send.mockResolvedValue({
      success: true,
      data: { embeddings: [vec, vec] },
    });
    mocks.executeRawUnsafe.mockResolvedValue(1);

    const n = await embeddingService.storeDocumentEmbeddings('doc-1', ['chunk-a', 'chunk-b']);
    expect(n).toBe(2);
    expect(mocks.send).toHaveBeenCalledWith({
      code: 'llm',
      payload: { type: 'embedding', input: ['chunk-a', 'chunk-b'] },
    });
    expect(mocks.executeRawUnsafe).toHaveBeenCalledTimes(2);
  });
});

describe('searchSimilar / filterBySimilarity', () => {
  it('检索 topK', () => {
    const rows = [
      {
        id: '1', documentId: 'd1', chunkText: 'a', similarity: 0.95,
      },
      {
        id: '2', documentId: 'd2', chunkText: 'b', similarity: 0.85,
      },
      {
        id: '3', documentId: 'd3', chunkText: 'c', similarity: 0.75,
      },
    ];
    const result = embeddingService.filterBySimilarity(rows, 2, 0.7);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('1');
    expect(result[1]?.id).toBe('2');
  });

  it('检索时无相关文档返回空数组', () => {
    expect(embeddingService.filterBySimilarity([], 5, 0.7)).toEqual([]);
  });

  it('相似度阈值过滤', () => {
    const rows = [
      {
        id: '1', documentId: 'd1', chunkText: 'a', similarity: 0.9,
      },
      {
        id: '2', documentId: 'd2', chunkText: 'b', similarity: 0.5,
      },
    ];
    const result = embeddingService.filterBySimilarity(rows, 5, 0.7);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('1');
  });

  it('searchSimilar 走 raw SQL 并过滤阈值', async () => {
    const vec = Array.from({ length: 4 }, () => 0.1);
    mocks.send.mockResolvedValue({
      success: true,
      data: { embeddings: [vec] },
    });
    mocks.queryRawUnsafe.mockResolvedValue([
      {
        id: 'e1', document_id: 'd1', chunk_text: '年假', similarity: 0.92,
      },
      {
        id: 'e2', document_id: 'd2', chunk_text: '无关', similarity: 0.4,
      },
    ]);

    const result = await embeddingService.searchSimilar('年假怎么请', 5, 0.7);
    expect(result).toHaveLength(1);
    expect(result[0]?.chunkText).toBe('年假');
    expect(mocks.queryRawUnsafe).toHaveBeenCalled();
  });
});
