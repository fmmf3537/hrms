// M1-A4: 转正流程 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as regularizationController from '../controllers/regularization.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const listSchema = z.object({
  companyId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const createSchema = z.object({
  employeeId: z.string().uuid(),
  selfEvaluation: z.string().max(5000).optional(),
  managerEvaluation: z.string().max(5000).optional(),
  hrEvaluation: z.string().max(5000).optional(),
  performanceScore: z.number().int().min(0).max(100)
    .optional(),
  newBaseSalary: z.number().optional(),
  newPerformanceSalary: z.number().optional(),
  newTotalSalary: z.number().optional(),
});

const cancelSchema = z.object({
  reason: z.string().min(1).max(500),
});

router.get(
  '/',
  requirePermission(PERMISSIONS.REGULARIZATION_READ),
  validate(listSchema, 'query'),
  regularizationController.list,
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.REGULARIZATION_READ),
  regularizationController.getById,
);

router.post(
  '/',
  requirePermission(PERMISSIONS.REGULARIZATION_WRITE),
  validate(createSchema),
  regularizationController.create,
);

router.post(
  '/:id/cancel',
  requirePermission(PERMISSIONS.REGULARIZATION_WRITE),
  validate(cancelSchema),
  regularizationController.cancel,
);

export default router;
