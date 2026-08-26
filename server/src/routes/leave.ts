// M2-B3: 请假 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as leaveController from '../controllers/leave.controller';
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
  leaveType: z.enum([
    'annual', 'sick', 'personal', 'compensatory',
    'marriage', 'maternity', 'paternity', 'bereavement',
  ]).optional(),
  status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'cancelled']).optional(),
  dateFrom: z.string().min(1).optional(),
  dateTo: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const createSchema = z.object({
  employeeId: z.string().uuid(),
  leaveType: z.enum([
    'annual', 'sick', 'personal', 'compensatory',
    'marriage', 'maternity', 'paternity', 'bereavement',
  ]),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().max(2000).optional(),
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

const balanceSchema = z.object({
  employeeId: z.string().uuid(),
  leaveType: z.enum([
    'annual', 'sick', 'personal', 'compensatory',
    'marriage', 'maternity', 'paternity', 'bereavement',
  ]),
  year: z.coerce.number().int().min(2000).max(2100)
    .optional(),
});

router.get(
  '/balance',
  requirePermission(PERMISSIONS.LEAVE_REQUEST),
  validate(balanceSchema, 'query'),
  leaveController.balance,
);

router.post(
  '/requests',
  requirePermission(PERMISSIONS.LEAVE_REQUEST),
  validate(createSchema),
  leaveController.create,
);

router.get(
  '/requests',
  requirePermission(PERMISSIONS.LEAVE_READ),
  validate(listSchema, 'query'),
  leaveController.list,
);

router.get(
  '/requests/:id',
  requirePermission(PERMISSIONS.LEAVE_READ),
  leaveController.getById,
);

router.post(
  '/requests/:id/cancel',
  requirePermission(PERMISSIONS.LEAVE_CANCEL),
  validate(cancelSchema),
  leaveController.cancel,
);

export default router;
