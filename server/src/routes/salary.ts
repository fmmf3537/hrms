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
import * as insuranceRegService from '../services/employee_insurance.service';
import * as housingFundService from '../services/housing_fund_scheme.service';
import * as gradeService from '../services/salary_grade.service';
import * as levelService from '../services/salary_grade_level.service';
import * as planService from '../services/salary_plan.service';
import * as socialSchemeService from '../services/social_insurance_scheme.service';
import * as taxService from '../services/tax_calculation.service';
import * as laborTaxService from '../services/tax_labor_income.service';
import * as bonusTaxService from '../services/tax_year_end_bonus.service';

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

// ==================== M4-C2 社保公积金 ====================

const cityEnum = z.enum(['xi_an', 'bei_jing', 'si_chuan']);
const insuranceTypeEnum = z.enum([
  'pension', 'medical', 'unemployment', 'work_injury', 'maternity',
]);

const socialCreateSchema = z.object({
  city: cityEnum,
  insuranceType: insuranceTypeEnum,
  companyRate: z.number().min(0).max(1),
  personalRate: z.number().min(0).max(1),
  baseMin: z.number().positive(),
  baseMax: z.number().positive(),
  baseAdjustmentMonth: z.number().int().min(1).max(12)
    .optional(),
});

const socialUpdateSchema = z.object({
  companyRate: z.number().min(0).max(1).optional(),
  personalRate: z.number().min(0).max(1).optional(),
  baseMin: z.number().positive().optional(),
  baseMax: z.number().positive().optional(),
  baseAdjustmentMonth: z.number().int().min(1).max(12)
    .optional(),
});

const socialListSchema = z.object({
  city: cityEnum.optional(),
  insuranceType: insuranceTypeEnum.optional(),
  status: z.enum(['active', 'archived']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const fundCreateSchema = z.object({
  city: cityEnum,
  companyRate: z.number().min(0).max(1),
  personalRate: z.number().min(0).max(1),
  baseMin: z.number().positive(),
  baseMax: z.number().positive(),
});

const fundUpdateSchema = z.object({
  companyRate: z.number().min(0).max(1).optional(),
  personalRate: z.number().min(0).max(1).optional(),
  baseMin: z.number().positive().optional(),
  baseMax: z.number().positive().optional(),
});

const fundListSchema = z.object({
  city: cityEnum.optional(),
  status: z.enum(['active', 'archived']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const regCreateSchema = z.object({
  employeeId: z.string().uuid(),
  city: cityEnum,
  socialInsuranceSchemeId: z.string().uuid().optional(),
  housingFundSchemeId: z.string().uuid().optional(),
  baseSalary: z.number().positive().optional(),
  effectiveFrom: z.string().min(1).optional(),
});

const regUpdateSchema = z.object({
  effectiveTo: z.string().min(1).optional(),
  baseSalary: z.number().positive().optional(),
});

const regListSchema = z.object({
  employeeId: z.string().uuid().optional(),
  city: cityEnum.optional(),
  status: z.enum(['active', 'inactive']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const insuranceRouter: RouterType = Router();
insuranceRouter.post(
  '/',
  requirePermission(PERMISSIONS.SALARY_INSURANCE_WRITE),
  validate(socialCreateSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await socialSchemeService.createScheme(
      actorId,
      req.body as socialSchemeService.CreateSchemeInput,
    );
    res.status(201).json({ success: true, data });
  }),
);
insuranceRouter.get(
  '/',
  requirePermission(PERMISSIONS.SALARY_INSURANCE_READ),
  validate(socialListSchema, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await socialSchemeService.listSchemes(
      actorId,
      req.query as unknown as socialSchemeService.ListSchemeFilter,
    );
    res.json({ success: true, data });
  }),
);
insuranceRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.SALARY_INSURANCE_WRITE),
  validate(socialUpdateSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await socialSchemeService.updateScheme(
      actorId,
      req.params.id,
      req.body as socialSchemeService.UpdateSchemeInput,
    );
    res.json({ success: true, data });
  }),
);

const housingFundRouter: RouterType = Router();
housingFundRouter.post(
  '/',
  requirePermission(PERMISSIONS.SALARY_HOUSING_FUND_WRITE),
  validate(fundCreateSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await housingFundService.createFund(
      actorId,
      req.body as housingFundService.CreateFundInput,
    );
    res.status(201).json({ success: true, data });
  }),
);
housingFundRouter.get(
  '/',
  requirePermission(PERMISSIONS.SALARY_HOUSING_FUND_READ),
  validate(fundListSchema, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await housingFundService.listFunds(
      actorId,
      req.query as unknown as housingFundService.ListFundFilter,
    );
    res.json({ success: true, data });
  }),
);
housingFundRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.SALARY_HOUSING_FUND_WRITE),
  validate(fundUpdateSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await housingFundService.updateFund(
      actorId,
      req.params.id,
      req.body as housingFundService.UpdateFundInput,
    );
    res.json({ success: true, data });
  }),
);

