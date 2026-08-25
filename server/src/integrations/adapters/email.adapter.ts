// M0.5-4: 邮件 adapter | HRMS
// 替换 M0.5-2 的 console.log mock
// M0.5-4: mock 实现；生产接 nodemailer + SMTP（按 env.SMTP_* 切换）

import { env } from '../../lib/env';
import type { AdapterResult, IAdapter, TestResult } from '../adapter.interface';

export class EmailAdapter implements IAdapter {
  readonly code = 'email';

  readonly type = 'http_api' as const;

  // eslint-disable-next-line @typescript-eslint/require-await
  async send(payload: unknown, _config: Record<string, unknown>): Promise<AdapterResult> {
    const start = Date.now();

    // mock 模式（开发/测试，或 SMTP 未配置）
    if (!env.SMTP_HOST) {
      // eslint-disable-next-line no-console
      console.log(`[MOCK EMAIL] to=${(payload as { to?: string }).to ?? '?'}`, JSON.stringify(payload));
      return {
        success: true,
        recordCount: 1,
        data: { messageId: `mock-email-${Date.now()}` },
        duration: Date.now() - start,
      };
    }

    // 生产：调用 nodemailer
    // TODO M0.5.5: 集成 nodemailer + 真实 SMTP
    return {
      success: false,
      error: 'SMTP 邮件发送 SDK 未实现（M0.5.4 mock 模式已可用，生产需 M0.5.5 接入 nodemailer）',
      duration: Date.now() - start,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async testConnection(_config: Record<string, unknown>): Promise<TestResult> {
    const start = Date.now();
    if (!env.SMTP_HOST) {
      return { success: true, latency: Date.now() - start, error: 'SMTP 未配置，使用 mock 模式' };
    }
    // TODO M0.5.5: 真实测试连接
    return { success: true, latency: Date.now() - start };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async sync(_config: Record<string, unknown>): Promise<AdapterResult> {
    return { success: true, recordCount: 0 };
  }
}
