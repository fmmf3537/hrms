// M0.5-4: LLM 网关 adapter | HRMS
// 用于：AI 智能问答 / AI 算薪校验 / AI 评分建议（V1.2 §三.3 4 个点状能力）
// M0.5-4: mock 实现；生产接 OpenAI 兼容接口（按 config.provider 切换 deepseek/tongyi/openai）

import { env } from '../../lib/env';
import type { AdapterResult, IAdapter, TestResult } from '../adapter.interface';

interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LlmPayload {
  messages: LlmChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export class LlmAdapter implements IAdapter {
  readonly code = 'llm';

  readonly type = 'http_api' as const;

  // eslint-disable-next-line @typescript-eslint/require-await
  async send(payload: unknown, config: Record<string, unknown>): Promise<AdapterResult> {
    const start = Date.now();
    const provider = (config.provider as string) ?? env.LLM_PROVIDER;

    if (provider === 'mock') {
      // 开发/测试：返回 mock 回答
      const { messages } = payload as LlmPayload;
      const lastUserMsg = messages.findLast?.((m) => m.role === 'user') ?? messages[messages.length - 1];
      return {
        success: true,
        recordCount: 1,
        data: {
          provider,
          model: env.LLM_MODEL,
          content: `[MOCK LLM] 这是对「${lastUserMsg?.content?.slice(0, 50) ?? '?'}」的模拟回答。\n\n生产环境请配置 LLM_API_KEY 后启用真实模型（${env.LLM_MODEL}）。`,
          tokens: 100,
        },
        duration: Date.now() - start,
      };
    }

    // 生产：调用 OpenAI 兼容 API（fetch）
    // TODO M0.5.5: 真实集成
    return {
      success: false,
      error: `LLM provider '${provider}' SDK 未实现（M0.5.4 mock 模式已可用，生产需 M0.5.5 接入）`,
      duration: Date.now() - start,
    };
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
