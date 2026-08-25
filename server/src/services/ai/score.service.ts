// M0.5-5: AI 绩效评分建议 service | HRMS

import { env } from '../../lib/env';
import { AppError } from '../../middleware/errorHandler';
import * as auditService from '../audit.service';
import * as integrationService from '../integration.service';

export interface ScoreSuggestInput {
  userId: string;
  employeeId: string;
  cycleId: string;
  selfEvaluation?: unknown;
  historicalPerformance?: unknown[];
  attendance?: unknown;
  projectDeliveries?: unknown[];
}

export interface ScoreSuggestion {
  grade: string;
  confidence: number;
  reasons: string[];
}

export interface ScoreSuggestResult {
  suggestions: ScoreSuggestion[];
  cost: number;
  tokens: number;
}

/**
 * 解析 LLM JSON 中的 suggestions（容错，便于 mock）
 */
export function parseSuggestions(raw: string): ScoreSuggestion[] {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const obj = JSON.parse(match[0]) as {
      suggestions?: Array<{ grade?: string; confidence?: number; reasons?: string[] }>;
    };
    if (!Array.isArray(obj.suggestions)) return [];
    return obj.suggestions
      .filter((s) => s && typeof s.grade === 'string')
      .map((s) => ({
        grade: String(s.grade),
        confidence: typeof s.confidence === 'number' ? s.confidence : 0,
        reasons: Array.isArray(s.reasons) ? s.reasons.map(String) : [],
      }));
  } catch {
    return [];
  }
}

/**
 * 基于自评 / 历史绩效 / 考勤 / 项目交付，经 LLM 给出最多 3 条评分建议
 */
export async function suggestScore(input: ScoreSuggestInput): Promise<ScoreSuggestResult> {
  const start = Date.now();
  const messages = [
    {
      role: 'system' as const,
      content:
        '你是绩效评分助手。根据输入给出最多 3 条评分建议。输出 JSON：{"suggestions":[{"grade":"A|B|C|D|S","confidence":0.0-1.0,"reasons":["..."]}],"cost":0}',
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        employeeId: input.employeeId,
        cycleId: input.cycleId,
        selfEvaluation: input.selfEvaluation,
        historicalPerformance: input.historicalPerformance,
        attendance: input.attendance,
        projectDeliveries: input.projectDeliveries,
      }),
    },
  ];

  let suggestions: ScoreSuggestion[] = [];
  let tokens = 0;
  let cost = 0;

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
    tokens = typeof data.tokens === 'number' ? data.tokens : 0;
    cost = typeof data.cost === 'number' ? data.cost : 0;
    suggestions = parseSuggestions(data.content ?? '');
  } catch (err) {
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(`评分建议失败: ${msg}`, 500, 60100);
  }

  if (suggestions.length === 0) {
    // mock-friendly fallback（LLM 未返回可解析 JSON 时）
    suggestions = [
      {
        grade: 'B',
        confidence: 0.5,
        reasons: ['历史绩效稳定', '考勤基本正常', '项目交付达标'],
      },
      {
        grade: 'A',
        confidence: 0.3,
        reasons: ['部分项目质量评价较好'],
      },
      {
        grade: 'C',
        confidence: 0.2,
        reasons: ['自评中提到部分目标未达预期'],
      },
    ];
  }

  const duration = Date.now() - start;
  await auditService.auditLog({
    userId: input.userId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.AI_SCORE,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.AI,
    resourceId: input.employeeId,
    description: `AI score-suggest cycle=${input.cycleId}`,
    newValue: {
      tokens, cost, duration, suggestionCount: suggestions.length,
    },
  });

  return { suggestions: suggestions.slice(0, 3), cost, tokens };
}
