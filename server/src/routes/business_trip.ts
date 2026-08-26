// M2-B5: 出差 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as businessTripController from '../controllers/business_trip.controller';
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
  destination: z.string().max(100).optional(),
  status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'cancelled']).optional(),
  dateFrom: z.string().min(1).optional(),
  dateTo: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const createSchema = z.object({
  employeeId: z.string().uuid(),
  destination: z.string().min(1).max(100),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().min(1).max(2000),
  projectCode: z.string().max(50).optional(),
});

const cancelSchema = z.object({
  reason: z.string().min(1).max(500),
});

router.post(
  '/requests',
  requirePermission(PERMISSIONS.TRIP_REQUEST),
  validate(createSchema),
  businessTripController.create,
);

router.get(
  '/requests',
  requirePermission(PERMISSIONS.TRIP_READ),
  validate(listSchema, 'query'),
  businessTripController.list,
);

router.post(
  '/requests/:id/cancel',
  requirePermission(PERMISSIONS.TRIP_CANCEL),
  validate(cancelSchema),
  businessTripController.cancel,
);

export default router;