const employeeInsuranceRouter: RouterType = Router();
employeeInsuranceRouter.post(
  '/',
  requirePermission(PERMISSIONS.SALARY_INSURANCE_WRITE),
  validate(regCreateSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await insuranceRegService.createRegistration(
      actorId,
      req.body as insuranceRegService.CreateRegistrationInput,
    );
    res.status(201).json({ success: true, data });
  }),
);
employeeInsuranceRouter.get(
  '/',
  requirePermission(PERMISSIONS.SALARY_INSURANCE_READ),
  validate(regListSchema, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await insuranceRegService.listRegistrations(
      actorId,
      req.query as unknown as insuranceRegService.ListRegistrationFilter,
    );
    res.json({ success: true, data });
  }),
);
employeeInsuranceRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.SALARY_INSURANCE_WRITE),
  validate(regUpdateSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await insuranceRegService.updateRegistration(
      actorId,
      req.params.id,
      req.body as insuranceRegService.UpdateRegistrationInput,
    );
    res.json({ success: true, data });
  }),
);

const taxCalculateSchema = z.object({
  employeeId: z.string().uuid(),
  period: z.string().min(1),
  baseAmount: z.number(),
  cumulativePrepaid: z.number().optional(),
});

const taxBatchSchema = z.object({
  period: z.string().min(1),
  deptIds: z.array(z.string().uuid()).optional(),
});

const taxYearEndSchema = z.object({
  employeeId: z.string().uuid(),
  bonusAmount: z.number(),
  isAnnual: z.literal(true),
});

const taxLaborSchema = z.object({
  employeeId: z.string().uuid(),
  incomeAmount: z.number(),
});

const taxHistorySchema = z.object({
  employeeId: z.string().uuid(),
  year: z.coerce.number().int(),
});

const taxAnnualSchema = z.object({
  employeeId: z.string().uuid(),
  year: z.coerce.number().int(),
  settle: z.coerce.boolean().optional(),
});

const taxRouter: RouterType = Router();
taxRouter.post(
  '/calculate',
  requirePermission(PERMISSIONS.SALARY_TAX_CALCULATE),
  validate(taxCalculateSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await taxService.calculateMonthlyTax(
      actorId,
      req.body as taxService.CalculateMonthlyTaxInput,
    );
    res.json({ success: true, data });
  }),
);
taxRouter.post(
  '/calculate-batch',
  requirePermission(PERMISSIONS.SALARY_TAX_CALCULATE),
  validate(taxBatchSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await taxService.calculateBatchTax(
      actorId,
      req.body as taxService.CalculateBatchTaxInput,
    );
    res.json({ success: true, data });
  }),
);
taxRouter.post(
  '/year-end-bonus',
  requirePermission(PERMISSIONS.SALARY_TAX_CALCULATE),
  validate(taxYearEndSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await bonusTaxService.calculateYearEndBonus(
      actorId,
      req.body as bonusTaxService.CalculateYearEndBonusInput,
    );
    res.json({ success: true, data });
  }),
);
taxRouter.post(
  '/labor-income',
  requirePermission(PERMISSIONS.SALARY_TAX_CALCULATE),
  validate(taxLaborSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await laborTaxService.calculateLaborIncomeTax(
      actorId,
      req.body as laborTaxService.CalculateLaborIncomeTaxInput,
    );
    res.json({ success: true, data });
  }),
);
taxRouter.get(
  '/history',
  requirePermission(PERMISSIONS.SALARY_TAX_READ),
  validate(taxHistorySchema, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const { employeeId, year } = req.query as unknown as {
      employeeId: string;
      year: number;
    };
    const data = await taxService.getTaxHistory(actorId, employeeId, Number(year));
    res.json({ success: true, data });
  }),
);
taxRouter.get(
  '/annual-summary',
  requirePermission(PERMISSIONS.SALARY_TAX_READ),
  validate(taxAnnualSchema, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const { employeeId, year, settle } = req.query as unknown as {
      employeeId: string;
      year: number;
      settle?: boolean;
    };
    const data = await taxService.getTaxAnnualSummary(
      actorId,
      employeeId,
      Number(year),
      { settle: settle === true },
    );
    res.json({ success: true, data });
  }),
);

router.use('/insurances/social', insuranceRouter);
router.use('/insurances/housing-fund', housingFundRouter);
router.use('/insurances/employees', employeeInsuranceRouter);
router.use('/tax', taxRouter);

export default router;
