// M1-A7: 合同管理 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as contractController from '../controllers/contract.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

const attachmentSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  type: z.string().min(1),
  size: z.number().int().min(0),
  uploadedAt: z.string().optional(),
});

const signatorySchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  signed: z.boolean().optional(),
});

const listSchema = z.object({
  employeeId: z.string().uuid().optional(),
  contractType: z.enum(['formal', 'intern', 'consultant', 'labor', 'nda']).optional(),
  status: z.enum([
    'draft', 'pending_signature', 'signing', 'signed', 'expired', 'cancelled',
  ]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const createSchema = z.object({
  employeeId: z.string().uuid(),
  contractType: z.enum(['formal', 'intern', 'consultant', 'labor', 'nda']),
  title: z.string().min(1).max(200),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  probationMonths: z.number().int().min(0).optional(),
  baseSalary: z.number().optional(),
  position: z.string().max(100).optional(),
  workLocation: z.string().max(200).optional(),
  templateKey: z.string().min(1).max(50),
  attachments: z.array(attachmentSchema).max(5).optional(),
  signatories: z.array(signatorySchema).optional(),
});

const updateSchema = z.object({
  contractType: z.enum(['formal', 'intern', 'consultant', 'labor', 'nda']).optional(),
  title: z.string().min(1).max(200).optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  probationMonths: z.number().int().min(0).nullable()
    .optional(),
  baseSalary: z.number().nullable().optional(),
  position: z.string().max(100).nullable().optional(),
  workLocation: z.string().max(200).nullable().optional(),
  templateKey: z.string().min(1).max(50).optional(),
  attachments: z.array(attachmentSchema).max(5).nullable().optional(),
  signatories: z.array(signatorySchema).nullable().optional(),
  submit: z.boolean().optional(),
});

const cancelSchema = z.object({
  reason: z.string().min(1).max(500),
});

const webhookSchema = z.object({
  flowId: z.string().min(1),
  signStatus: z.string().min(1),
  signedAt: z.string().optional(),
  signatories: z.array(signatorySchema).optional(),
});

router.post(
  '/webhook/e-sign',
  validate(webhookSchema),
  contractController.eSignWebhook,
);

router.use(authenticate, rejectIfMustChangePassword);

router.get(
  '/',
  requirePermission(PERMISSIONS.CONTRACT_READ),
  validate(listSchema, 'query'),
  contractController.list,
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.CONTRACT_READ),
  contractController.getById,
);

router.post(
  '/',
  requirePermission(PERMISSIONS.CONTRACT_WRITE),
  validate(createSchema),
  contractController.create,
);

router.post(
  '/:id/update',
  requirePermission(PERMISSIONS.CONTRACT_WRITE),
  validate(updateSchema),
  contractController.update,
);

router.post(
  '/:id/cancel',
  requirePermission(PERMISSIONS.CONTRACT_WRITE),
  validate(cancelSchema),
  contractController.cancel,
);

export default router;
