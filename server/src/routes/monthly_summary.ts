// M2-B6: 月度考勤汇总 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as monthlySummaryController from '../controllers/monthly_summary.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const generateSchema = z.object({
  year: z.number().int().min(1970).max(9999),
  month: z.number().int().min(1).max(12),
  employeeId: z.string().uuid().optional(),
});

const listSchema = z.object({
  employeeId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  year: z.coerce.number().int().min(1970).max(9999),
  month: z.coerce.number().int().min(1).max(12),
  status: z.enum(['draft', 'employee_confirmed', 'hr_locked']).optional(),
});

router.post(
  '/generate',
  requirePermission(PERMISSIONS.SUMMARY_LOCK),
  validate(generateSchema),
  monthlySummaryController.generate,
);

router.get(
  '/',
  requirePermission(PERMISSIONS.SUMMARY_READ),
  validate(listSchema, 'query'),
  monthlySummaryController.list,
);

router.post(
  '/:id/confirm',
  requirePermission(PERMISSIONS.SUMMARY_READ),
  monthlySummaryController.confirm,
);

router.post(
  '/:id/lock',
  requirePermission(PERMISSIONS.SUMMARY_LOCK),
  monthlySummaryController.lock,
);

export default router;
