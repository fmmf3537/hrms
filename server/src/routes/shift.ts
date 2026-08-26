// M2-B1: 班次定义 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as shiftController from '../controllers/shift.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const listSchema = z.object({
  companyId: z.string().uuid().optional(),
  shiftType: z.enum(['standard', 'comprehensive', 'flexible']).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const createSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  shiftType: z.enum(['standard', 'comprehensive', 'flexible']),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  breakStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  breakEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  workHours: z.number().min(0).max(24),
  flexMinutes: z.number().int().min(0).max(60)
    .optional(),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().min(1).optional(),
  companyId: z.string().uuid(),
  description: z.string().max(2000).optional(),
});

const updateSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(100).optional(),
  shiftType: z.enum(['standard', 'comprehensive', 'flexible']).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  breakStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  breakEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  workHours: z.number().min(0).max(24).optional(),
  flexMinutes: z.number().int().min(0).max(60)
    .optional(),
  effectiveFrom: z.string().min(1).optional(),
  effectiveTo: z.string().min(1).nullable().optional(),
  companyId: z.string().uuid().optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

const assignSchema = z.object({
  shiftId: z.string().uuid(),
  assigneeType: z.enum(['employee', 'department']),
  employeeIds: z.array(z.string().uuid()).optional(),
  departmentIds: z.array(z.string().uuid()).optional(),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().min(1).optional(),
  remark: z.string().max(500).optional(),
});

router.get(
  '/',
  requirePermission(PERMISSIONS.SHIFT_READ),
  validate(listSchema, 'query'),
  shiftController.list,
);

router.post(
  '/assignments',
  requirePermission(PERMISSIONS.SHIFT_ASSIGN),
  validate(assignSchema),
  shiftController.assign,
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.SHIFT_READ),
  shiftController.getById,
);

router.post(
  '/',
  requirePermission(PERMISSIONS.SHIFT_WRITE),
  validate(createSchema),
  shiftController.create,
);

router.put(
  '/:id',
  requirePermission(PERMISSIONS.SHIFT_WRITE),
  validate(updateSchema),
  shiftController.update,
);

export default router;
