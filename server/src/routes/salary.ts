// M4-C1: 薪酬核算 routes（薪级薪档 + 员工薪酬方案）| HRMS
// 首次非 performance 路由；C2-C8 可在此文件内按子资源继续分组

import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import * as gradeService from '../services/salary_grade.service';
import * as levelService from '../services/salary_grade_level.service';
import * as planService from '../services/salary_plan.service';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

function requireUserId(
  req: import('express').Request,
  res: import('express').Response,
): string | null {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ success: false, message: '未认证' });
    return null;
  }
  return userId;
}

const sequenceEnum = z.enum(['M', 'T', 'P', 'S', 'A']);

const gradeCreateSchema = z.object({
  sequence: sequenceEnum,
  gradeCode: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  minBaseSalary: z.number().min(0),
  maxBaseSalary: z.number().min(0),
  minPerformanceBase: z.number().min(0),
  maxPerformanceBase: z.number().min(0),
});

const gradeListSchema = z.object({
  sequence: sequenceEnum.optional(),
  status: z.enum(['active', 'archived']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const levelCreateSchema = z.object({
  gradeId: z.string().uuid(),
  level: z.number().int().min(1).max(7),
  baseSalary: z.number().min(0),
  performanceBase: z.number().min(0),
});

const levelListSchema = z.object({
  gradeId: z.string().uuid().optional(),
  status: z.enum(['active', 'archived']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const planCreateSchema = z.object({
  employeeId: z.string().uuid(),
  gradeId: z.string().uuid(),
  levelId: z.string().uuid(),
  baseSalary: z.number().min(0),
  performanceBase: z.number().min(0),
  allowance: z.number().min(0).optional(),
  welfare: z.string().max(2000).optional(),
  effectiveFrom: z.string().min(1).optional(),
});

const planListSchema = z.object({
  employeeId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'superseded']).optional(),
  effectiveFrom: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const planDeactivateSchema = z.object({
  effectiveTo: z.string().min(1),
  reason: z.string().max(500).optional(),
});

const gradeRouter: RouterType = Router();
gradeRouter.post(
  '/',
  requirePermission(PERMISSIONS.SALARY_GRADE_WRITE),
  validate(gradeCreateSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await gradeService.createGrade(
      actorId,
      req.body as gradeService.CreateGradeInput,
    );
    res.status(201).json({ success: true, data });
  }),
);
gradeRouter.get(
  '/',
  requirePermission(PERMISSIONS.SALARY_GRADE_READ),
  validate(gradeListSchema, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await gradeService.listGrades(
      actorId,
      req.query as unknown as gradeService.ListGradeFilter,
    );
    res.json({ success: true, data });
  }),
);

const gradeLevelRouter: RouterType = Router();
gradeLevelRouter.post(
  '/',
  requirePermission(PERMISSIONS.SALARY_GRADE_WRITE),
  validate(levelCreateSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await levelService.createLevel(
      actorId,
      req.body as levelService.CreateLevelInput,
    );
    res.status(201).json({ success: true, data });
  }),
);
gradeLevelRouter.get(
  '/',
  requirePermission(PERMISSIONS.SALARY_GRADE_READ),
  validate(levelListSchema, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await levelService.listLevels(
      actorId,
      req.query as unknown as levelService.ListLevelFilter,
    );
    res.json({ success: true, data });
  }),
);

const planRouter: RouterType = Router();
planRouter.post(
  '/',
  requirePermission(PERMISSIONS.SALARY_PLAN_WRITE),
  validate(planCreateSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await planService.createPlan(
      actorId,
      req.body as planService.CreatePlanInput,
    );
    res.status(201).json({ success: true, data });
  }),
);
planRouter.get(
  '/',
  requirePermission(PERMISSIONS.SALARY_PLAN_READ),
  validate(planListSchema, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await planService.listPlans(
      actorId,
      req.query as unknown as planService.ListPlanFilter,
    );
    res.json({ success: true, data });
  }),
);
planRouter.patch(
  '/:id/deactivate',
  requirePermission(PERMISSIONS.SALARY_PLAN_WRITE),
  validate(planDeactivateSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await planService.deactivatePlan(
      actorId,
      req.params.id,
      req.body as { effectiveTo: string; reason?: string },
    );
    res.json({ success: true, data });
  }),
);

router.use('/grades', gradeRouter);
router.use('/grade-levels', gradeLevelRouter);
router.use('/plans', planRouter);

export default router;
