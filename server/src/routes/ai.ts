// M0.5-5: AI 底座 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as aiController from '../controllers/ai.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const ocrSchema = z.object({
  documentType: z.enum(['id_card', 'bank_card', 'certificate']),
  imageBase64: z.string().min(1).max(15_000_000),
});

router.post(
  '/ocr',
  requirePermission(PERMISSIONS.AI_OCR),
  validate(ocrSchema),
  aiController.ocr,
);

const qaSchema = z.object({
  question: z.string().min(1).max(2000),
  context: z.record(z.unknown()).optional(),
});

router.post(
  '/qa',
  requirePermission(PERMISSIONS.AI_QA),
  validate(qaSchema),
  aiController.qa,
);

const summarizeSchema = z.object({
  type: z.enum(['payroll_diff', 'performance_summary', 'contract_renewal']),
  referenceId: z.string().uuid().optional(),
  data: z.unknown(),
});

router.post(
  '/summarize',
  requirePermission(PERMISSIONS.AI_SUMMARIZE),
  validate(summarizeSchema),
  aiController.summarize,
);

const scoreSchema = z.object({
  employeeId: z.string().uuid(),
  cycleId: z.string().uuid(),
  selfEvaluation: z.unknown().optional(),
  historicalPerformance: z.array(z.unknown()).optional(),
  attendance: z.unknown().optional(),
  projectDeliveries: z.array(z.unknown()).optional(),
});

router.post(
  '/score-suggest',
  requirePermission(PERMISSIONS.AI_SCORE),
  validate(scoreSchema),
  aiController.scoreSuggest,
);

const listDocsSchema = z.object({
  sourceType: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

router.get(
  '/documents',
  requirePermission(PERMISSIONS.AI_DOCUMENT_READ),
  validate(listDocsSchema, 'query'),
  aiController.listDocuments,
);

const createDocSchema = z.object({
  title: z.string().min(1).max(500),
  sourceType: z.string().min(1).max(50),
  content: z.string().min(1).max(500_000),
  metadata: z.record(z.unknown()).optional(),
});

router.post(
  '/documents',
  requirePermission(PERMISSIONS.AI_DOCUMENT_WRITE),
  validate(createDocSchema),
  aiController.createDocument,
);

router.delete(
  '/documents/:id',
  requirePermission(PERMISSIONS.AI_DOCUMENT_WRITE),
  aiController.deleteDocument,
);

const listConvSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

router.get(
  '/conversations',
  requirePermission(PERMISSIONS.AI_CONVERSATION_READ),
  validate(listConvSchema, 'query'),
  aiController.listConversations,
);

router.get(
  '/quota',
  requirePermission(PERMISSIONS.AI_QA),
  aiController.quota,
);

export default router;
