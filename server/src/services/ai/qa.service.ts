// M0.5-5: AI 智能问答（RAG）service | HRMS

import { env } from '../../lib/env';
import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import * as auditService from '../audit.service';
import * as integrationService from '../integration.service';

import * as embeddingService from './embedding.service';

/** // TODO: move to configService */
const MAX_QUESTION_LENGTH = 2000;
const FALLBACK_ANSWER = '抱歉，我暂时无法基于公司知识库回答该问题。建议您联系 HR 获取准确信息，或查阅员工手册相关章节。';

export interface QaAskInput {
  userId: string;
  question: string;
  context?: Record<string, unknown>;
}

export interface QaAskResult {
  answer: string;
  sources: Array<{ title: string; score: number; documentId?: string }>;
  confidence: number;
  cost: number;
  tokens: number;
  conversationId: string;
}

/**
 * RAG 问答：向量检索 → LLM 生成 → 落库对话 + 审计
 */
export async function ask(input: QaAskInput): Promise<QaAskResult> {
  const question = input.question?.trim() ?? '';
  if (!question) {
    throw new AppError('问题不能为空', 400, 10100);
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new AppError('问题过长，请精简后重试', 400, 60140);
  }

  const start = Date.now();
  // TODO: move to configService — topK / threshold
  const similar = await embeddingService.searchSimilar(
    question,
    env.AI_QA_TOP_K,
    env.AI_SIMILARITY_THRESHOLD,
  );

  let answer: string;
  let tokens = 0;
  let cost = 0;
  let confidence = 0;
  let sources: QaAskResult['sources'] = [];
  let documentId: string | null = null;

  if (similar.length === 0) {
    answer = FALLBACK_ANSWER;
    confidence = 0;
  } else {
    const contextBlock = similar
      .map((s, i) => `[文档${i + 1}]\n${s.chunkText}`)
      .join('\n\n');

    const messages = [
      {
        role: 'system' as const,
        content: '你是辰航卓越科技 HR 助手。请严格基于以下知识库文档回答用户问题；若文档不足，礼貌建议联系 HR。不要编造制度。',
      },
      {
        role: 'user' as const,
        content: `参考文档：\n${contextBlock}\n\n用户问题：${question}`,
      },
    ];

    try {
      const llmResult = await integrationService.send({
        code: 'llm',
        payload: {
          type: 'chat',
          messages,
          temperature: env.LLM_TEMPERATURE,
          maxTokens: env.LLM_MAX_TOKENS_QA,
        },
      });
      if (!llmResult.success) {
        throw new AppError(llmResult.error ?? 'LLM 调用失败', 500, 60100);
      }
      const data = (llmResult.data ?? {}) as {
        content?: string;
        tokens?: number;
        cost?: number;
      };
      answer = data.content ?? FALLBACK_ANSWER;
      tokens = typeof data.tokens === 'number' ? data.tokens : 0;
      cost = typeof data.cost === 'number' ? data.cost : 0;
    } catch (err) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(`LLM 调用失败: ${msg}`, 500, 60100);
    }

    // 批量取文档标题
    const docIds = [...new Set(similar.map((s) => s.documentId))];
    const docs = await prisma.aiDocument.findMany({
      where: { id: { in: docIds }, deletedAt: null },
      select: { id: true, title: true },
    });
    const titleMap = new Map(docs.map((d) => [d.id, d.title]));

    sources = similar.map((s) => ({
      title: titleMap.get(s.documentId) ?? '知识库片段',
      score: s.similarity,
      documentId: s.documentId,
    }));
    confidence = similar[0]?.similarity ?? 0;
    documentId = similar[0]?.documentId ?? null;
  }

  const duration = Date.now() - start;
  const conversation = await prisma.aiConversation.create({
    data: {
      userId: input.userId,
      documentId,
      question,
      answer,
      sources: sources as object,
      tokens,
      cost,
      duration,
    },
  });

  await auditService.auditLog({
    userId: input.userId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.AI_QA,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.AI,
    resourceId: conversation.id,
    description: `AI QA: ${question.slice(0, 80)}`,
    newValue: {
      tokens, cost, duration, confidence, sourceCount: sources.length,
    },
  });

  return {
    answer,
    sources,
    confidence,
    cost,
    tokens,
    conversationId: conversation.id,
  };
}

/**
 * 列出用户对话历史
 */
export async function listConversations(
  userId: string,
  page = 1,
  pageSize = 20,
): Promise<{ data: unknown[]; total: number }> {
  const where = { userId };
  const [total, data] = await Promise.all([
    prisma.aiConversation.count({ where }),
    prisma.aiConversation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { data, total };
}

/**
 * 查询用户当日 AI 配额使用情况
 * // TODO: move to configService — dailyLimit
 */
export async function getQuota(userId: string): Promise<{
  dailyLimit: number;
  usedToday: number;
  remaining: number;
}> {
  const dailyLimit = 100; // TODO: move to configService
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const usedToday = await prisma.aiConversation.count({
    where: {
      userId,
      createdAt: { gte: startOfDay },
    },
  });
  return {
    dailyLimit,
    usedToday,
    remaining: Math.max(0, dailyLimit - usedToday),
  };
}
