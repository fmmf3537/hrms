// M3-D1: 绩效管理 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as performanceController from '../controllers/performance.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import * as calibrationRatioService from '../services/performance_calibration_ratio.service';
import * as gradeService from '../services/performance_grade.service';
import type { GradeThresholds } from '../services/performance_grade.service';
import * as payoutService from '../services/performance_payout.service';
import * as payoutConfigService from '../services/performance_payout_config.service';

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

function requireGradeUserId(req: import('express').Request, res: import('express').Response): string | null {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ success: false, message: '未认证' });
    return null;
  }
  return userId;
}

const gradeCalculateSchema = z.object({
  recordId: z.string().uuid(),
  force: z.boolean().optional(),
});

const gradeBatchSchema = z.object({
  recordIds: z.array(z.string().uuid()).min(1),
  force: z.boolean().optional(),
  batchSize: z.number().int().positive().max(100)
    .optional(),
});

const gradeThresholdsSchema = z.object({
  S: z.number().min(0).max(100),
  A: z.number().min(0).max(100),
  B: z.number().min(0).max(100),
  C: z.number().min(0).max(100),
  D: z.number().min(0).max(100),
});

const calibrateRatiosSchema = z.object({
  deptIds: z.array(z.string().uuid()).min(1),
  cycleId: z.string().uuid().optional(),
});

router.post(
  '/grade/calculate',
  requirePermission(PERMISSIONS.PERFORMANCE_GRADE_CALCULATE),
  validate(gradeCalculateSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireGradeUserId(req, res);
    if (!actorId) return;
    const { recordId, force } = req.body as { recordId: string; force?: boolean };
    const data = await gradeService.calculateGrade(actorId, recordId, { force });
    res.json({ success: true, data });
  }),
);

router.post(
  '/grade/calculate-batch',
  requirePermission(PERMISSIONS.PERFORMANCE_GRADE_CALCULATE),
  validate(gradeBatchSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireGradeUserId(req, res);
    if (!actorId) return;
    const { recordIds, force, batchSize } = req.body as {
      recordIds: string[];
      force?: boolean;
      batchSize?: number;
    };
    const data = await gradeService.calculateBatchGrade(actorId, recordIds, { force, batchSize });
    res.json({ success: true, data });
  }),
);

router.get(
  '/grade/thresholds',
  requirePermission(PERMISSIONS.PERFORMANCE_GRADE_THRESHOLD_READ),
  asyncHandler(async (req, res) => {
    const actorId = req.user?.userId ?? 'anonymous';
    const data = await gradeService.getGradeThresholds(actorId);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/grade/thresholds',
  requirePermission(PERMISSIONS.PERFORMANCE_GRADE_THRESHOLD_WRITE),
  validate(gradeThresholdsSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireGradeUserId(req, res);
    if (!actorId) return;
    const data = await gradeService.updateGradeThresholds(actorId, req.body as GradeThresholds);
    res.json({ success: true, data });
  }),
);

router.post(
  '/grade/calibrate-ratios',
  requirePermission(PERMISSIONS.PERFORMANCE_RECORD_READ),
  validate(calibrateRatiosSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireGradeUserId(req, res);
    if (!actorId) return;
    const { deptIds, cycleId } = req.body as { deptIds: string[]; cycleId?: string };
    const data = await calibrationRatioService.calibrateDepartmentRatios(actorId, deptIds, cycleId);
    res.json({ success: true, data });
  }),
);

// ==================== M3-D4 绩效兑现 ====================

function requirePayoutUserId(req: import('express').Request, res: import('express').Response): string | null {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ success: false, message: '未认证' });
    return null;
  }
  return userId;
}

const payoutConfigSwitchSchema = z.object({
  mode: z.enum(['direct', 'pool']),
  effectiveFrom: z.string().optional(),
  remark: z.string().max(500).optional(),
});

const payoutCalculateSchema = z.object({
  mode: z.enum(['direct', 'pool']).optional(),
  employeeId: z.string().uuid().optional(),
  cycleId: z.string().uuid(),
  month: z.string().min(1),
  deptIds: z.array(z.string().uuid()).optional(),
});

const payoutCalculatePoolSchema = z.object({
  deptId: z.string().uuid(),
  cycleId: z.string().uuid(),
  month: z.string().min(1),
});

const payoutPrepaySchema = z.object({
  cycleId: z.string().uuid(),
  month: z.string().min(1),
  employeeId: z.string().uuid().optional(),
});

const payoutSettleSchema = z.object({
  cycleId: z.string().uuid(),
  quarter: z.coerce.number().int().min(1).max(4),
  employeeId: z.string().uuid().optional(),
});

