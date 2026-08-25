// M0.5-4: e-签宝 adapter | HRMS
// 选型决策见 docs/e-sign-cost.md
// M0.5-4: 仅实现接口 + mock；真实 SDK 在 production 模式启用

import type { AdapterResult, IAdapter, TestResult } from '../adapter.interface';

export class EsignAdapter implements IAdapter {
  readonly code = 'esign';

  readonly type = 'http_api' as const;

  // eslint-disable-next-line @typescript-eslint/require-await
  async send(payload: unknown, _config: Record<string, unknown>): Promise<AdapterResult> {
    // M0.5-4: mock 实现，发起签署
    const start = Date.now();
    // eslint-disable-next-line no-console
    console.log('[MOCK ESIGN] initiate signing:', JSON.stringify(payload));
    return {
      success: true,
      recordCount: 1,
      data: { flowId: `mock-flow-${Date.now()}`, signingUrl: 'https://example.com/sign' },
      duration: Date.now() - start,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async testConnection(_config: Record<string, unknown>): Promise<TestResult> {
    const start = Date.now();
    // eslint-disable-next-line no-console
    console.log('[MOCK ESIGN] testConnection');
    return { success: true, latency: Date.now() - start };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async sync(_config: Record<string, unknown>): Promise<AdapterResult> {
    return { success: true, recordCount: 0 };
  }
}
