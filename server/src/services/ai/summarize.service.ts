// M0.5-5: AI 摘要 service | HRMS
// 带 ai_summaries 缓存（hit / miss / expired）

import { env } from '../../lib/env';
import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import * as auditService from '../audit.service';
import * as integrationService from '../integration.service';

/** // TODO: move to configService — 摘要缓存 TTL */
const SUMMARY_TTL_MS = 24 * 60 * 60 * 1000;

export type SummaryType = string; // payroll_diff | performance_summary | contract_renewal | ...

export interface SummarizeInput {
  type: SummaryType;
  referenceId?: string;
  data: unknown;
  userId: string;
}

export interface SummarizeResult {
  summary: string;
  highlights: string[];
  cost: number;
  tokens: number;
  cached: boolean;
  summaryId: string;
}

function tryParseSummaryJson(raw: string): { summary: string; highlights: string[] } {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const obj = JSON.parse(match[0]) as { summary?: string; highlights?: string[] };
      return {
        summary: obj.summary ?? raw,
        highlights: Array.isArray(obj.highlights) ? obj.highlights : [],
      };
    }
  } catch {
    // fall through
  }
  return { summary: raw, highlights: [] };
}

/**
 * 生成业务摘要；优先读未过期缓存，否则调 LLM 并写入 ai_summaries
 */
export async function summarize(input: SummarizeInput): Promise<SummarizeResult> {
  const now = new Date();

  if (input.referenceId) {
    const cached = await prisma.aiSummary.findFirst({
      where: {
        type: input.type,
        referenceId: input.referenceId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (cached) {
      const expired = cached.expiresAt != null && cached.expiresAt.getTime() <= now.getTime();
      if (!expired) {
        await auditService.auditLog({
          userId: input.userId,
          actorType: 'USER',
          action: auditService.AUDIT_ACTIONS.AI_SUMMARIZE,
          resourceType: auditService.AUDIT_RESOURCE_TYPES.AI,
          resourceId: cached.id,
          description: `AI summarize cache hit: ${input.type}`,
          newValue: { cached: true, type: input.type },
        });
        return {
          summary: cached.content,
          highlights: Array.isArray(cached.highlights)
            ? (cached.highlights as string[])
            : [],
          cost: Number(cached.cost),
          tokens: cached.tokens,
          cached: true,
          summaryId: cached.id,
        };
      }
      // expired → 继续生成
    }
  }

  const start = Date.now();
  const messages = [
    {
      role: 'system' as const,
      content: '你是 HRMS 业务摘要助手。请用简洁中文总结关键差异与建议，并列出 2-5 条高亮要点。输出 JSON：{"summary":"...","highlights":["..."]}',
    },
    {
      role: 'user' as const,
      content: `类型：${input.type}\n数据：${JSON.stringify(input.data)}`,
    },
  ];

  let content = '';
  let highlights: string[] = [];
  let tokens = 0;
  let cost = 0;

  try {
    const llmResult = await integrationService.send({
      code: 'llm',
      payload: {
        type: 'chat',
        messages,
        temperature: env.LLM_TEMPERATURE,
        maxTokens: env.LLM_MAX_TOKENS_SUMMARY,
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
    tokens = typeof data.tokens === 'number' ? data.tokens : 0;
    cost = typeof data.cost === 'number' ? data.cost : 0;
    const raw = data.content ?? '';
    const parsed = tryParseSummaryJson(raw);
    content = parsed.summary;
    highlights = parsed.highlights;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(`摘要生成失败: ${msg}`, 500, 60100);
  }

  const duration = Date.now() - start;
  const expiresAt = new Date(Date.now() + SUMMARY_TTL_MS);
  const row = await prisma.aiSummary.create({
    data: {
      type: input.type,
      referenceId: input.referenceId ?? null,
      content,
      highlights: highlights as object,
      tokens,
      cost,
      duration,
      expiresAt,
    },
  });

  await auditService.auditLog({
    userId: input.userId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.AI_SUMMARIZE,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.AI,
    resourceId: row.id,
    description: `AI summarize: ${input.type}`,
    newValue: {
      cached: false, tokens, cost, duration,
    },
  });

  return {
    summary: content,
    highlights,
    cost,
    tokens,
    cached: false,
    summaryId: row.id,
  };
}