const payoutListSchema = z.object({
  cycleId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  mode: z.enum(['direct', 'pool']).optional(),
  status: z.enum(['draft', 'calculated', 'prepaid', 'settled', 'cancelled']).optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

router.get(
  '/payouts/config',
  requirePermission(PERMISSIONS.PERFORMANCE_PAYOUT_READ),
  asyncHandler(async (req, res) => {
    const actorId = requirePayoutUserId(req, res);
    if (!actorId) return;
    const data = await payoutConfigService.getCurrentConfig(actorId);
    res.json({ success: true, data });
  }),
);

router.patch(
  '/payouts/config',
  requirePermission(PERMISSIONS.PERFORMANCE_PAYOUT_WRITE),
  validate(payoutConfigSwitchSchema),
  asyncHandler(async (req, res) => {
    const actorId = requirePayoutUserId(req, res);
    if (!actorId) return;
    const body = req.body as { mode: 'direct' | 'pool'; effectiveFrom?: string; remark?: string };
    const data = await payoutConfigService.switchConfig(actorId, {
      mode: body.mode,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined,
      remark: body.remark,
    });
    res.json({ success: true, data });
  }),
);

router.post(
  '/payouts/calculate',
  requirePermission(PERMISSIONS.PERFORMANCE_PAYOUT_CALCULATE),
  validate(payoutCalculateSchema),
  asyncHandler(async (req, res) => {
    const actorId = requirePayoutUserId(req, res);
    if (!actorId) return;
    const body = req.body as {
      mode?: 'direct' | 'pool';
      employeeId?: string;
      cycleId: string;
      month: string;
      deptIds?: string[];
    };
    const mode = body.mode ?? 'direct';
    if (mode === 'pool') {
      const data = await payoutService.calculatePool(actorId, {
        cycleId: body.cycleId,
        month: body.month,
        deptIds: body.deptIds,
      });
      res.json({ success: true, data });
      return;
    }
    if (!body.employeeId) {
      res.status(400).json({ success: false, message: '直乘模式需提供 employeeId' });
      return;
    }
    const data = await payoutService.calculateDirect(actorId, {
      employeeId: body.employeeId,
      cycleId: body.cycleId,
      month: body.month,
    });
    res.json({ success: true, data });
  }),
);

router.post(
  '/payouts/calculate-pool',
  requirePermission(PERMISSIONS.PERFORMANCE_PAYOUT_CALCULATE),
  validate(payoutCalculatePoolSchema),
  asyncHandler(async (req, res) => {
    const actorId = requirePayoutUserId(req, res);
    if (!actorId) return;
    const { deptId, cycleId, month } = req.body as { deptId: string; cycleId: string; month: string };
    const data = await payoutService.calculatePoolByDept(actorId, deptId, cycleId, month);
    res.json({ success: true, data });
  }),
);

router.post(
  '/payouts/prepay',
  requirePermission(PERMISSIONS.PERFORMANCE_PAYOUT_SETTLE),
  validate(payoutPrepaySchema),
  asyncHandler(async (req, res) => {
    const actorId = requirePayoutUserId(req, res);
    if (!actorId) return;
    const body = req.body as { cycleId: string; month: string; employeeId?: string };
    const data = await payoutService.prepay(actorId, body);
    res.json({ success: true, data });
  }),
);

router.post(
  '/payouts/settle',
  requirePermission(PERMISSIONS.PERFORMANCE_PAYOUT_SETTLE),
  validate(payoutSettleSchema),
  asyncHandler(async (req, res) => {
    const actorId = requirePayoutUserId(req, res);
    if (!actorId) return;
    const body = req.body as { cycleId: string; quarter: number; employeeId?: string };
    const data = await payoutService.settle(actorId, body);
    res.json({ success: true, data });
  }),
);

router.get(
  '/payouts',
  requirePermission(PERMISSIONS.PERFORMANCE_PAYOUT_READ),
  validate(payoutListSchema, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requirePayoutUserId(req, res);
    if (!actorId) return;
    const data = await payoutService.listPayouts(actorId, req.query as payoutService.ListPayoutFilter);
    res.json({ success: true, data });
  }),
);

router.get(
  '/payouts/:id',
  requirePermission(PERMISSIONS.PERFORMANCE_PAYOUT_READ),
  asyncHandler(async (req, res) => {
    const actorId = requirePayoutUserId(req, res);
    if (!actorId) return;
    const data = await payoutService.getPayout(actorId, req.params.id);
    res.json({ success: true, data });
  }),
);

export default router;
