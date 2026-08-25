// M0.5-5: OCR service | HRMS
// 经 integrationService → ocr adapter 识别证件，写审计

import { AppError } from '../../middleware/errorHandler';
import * as auditService from '../audit.service';
import * as integrationService from '../integration.service';

export type OcrDocumentType = 'id_card' | 'bank_card' | 'certificate';

export interface OcrRecognizeInput {
  documentType: OcrDocumentType;
  imageBase64?: string;
  fileBuffer?: Buffer;
}

export interface OcrRecognizeMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface OcrRecognizeResult {
  documentType: OcrDocumentType;
  fields: Record<string, unknown>;
  confidence: number;
  cost: number;
}

/**
 * OCR 识别身份证 / 银行卡 / 证书，返回结构化字段与置信度
 */
export async function recognize(
  input: OcrRecognizeInput,
  userId: string,
  meta: OcrRecognizeMeta = {},
): Promise<OcrRecognizeResult> {
  const imageBase64 = input.imageBase64
    ?? (input.fileBuffer ? input.fileBuffer.toString('base64') : undefined);

  if (!imageBase64) {
    throw new AppError('缺少图片数据（imageBase64 或 fileBuffer）', 400, 60121);
  }

  let result;
  try {
    result = await integrationService.send({
      code: 'ocr',
      payload: {
        documentType: input.documentType,
        imageBase64,
      },
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(`OCR 服务调用失败: ${msg}`, 400, 60120);
  }

  if (!result.success) {
    throw new AppError(result.error ?? 'OCR 识别失败', 400, 60121);
  }

  const data = (result.data ?? {}) as {
    fields?: Record<string, unknown>;
    confidence?: number;
    cost?: number;
  };

  const fields = data.fields ?? {};
  const confidence = typeof data.confidence === 'number' ? data.confidence : 0;
  const cost = typeof data.cost === 'number' ? data.cost : 0;

  await auditService.auditLog({
    userId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.AI_OCR,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.AI,
    description: `OCR ${input.documentType}`,
    newValue: { documentType: input.documentType, confidence, cost },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return {
    documentType: input.documentType,
    fields,
    confidence,
    cost,
  };
}
