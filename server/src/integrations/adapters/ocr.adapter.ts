// M0.5-5: OCR adapter | HRMS
// mock：按 documentType 返回结构化字段；生产接腾讯云/百度 OCR

import { env } from '../../lib/env';
import type { AdapterResult, IAdapter, TestResult } from '../adapter.interface';

interface OcrPayload {
  documentType: 'id_card' | 'bank_card' | 'certificate';
  imageBase64?: string;
}

const MOCK_FIELDS: Record<string, Record<string, unknown>> = {
  id_card: {
    name: '张三',
    id_card_number: '110101199003078812',
    gender: 'male',
    birth_date: '1990-03-07',
    address: '北京市东城区某某街道1号',
    issue_authority: '北京市公安局东城分局',
    valid_period: '2010.03.07-2030.03.07',
  },
  bank_card: {
    bank_name: '中国工商银行',
    card_number: '6222021234567890123',
    card_type: 'debit',
    holder_name: '张三',
  },
  certificate: {
    certificate_name: '软件工程师资格证书',
    holder_name: '张三',
    issue_date: '2020-06-01',
    issue_authority: '工业和信息化部',
    certificate_no: 'CERT-2020-0001',
  },
};

export class OcrAdapter implements IAdapter {
  readonly code = 'ocr';

  readonly type = 'http_api' as const;

  // eslint-disable-next-line @typescript-eslint/require-await
  async send(payload: unknown, config: Record<string, unknown>): Promise<AdapterResult> {
    const start = Date.now();
    const { documentType } = payload as OcrPayload;
    const provider = (config.provider as string) ?? env.OCR_PROVIDER;

    if (!documentType || !MOCK_FIELDS[documentType]) {
      return {
        success: false,
        error: `不支持的 documentType: ${documentType ?? '(empty)'}`,
        duration: Date.now() - start,
      };
    }

    if (provider === 'mock' || !env.OCR_SECRET_ID) {
      return {
        success: true,
        recordCount: 1,
        data: {
          documentType,
          fields: MOCK_FIELDS[documentType],
          confidence: 0.987,
          cost: 0.05,
          provider: 'mock',
        },
        duration: Date.now() - start,
      };
    }

    // 生产：腾讯云 / 百度 OCR SDK 待接入
    // TODO M1: 真实 OCR 集成（腾讯云 OCR / 百度 OCR）
    return {
      success: false,
      error: `OCR provider '${provider}' SDK 未实现（请使用 mock 或等待生产接入）`,
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
