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

const scoreItemSchema = z.object({
  indicatorId: z.string().uuid(),
  score: z.number().min(0).max(100),
  comment: z.string().max(2000).optional(),
});

const saveScoreSchema = z.object({
  comment: z.string().max(2000).optional(),
  items: z.array(scoreItemSchema).min(1),
  basedOnAiSuggestionId: z.string().uuid().optional(),
});

const recordCreateSchema = z.object({
  cycleId: z.string().uuid(),
  employeeIds: z.array(z.string().uuid()).min(1),
  schemeId: z.string().uuid().optional(),
});

const recordListSchema = z.object({
  cycleId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  status: z.string().max(30).optional(),
  deptId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const ceoApproveSchema = z.object({
  finalGrade: z.enum(['S', 'A', 'B', 'C', 'D']),
  finalScore: z.number().min(0).max(100),
  comment: z.string().max(2000).optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(5).max(2000),
});

router.post(
  '/records',
  requirePermission(PERMISSIONS.PERFORMANCE_RECORD_WRITE),
  validate(recordCreateSchema),
  performanceController.createRecord,
);

router.get(
  '/records',
  requirePermission(PERMISSIONS.PERFORMANCE_RECORD_READ),
  validate(recordListSchema, 'query'),
  performanceController.listRecords,
);

router.get(
  '/records/:id',
  requirePermission(PERMISSIONS.PERFORMANCE_RECORD_READ),
  performanceController.getRecord,
);

router.patch(
  '/records/:id/self',
  requirePermission(PERMISSIONS.PERFORMANCE_SELF_SUBMIT),
  validate(saveScoreSchema),
  performanceController.saveSelf,
);

router.post(
  '/records/:id/submit-self',
  requirePermission(PERMISSIONS.PERFORMANCE_SELF_SUBMIT),
  performanceController.submitSelf,
);

router.post(
  '/records/:id/ai-suggest',
  requirePermission(PERMISSIONS.PERFORMANCE_AI_REQUEST),
  performanceController.requestAiSuggest,
);

router.get(
  '/records/:id/ai-suggestions',
  requirePermission(PERMISSIONS.PERFORMANCE_AI_READ),
  performanceController.listAiSuggestions,
);

router.patch(
  '/records/:id/manager-score',
  requirePermission(PERMISSIONS.PERFORMANCE_MANAGER_SCORE),
  validate(saveScoreSchema),
  performanceController.saveManagerScore,
);

router.post(
  '/records/:id/submit-manager',
  requirePermission(PERMISSIONS.PERFORMANCE_MANAGER_SCORE),
  performanceController.submitManager,
);

router.patch(
  '/records/:id/calibrate',
  requirePermission(PERMISSIONS.PERFORMANCE_DEPT_CALIBRATE),
  validate(saveScoreSchema),
  performanceController.saveCalibrate,
);

router.post(
  '/records/:id/submit-calibrate',
  requirePermission(PERMISSIONS.PERFORMANCE_DEPT_CALIBRATE),
  performanceController.submitCalibrate,
);

router.patch(
  '/records/:id/hr-summary',
  requirePermission(PERMISSIONS.PERFORMANCE_HR_SUMMARY),
  validate(saveScoreSchema),
  performanceController.saveHrSummary,
);

router.post(
  '/records/:id/submit-hr',
  requirePermission(PERMISSIONS.PERFORMANCE_HR_SUMMARY),
  performanceController.submitHr,
);

router.patch(
  '/records/:id/ceo-approve',
  requirePermission(PERMISSIONS.PERFORMANCE_CEO_APPROVE),
  validate(ceoApproveSchema),
  performanceController.ceoApprove,
);

router.post(
  '/records/:id/archive',
  requirePermission(PERMISSIONS.PERFORMANCE_RECORD_WRITE),
  performanceController.archiveRecord,
);

router.post(
  '/records/:id/reject',
  requirePermission(PERMISSIONS.PERFORMANCE_RECORD_WRITE),
  validate(rejectSchema),
  performanceController.rejectRecord,
);

export default router;
