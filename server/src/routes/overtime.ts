// M2-B4: 加班 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as overtimeController from '../controllers/overtime.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const listSchema = z.object({
  employeeId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  compensationType: z.enum(['pay', 'comp']).optional(),
  status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'cancelled']).optional(),
  dateFrom: z.string().min(1).optional(),
  dateTo: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const createSchema = z.object({
  employeeId: z.string().uuid(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  overtimeType: z.enum(['weekday', 'weekend', 'holiday']).optional(),
  compensationType: z.enum(['pay', 'comp']),
  reason: z.string().min(1).max(2000),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string(),
    type: z.string().optional(),
    size: z.number().optional(),
  })).optional(),
});

const cancelSchema = z.object({
  reason: z.string().min(1).max(500),
});

router.post(
  '/requests',
  requirePermission(PERMISSIONS.OVERTIME_REQUEST),
  validate(createSchema),
  overtimeController.create,
);

router.get(
  '/requests',
  requirePermission(PERMISSIONS.OVERTIME_READ),
  validate(listSchema, 'query'),
  overtimeController.list,
);

router.post(
  '/requests/:id/cancel',
  requirePermission(PERMISSIONS.OVERTIME_CANCEL),
  validate(cancelSchema),
  overtimeController.cancel,
);

export default router;
