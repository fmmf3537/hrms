// M0.5-4: 短信 adapter | HRMS
// 替换 M0.5-2 的 console.log mock
// M0.5-4: mock 实现（dev/test）；生产环境接阿里云 / 腾讯云 SDK（按 config.provider 切换）

import { env } from '../../lib/env';
import type { AdapterResult, IAdapter, TestResult } from '../adapter.interface';

export class SmsAdapter implements IAdapter {
  readonly code = 'sms';

  readonly type = 'http_api' as const;

  // eslint-disable-next-line @typescript-eslint/require-await
  async send(payload: unknown, config: Record<string, unknown>): Promise<AdapterResult> {
    const start = Date.now();
    const provider = (config.provider as string) ?? env.SMS_PROVIDER;

    if (provider === 'mock') {
      // 开发/测试：模拟发送
      // eslint-disable-next-line no-console
      console.log(`[MOCK SMS] provider=${provider}`, JSON.stringify(payload));
      return {
        success: true,
        recordCount: 1,
        data: { provider, messageId: `mock-msg-${Date.now()}` },
        duration: Date.now() - start,
      };
    }

    // 生产：调用阿里云 / 腾讯云 SDK
    // M0.5-4 阶段先抛错提示用户配置 SDK
    // TODO M0.5.5: 集成 @alicloud/dysmsapi 或 tencentcloud-sdk
    return {
      success: false,
      error: `SMS provider '${provider}' SDK 未实现（M0.5.4 mock 模式已可用，生产需 M0.5.5 接入）`,
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
