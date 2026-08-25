// M0.5-4/M0.5-5: LLM 网关 adapter | HRMS
// 支持 embedding + chat（OpenAI 兼容）；mock 返回固定向量 / 模拟回答

import { env } from '../../lib/env';
import type { AdapterResult, IAdapter, TestResult } from '../adapter.interface';

interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LlmPayload {
  type?: 'embedding' | 'chat';
  messages?: LlmChatMessage[];
  input?: string | string[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

function mockEmbedding(dim: number): number[] {
  return Array.from({ length: dim }, () => 0.1);
}

export class LlmAdapter implements IAdapter {
  readonly code = 'llm';

  readonly type = 'http_api' as const;

  async send(payload: unknown, config: Record<string, unknown>): Promise<AdapterResult> {
    const start = Date.now();
    const provider = (config.provider as string) ?? env.LLM_PROVIDER;
    const p = payload as LlmPayload;

    // 兼容：有 messages 且无 type → 视为 chat
    let type: 'embedding' | 'chat' = 'chat';
    if (p.type === 'embedding') {
      type = 'embedding';
    }

    if (type === 'embedding') {
      return this.handleEmbedding(p, provider, config, start);
    }
    return this.handleChat(p, provider, config, start);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async handleEmbedding(
    p: LlmPayload,
    provider: string,
    config: Record<string, unknown>,
    start: number,
  ): Promise<AdapterResult> {
    const inputs = Array.isArray(p.input) ? p.input : [String(p.input ?? '')];
    const dim = env.EMBEDDING_DIM;

    if (provider === 'mock') {
      return {
        success: true,
        recordCount: inputs.length,
        data: {
          provider,
          model: env.EMBEDDING_MODEL,
          embeddings: inputs.map(() => mockEmbedding(dim)),
        },
        duration: Date.now() - start,
      };
    }

    const baseUrl = (config.baseUrl as string) || env.LLM_BASE_URL;
    const apiKey = (config.apiKey as string) || env.LLM_API_KEY;
    const model = (p.model as string) || env.EMBEDDING_MODEL;

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: inputs }),
      });
      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          error: `Embedding API ${res.status}: ${text.slice(0, 200)}`,
          duration: Date.now() - start,
        };
      }
      const json = (await res.json()) as {
        data?: Array<{ embedding: number[] }>;
      };
      const embeddings = (json.data ?? []).map((d) => d.embedding);
      return {
        success: true,
        recordCount: embeddings.length,
        data: { provider, model, embeddings },
        duration: Date.now() - start,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Embedding 请求失败: ${msg}`,
        duration: Date.now() - start,
      };
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async handleChat(
    p: LlmPayload,
    provider: string,
    config: Record<string, unknown>,
    start: number,
  ): Promise<AdapterResult> {
    const messages = p.messages ?? [];

    if (provider === 'mock') {
      const lastUserMsg = messages.findLast?.((m) => m.role === 'user')
        ?? messages[messages.length - 1];
      const preview = lastUserMsg?.content?.slice(0, 50) ?? '?';
      // 评分建议场景：返回可解析 JSON
      const looksLikeScore = preview.includes('employeeId') || preview.includes('selfEvaluation');
      const looksLikeSummary = preview.includes('payroll') || preview.includes('类型：');
      let content: string;
      if (looksLikeScore) {
        content = JSON.stringify({
          suggestions: [
            { grade: 'A', confidence: 0.62, reasons: ['近 3 个月绩效稳定', '项目交付准时', '无缺勤'] },
            { grade: 'B', confidence: 0.28, reasons: ['本月迟到 1 次'] },
            { grade: 'C', confidence: 0.1, reasons: ['部分目标未达预期'] },
          ],
        });
      } else if (looksLikeSummary) {
        content = JSON.stringify({
          summary: `[MOCK] 业务摘要：${preview}`,
          highlights: ['关键变化点 1', '关键变化点 2'],
        });
      } else {
        content = `[MOCK LLM] 这是对「${preview}」的模拟回答。\n\n生产环境请配置 LLM_API_KEY 后启用真实模型（${env.LLM_DEFAULT_MODEL || env.LLM_MODEL}）。`;
      }
      return {
        success: true,
        recordCount: 1,
        data: {
          provider,
          model: (config.model as string) || env.LLM_DEFAULT_MODEL || env.LLM_MODEL,
          content,
          tokens: 100,
          cost: 0.01,
        },
        duration: Date.now() - start,
      };
    }

    const baseUrl = (config.baseUrl as string) || env.LLM_BASE_URL;
    const apiKey = (config.apiKey as string) || env.LLM_API_KEY;
    const model = p.model || (config.model as string) || env.LLM_DEFAULT_MODEL || env.LLM_MODEL;

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: p.temperature ?? env.LLM_TEMPERATURE,
          max_tokens: p.maxTokens ?? env.LLM_MAX_TOKENS_QA,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          error: `Chat API ${res.status}: ${text.slice(0, 200)}`,
          duration: Date.now() - start,
        };
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };
      const content = json.choices?.[0]?.message?.content ?? '';
      const tokens = json.usage?.total_tokens ?? 0;
      return {
        success: true,
        recordCount: 1,
        data: {
          provider, model, content, tokens, cost: 0,
        },
        duration: Date.now() - start,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Chat 请求失败: ${msg}`,
        duration: Date.now() - start,
      };
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async testConnection(_config: Record<string, unknown>): Promise<TestResult> {
    const start = Date.now();
    return { success: true, latency: Date.now() - start };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async sync(_config: Record<string, unknown>): Promise<AdapterResult> {
    return { success: true, recordCount: 0 };
  }
}
