// M0.5-5: 地图 adapter | HRMS
// mock：固定反地理编码地址；生产接腾讯地图 reverse geocoding

import type { AdapterResult, IAdapter, TestResult } from '../adapter.interface';

interface MapPayload {
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
}

export class MapAdapter implements IAdapter {
  readonly code = 'map';

  readonly type = 'http_api' as const;

  // eslint-disable-next-line @typescript-eslint/require-await
  async send(payload: unknown, config: Record<string, unknown>): Promise<AdapterResult> {
    const start = Date.now();
    const p = payload as MapPayload;
    const lat = p.lat ?? p.latitude ?? 34.3416;
    const lng = p.lng ?? p.longitude ?? 108.9398;
    const provider = (config.provider as string) ?? 'mock';

    if (provider === 'mock' || !config.key) {
      return {
        success: true,
        recordCount: 1,
        data: {
          lat,
          lng,
          address: '陕西省西安市雁塔区科技路某某大厦',
          province: '陕西省',
          city: '西安市',
          district: '雁塔区',
          provider: 'mock',
        },
        duration: Date.now() - start,
      };
    }

    // TODO M2: 腾讯地图 reverse geocoding 真实接入
    return {
      success: false,
      error: '腾讯地图 SDK 未实现（请使用 mock）',
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
