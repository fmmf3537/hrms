// M1-A3: 入职流程 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as onboardingController from '../controllers/onboarding.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const listSchema = z.object({
  companyId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  status: z.enum(['draft', 'submitted', 'approved', 'cancelled']).optional(),
  keyword: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const createSchema = z.object({
  name: z.string().min(1).max(50),
  companyId: z.string().uuid(),
  departmentId: z.string().uuid(),
  hireDate: z.string().min(1),
  contractType: z.enum(['formal', 'intern', 'consultant', 'labor']),
  gender: z.enum(['male', 'female']).optional(),
  birthDate: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  probationMonths: z.number().int().min(0).max(24)
    .optional(),
  baseSalary: z.number().optional(),
  idCard: z.string().optional(),
  bankName: z.string().max(100).optional(),
  bankCard: z.string().optional(),
  certificates: z.unknown().optional(),
  materialsChecklist: z.record(z.boolean()).optional(),
});

const ocrSchema = z.object({
  type: z.enum(['idCard', 'bankCard', 'certificate']),
  imageBase64: z.string().min(1),
});

const confirmSchema = z.object({
  approved: z.boolean().optional(),
  instanceId: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
});

router.get(
  '/',
  requirePermission(PERMISSIONS.ONBOARDING_READ),
  validate(listSchema, 'query'),
  onboardingController.list,
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.ONBOARDING_READ),
  onboardingController.getById,
);

router.post(
  '/',
  requirePermission(PERMISSIONS.ONBOARDING_WRITE),
  validate(createSchema),
  onboardingController.create,
);

router.post(
  '/:id/parse-ocr',
  requirePermission(PERMISSIONS.ONBOARDING_WRITE),
  validate(ocrSchema),
  onboardingController.parseOcr,
);

router.post(
  '/:id/confirm',
  requirePermission(PERMISSIONS.ONBOARDING_CONFIRM),
  validate(confirmSchema),
  onboardingController.confirm,
);

export default router;
