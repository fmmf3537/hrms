// M1-A6: 离职流程 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as offboardingController from '../controllers/offboarding.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const listSchema = z.object({
  companyId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  status: z.enum([
    'draft', 'handover_pending', 'submitted', 'approved',
    'certificate_issued', 'rejected', 'cancelled',
  ]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const createSchema = z.object({
  employeeId: z.string().uuid(),
  resignationType: z.enum(['employee_initiated', 'company_initiated']),
  reason: z.string().max(2000).optional(),
  lastWorkingDate: z.string().min(1),
});

const cancelSchema = z.object({
  reason: z.string().min(1).max(500),
});

router.get(
  '/',
  requirePermission(PERMISSIONS.OFFBOARDING_READ),
  validate(listSchema, 'query'),
  offboardingController.list,
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.OFFBOARDING_READ),
  offboardingController.getById,
);

router.post(
  '/',
  requirePermission(PERMISSIONS.OFFBOARDING_WRITE),
  validate(createSchema),
  offboardingController.create,
);

router.post(
  '/:id/confirm-handover',
  requirePermission(PERMISSIONS.OFFBOARDING_WRITE),
  offboardingController.confirmHandover,
);

router.post(
  '/:id/cancel',
  requirePermission(PERMISSIONS.OFFBOARDING_WRITE),
  validate(cancelSchema),
  offboardingController.cancel,
);

router.post(
  '/:id/issue-certificate',
  requirePermission(PERMISSIONS.OFFBOARDING_CERTIFICATE),
  offboardingController.issueCertificate,
);

export default router;
