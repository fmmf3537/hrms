// M0.5-5: Embedding / RAG 检索 service | HRMS
// 分块 → LLM embedding → pgvector 写入 / cosine similarity 检索

import { randomUUID } from 'crypto';

import { env } from '../../lib/env';
import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import * as integrationService from '../integration.service';

/** 相似度检索结果 */
export interface SimilarChunk {
  id: string;
  documentId: string;
  chunkText: string;
  similarity: number;
}

/**
 * 将文本按 chunkSize / overlap 切分为块（字符级，中文友好）。
 * // TODO: move to configService — chunkSize / overlap
 */
export function chunkText(
  text: string,
  chunkSize: number = env.AI_DOCUMENT_CHUNK_SIZE,
  overlap: number = env.AI_DOCUMENT_CHUNK_OVERLAP,
): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  if (chunkSize <= 0) return [normalized];
  const safeOverlap = Math.max(0, Math.min(overlap, chunkSize - 1));
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    chunks.push(normalized.slice(start, end));
    if (end >= normalized.length) break;
    start = end - safeOverlap;
  }
  return chunks;
}

/**
 * 将 number[] 格式化为 pgvector 字面量，如 `[0.1,0.2,...]`
 */
export function formatVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * 纯函数：按相似度阈值过滤并截取 topK（便于单测 mock 原始检索结果）
 */
export function filterBySimilarity(
  rows: SimilarChunk[],
  topK: number,
  threshold: number,
): SimilarChunk[] {
  return rows
    .filter((r) => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/**
 * 调用 LLM 集成生成文本 embedding 向量
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  try {
    const result = await integrationService.send({
      code: 'llm',
      payload: { type: 'embedding', input: texts },
    });
    if (!result.success) {
      throw new AppError(result.error ?? '文本嵌入失败', 500, 60111);
    }
    const data = result.data as { embeddings?: number[][] } | undefined;
    const embeddings = data?.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
      throw new AppError('文本嵌入返回格式错误', 500, 60111);
    }
    return embeddings;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(`文本嵌入失败: ${msg}`, 500, 60111);
  }
}

/**
 * 将分块文本与向量写入 ai_embeddings（embedding 列经 raw SQL 写入 vector）
 */
export async function storeDocumentEmbeddings(
  documentId: string,
  chunks: string[],
): Promise<number> {
  if (chunks.length === 0) return 0;
  let embeddings: number[][];
  try {
    embeddings = await embedTexts(chunks);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('文本嵌入失败', 500, 60111);
  }

  try {
    await Promise.all(chunks.map((chunk, i) => {
      const id = randomUUID();
      const embedding = embeddings[i] ?? [];
      const vectorLiteral = formatVectorLiteral(embedding);
      const tokenCount = Math.ceil(chunk.length / 2);
      return prisma.$executeRawUnsafe(
        `INSERT INTO ai_embeddings (id, document_id, chunk_index, chunk_text, embedding, token_count, created_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::vector, $6, NOW())`,
        id,
        documentId,
        i,
        chunk,
        vectorLiteral,
        tokenCount,
      );
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(`向量写入失败: ${msg}`, 500, 60110);
  }
  return chunks.length;
}

/**
 * 对查询文本做 embedding 后，用 pgvector cosine 距离检索相似 chunk
 * // TODO: move to configService — topK / threshold
 */
export async function searchSimilar(
  query: string,
  topK: number = env.AI_QA_TOP_K,
  threshold: number = env.AI_SIMILARITY_THRESHOLD,
): Promise<SimilarChunk[]> {
  if (!query.trim()) return [];

  let queryEmbedding: number[];
  try {
    const [vec] = await embedTexts([query]);
    if (!vec) throw new AppError('查询嵌入失败', 500, 60111);
    queryEmbedding = vec;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('查询嵌入失败', 500, 60111);
  }

  const vectorLiteral = formatVectorLiteral(queryEmbedding);
  // 多取一些再本地过滤阈值，避免 SQL 侧硬编码阈值不便单测
  const fetchLimit = Math.max(topK * 3, topK);

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      document_id: string;
      chunk_text: string;
      similarity: number;
    }>>(
      `SELECT id, document_id, chunk_text, 1 - (embedding <=> $1::vector) AS similarity
       FROM ai_embeddings
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      vectorLiteral,
      fetchLimit,
    );

    const mapped: SimilarChunk[] = rows.map((r) => ({
      id: r.id,
      documentId: r.document_id,
      chunkText: r.chunk_text,
      similarity: Number(r.similarity),
    }));
    return filterBySimilarity(mapped, topK, threshold);
  } catch (err) {
    // 单测环境可能无 pgvector：抛出后由调用方/测试用 filterBySimilarity 兜底
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(`向量检索失败: ${msg}`, 500, 60110);
  }
}
