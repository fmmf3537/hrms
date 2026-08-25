// M0.5-5: AI 底座 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as documentService from '../services/ai/document.service';
import * as ocrService from '../services/ai/ocr.service';
import * as qaService from '../services/ai/qa.service';
import * as scoreService from '../services/ai/score.service';
import * as summarizeService from '../services/ai/summarize.service';

export const ocr = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const body = req.body as {
    documentType: 'id_card' | 'bank_card' | 'certificate';
    imageBase64?: string;
  };
  const result = await ocrService.recognize(
    {
      documentType: body.documentType,
      imageBase64: body.imageBase64,
    },
    userId,
    {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    },
  );
  res.json({ success: true, data: result });
});

export const qa = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const body = req.body as { question: string; context?: Record<string, unknown> };
  const result = await qaService.ask({
    userId,
    question: body.question,
    context: body.context,
  });
  res.json({ success: true, data: result });
});

export const summarize = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const body = req.body as {
    type: string;
    referenceId?: string;
    data: unknown;
  };
  const result = await summarizeService.summarize({
    type: body.type,
    referenceId: body.referenceId,
    data: body.data,
    userId,
  });
  res.json({ success: true, data: result });
});

export const scoreSuggest = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const body = req.body as {
    employeeId: string;
    cycleId: string;
    selfEvaluation?: unknown;
    historicalPerformance?: unknown[];
    attendance?: unknown;
    projectDeliveries?: unknown[];
  };
  const result = await scoreService.suggestScore({
    userId,
    ...body,
  });
  res.json({ success: true, data: result });
});

export const listDocuments = asyncHandler(async (req: Request, res: Response) => {
  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;
  const sourceType = req.query.sourceType as string | undefined;
  const result = await documentService.listDocuments({
    page,
    pageSize,
    sourceType,
  });
  res.json({
    success: true,
    data: result.data,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
});

export const createDocument = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const body = req.body as {
    title: string;
    sourceType: string;
    content: string;
    metadata?: Record<string, unknown>;
  };
  const doc = await documentService.createDocument({
    ...body,
    createdBy: userId,
  });
  res.status(201).json({ success: true, data: doc });
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const { id } = req.params;
  await documentService.softDelete(id, userId);
  res.json({ success: true });
});

export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;
  const result = await qaService.listConversations(userId, page, pageSize);
  res.json({
    success: true, data: result.data, total: result.total, page, pageSize,
  });
});

export const quota = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user!;
  const result = await qaService.getQuota(userId);
  res.json({ success: true, data: result });
});
