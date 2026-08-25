// M1-A5: 调动流程 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as transferController from '../controllers/transfer.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const listSchema = z.object({
  employeeId: z.string().uuid().optional(),
  status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'cancelled']).optional(),
  fromDeptId: z.string().uuid().optional(),
  toDeptId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const createSchema = z.object({
  employeeId: z.string().uuid(),
  transferType: z.enum(['transfer', 'promote', 'demote']),
  reason: z.string().max(2000).optional(),
  fromCompanyId: z.string().uuid().optional(),
  fromDeptId: z.string().uuid().optional(),
  toCompanyId: z.string().uuid(),
  toDeptId: z.string().uuid(),
  toPosition: z.string().min(1).max(100),
  newBaseSalary: z.number().optional(),
  newPerformanceSalary: z.number().optional(),
  newTotalSalary: z.number().optional(),
  effectiveDate: z.string().min(1),
});

const updateSchema = z.object({
  transferType: z.enum(['transfer', 'promote', 'demote']).optional(),
  reason: z.string().max(2000).nullable().optional(),
  toCompanyId: z.string().uuid().optional(),
  toDeptId: z.string().uuid().optional(),
  toPosition: z.string().min(1).max(100).optional(),
  newBaseSalary: z.number().nullable().optional(),
  newPerformanceSalary: z.number().nullable().optional(),
  newTotalSalary: z.number().nullable().optional(),
  effectiveDate: z.string().min(1).optional(),
});

const cancelSchema = z.object({
  reason: z.string().min(1).max(500),
});

router.get(
  '/',
  requirePermission(PERMISSIONS.TRANSFER_READ),
  validate(listSchema, 'query'),
  transferController.list,
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.TRANSFER_READ),
  transferController.getById,
);

router.post(
  '/',
  requirePermission(PERMISSIONS.TRANSFER_WRITE),
  validate(createSchema),
  transferController.create,
);

router.post(
  '/:id/update',
  requirePermission(PERMISSIONS.TRANSFER_WRITE),
  validate(updateSchema),
  transferController.update,
);

router.post(
  '/:id/cancel',
  requirePermission(PERMISSIONS.TRANSFER_WRITE),
  validate(cancelSchema),
  transferController.cancel,
);

export default router;
