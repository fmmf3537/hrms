// M3-D1: 绩效管理 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as performanceController from '../controllers/performance.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const cycleCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  type: z.enum(['monthly', 'quarterly', 'yearly']),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  description: z.string().max(2000).optional(),
});

const cycleUpdateSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['draft', 'active', 'closed']).optional(),
});

const cycleListSchema = z.object({
  type: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
  status: z.enum(['draft', 'active', 'closed']).optional(),
  year: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const indicatorCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  type: z.enum(['KPI', 'OKR', 'BSC', '360']),
  category: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  defaultWeight: z.number().positive().max(100).optional(),
  target: z.string().max(2000).optional(),
  unit: z.string().max(50).optional(),
  scoringRule: z.string().max(2000).optional(),
});

const indicatorListSchema = z.object({
  type: z.enum(['KPI', 'OKR', 'BSC', '360']).optional(),
  status: z.enum(['active', 'archived']).optional(),
  category: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const schemeIndicatorSchema = z.object({
  indicatorId: z.string().uuid(),
  weight: z.number().positive().max(100),
  target: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const schemeCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  cycleId: z.string().uuid().optional(),
  applicableScope: z.enum(['company', 'department', 'position']),
  applicableDeptId: z.string().uuid().optional(),
  applicablePositionLevel: z.string().max(50).optional(),
  description: z.string().max(2000).optional(),
  indicators: z.array(schemeIndicatorSchema).min(1),
});

const schemeListSchema = z.object({
  cycleId: z.string().uuid().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  applicableScope: z.enum(['company', 'department', 'position']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const schemeCloneSchema = z.object({
  newCode: z.string().min(1).max(50),
  newName: z.string().min(1).max(200),
});

const coefficientUpdateSchema = z.object({
  S: z.number().positive().max(10),
  A: z.number().positive().max(10),
  B: z.number().positive().max(10),
  C: z.number().positive().max(10),
  D: z.number().positive().max(10),
});

router.post(
  '/cycles',
  requirePermission(PERMISSIONS.PERFORMANCE_CYCLE_WRITE),
  validate(cycleCreateSchema),
  performanceController.createCycle,
);

router.get(
  '/cycles',
  requirePermission(PERMISSIONS.PERFORMANCE_CYCLE_READ),
  validate(cycleListSchema, 'query'),
  performanceController.listCycles,
);

router.patch(
  '/cycles/:id',
  requirePermission(PERMISSIONS.PERFORMANCE_CYCLE_WRITE),
  validate(cycleUpdateSchema),
  performanceController.updateCycle,
);

router.post(
  '/indicators',
  requirePermission(PERMISSIONS.PERFORMANCE_INDICATOR_WRITE),
  validate(indicatorCreateSchema),
  performanceController.createIndicator,
);

router.get(
  '/indicators',
  requirePermission(PERMISSIONS.PERFORMANCE_INDICATOR_READ),
  validate(indicatorListSchema, 'query'),
  performanceController.listIndicators,
);

router.post(
  '/schemes',
  requirePermission(PERMISSIONS.PERFORMANCE_SCHEME_WRITE),
  validate(schemeCreateSchema),
  performanceController.createScheme,
);

router.get(
  '/schemes',
  requirePermission(PERMISSIONS.PERFORMANCE_SCHEME_READ),
  validate(schemeListSchema, 'query'),
  performanceController.listSchemes,
);

router.post(
  '/schemes/:id/clone',
  requirePermission(PERMISSIONS.PERFORMANCE_SCHEME_WRITE),
  validate(schemeCloneSchema),
  performanceController.cloneScheme,
);

router.get(
  '/coefficients',
  requirePermission(PERMISSIONS.PERFORMANCE_COEFFICIENT_READ),
  performanceController.getCoefficients,
);

router.patch(
  '/coefficients',
  requirePermission(PERMISSIONS.PERFORMANCE_COEFFICIENT_WRITE),
  validate(coefficientUpdateSchema),
  performanceController.updateCoefficients,
);

export default router;
