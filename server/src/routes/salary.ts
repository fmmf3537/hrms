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
import * as bankingExportService from '../services/banking_export.service';
import * as commissionReportService from '../services/commission_report.service';
import * as commissionSettlementService from '../services/commission_settlement.service';
import * as commissionSummaryService from '../services/commission_summary.service';
import * as costAlertService from '../services/cost_alert.service';
import * as insuranceRegService from '../services/employee_insurance.service';
import * as housingFundService from '../services/housing_fund_scheme.service';
import * as payrollAiService from '../services/payroll_ai_summary.service';
import * as payrollRunService from '../services/payroll_run.service';
import * as payslipService from '../services/payslip.service';
import * as payslipDeliveryService from '../services/payslip_delivery.service';
import * as payslipGeneratorService from '../services/payslip_generator.service';
import * as reportExportService from '../services/report_export.service';
import * as gradeService from '../services/salary_grade.service';
import * as levelService from '../services/salary_grade_level.service';
import * as planService from '../services/salary_plan.service';
import * as socialSchemeService from '../services/social_insurance_scheme.service';
import * as taxService from '../services/tax_calculation.service';
import * as taxDeclarationService from '../services/tax_declaration.service';
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

const payrollRunCreateSchema = z.object({
  period: z.string().min(1),
  deptIds: z.array(z.string().uuid()).optional(),
  remark: z.string().max(2000).optional(),
});

const payrollRunListSchema = z.object({
  period: z.string().optional(),
  status: z.enum(['draft', 'submitted', 'reviewed', 'approved', 'locked', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const payrollRejectSchema = z.object({
  reason: z.string().min(1).max(2000),
});

const payrollReviewSchema = z.object({
  comment: z.string().max(2000).optional(),
});

const payslipListSchema = z.object({
  runId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  period: z.string().optional(),
  status: z.enum(['calculated', 'approved', 'locked']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const bankingExportSchema = z.object({
  format: z.enum(['icbc', 'ccb', 'cmb']),
});

const taxDeclareSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

const reportExportSchema = z.object({
  format: z.enum(['excel', 'pdf']),
});

const payslipDeliverSchema = z.object({
  methods: z.array(z.enum(['email', 'system'])).optional(),
});

const payrollsRouter: RouterType = Router();
payrollsRouter.post(
  '/runs',
  requirePermission(PERMISSIONS.SALARY_PAYROLL_RUN_WRITE),
  validate(payrollRunCreateSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await payrollRunService.createPayrollRun(
      actorId,
      req.body as payrollRunService.CreatePayrollRunInput,
    );
    res.status(201).json({ success: true, data });
  }),
);
payrollsRouter.get(
  '/runs',
  requirePermission(PERMISSIONS.SALARY_PAYROLL_RUN_READ),
  validate(payrollRunListSchema, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await payrollRunService.listPayrollRuns(
      actorId,
      req.query as unknown as payrollRunService.ListPayrollRunFilter,
    );
    res.json({ success: true, data });
  }),
);
payrollsRouter.get(
  '/runs/:id',
  requirePermission(PERMISSIONS.SALARY_PAYROLL_RUN_READ),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await payrollRunService.getPayrollRun(actorId, req.params.id);
    res.json({ success: true, data });
  }),
);
payrollsRouter.post(
  '/runs/:id/submit',
  requirePermission(PERMISSIONS.SALARY_PAYROLL_RUN_WRITE),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await payrollRunService.submitPayrollRun(actorId, req.params.id);
    res.json({ success: true, data });
  }),
);
payrollsRouter.post(
  '/runs/:id/review',
  requirePermission(PERMISSIONS.SALARY_PAYROLL_RUN_APPROVE),
  validate(payrollReviewSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await payrollRunService.reviewPayrollRun(
      actorId,
      req.params.id,
      req.body as { comment?: string },
    );
    res.json({ success: true, data });
  }),
);
payrollsRouter.post(
  '/runs/:id/reject',
  requirePermission(PERMISSIONS.SALARY_PAYROLL_RUN_APPROVE),
  validate(payrollRejectSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await payrollRunService.rejectPayrollRun(
      actorId,
      req.params.id,
      (req.body as { reason: string }).reason,
    );
    res.json({ success: true, data });
  }),
);
payrollsRouter.post(
  '/runs/:id/approve',
  requirePermission(PERMISSIONS.SALARY_PAYROLL_RUN_APPROVE),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await payrollRunService.approvePayrollRun(actorId, req.params.id);
    res.json({ success: true, data });
  }),
);
payrollsRouter.post(
  '/runs/:id/ai-summary',
  requirePermission(PERMISSIONS.SALARY_PAYROLL_RUN_WRITE),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await payrollAiService.requestAiSummary(actorId, req.params.id);
    res.json({ success: true, data });
  }),
);
payrollsRouter.post(
  '/runs/:id/lock',
  requirePermission(PERMISSIONS.SALARY_PAYROLL_RUN_APPROVE),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await payrollRunService.lockPayrollRun(actorId, req.params.id);
    res.json({ success: true, data });
  }),
);
payrollsRouter.get(
  '/payslips',
  requirePermission(PERMISSIONS.SALARY_PAYSLIP_READ),
  validate(payslipListSchema, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await payslipService.listPayslips(
      actorId,
      req.query as unknown as payslipService.ListPayslipFilter,
    );
    res.json({ success: true, data });
  }),
);
payrollsRouter.get(
  '/payslips/:id',
  requirePermission(PERMISSIONS.SALARY_PAYSLIP_READ),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await payslipService.getPayslip(actorId, req.params.id);
    res.json({ success: true, data });
  }),
);
payrollsRouter.post(
  '/payslips/:id/recalculate',
  requirePermission(PERMISSIONS.SALARY_PAYSLIP_WRITE),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await payslipService.recalculatePayslip(actorId, req.params.id);
    res.json({ success: true, data });
  }),
);
payrollsRouter.post(
  '/runs/:id/banking-export',
  requirePermission(PERMISSIONS.SALARY_BANKING_EXPORT),
  validate(bankingExportSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await bankingExportService.exportBankingFile(
      actorId,
      req.params.id,
      req.body as { format: 'icbc' | 'ccb' | 'cmb' },
    );
    res.json({ success: true, data });
  }),
);
payrollsRouter.post(
  '/runs/:id/tax-declare',
  requirePermission(PERMISSIONS.SALARY_TAX_DECLARE),
  validate(taxDeclareSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await taxDeclarationService.declareTax(
      actorId,
      req.params.id,
      req.body as { period: string },
    );
    res.json({ success: true, data });
  }),
);
payrollsRouter.post(
  '/runs/:id/report-export',
  requirePermission(PERMISSIONS.SALARY_REPORT_EXPORT),
  validate(reportExportSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await reportExportService.exportReport(
      actorId,
      req.params.id,
      req.body as { format: 'excel' | 'pdf' },
    );
    res.json({ success: true, data });
  }),
);

const c5PayslipRouter: RouterType = Router();
c5PayslipRouter.post(
  '/:id/payslip/generate',
  requirePermission(PERMISSIONS.SALARY_PAYSLIP_GENERATE),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await payslipGeneratorService.generatePayslip(actorId, req.params.id);
    res.json({
      success: true,
      data: {
        ...data,
        pdf: data.pdf.toString('base64'),
      },
    });
  }),
);
c5PayslipRouter.get(
  '/:id/payslip/html',
  requirePermission(PERMISSIONS.SALARY_PAYSLIP_GENERATE),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const html = await payslipGeneratorService.getPayslipHtml(actorId, req.params.id);
    res.json({ success: true, data: { html } });
  }),
);
c5PayslipRouter.get(
  '/:id/payslip/pdf',
  requirePermission(PERMISSIONS.SALARY_PAYSLIP_GENERATE),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await payslipGeneratorService.getPayslipPdf(actorId, req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${data.fileName}"`);
    res.send(data.pdf);
  }),
);
c5PayslipRouter.post(
  '/:id/deliver',
  requirePermission(PERMISSIONS.SALARY_PAYSLIP_GENERATE),
  validate(payslipDeliverSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await payslipDeliveryService.deliverPayslip(
      actorId,
      req.params.id,
      req.body as { methods?: string[] },
    );
    res.json({ success: true, data });
  }),
);

const commissionSummaryQuery = z.object({
  groupBy: z.enum(['employee', 'department', 'product', 'report']).optional(),
  period: z.string().optional(),
  quarter: z.string().optional(),
});

const commissionPeriodQuery = z.object({
  period: z.string().optional(),
  quarter: z.string().optional(),
});

const settlementCreateSchema = z.object({
  year: z.number().int(),
  quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  initialStatus: z.enum(['draft', 'pending_confirm']).optional(),
});

const settlementListSchema = z.object({
  year: z.coerce.number().int().optional(),
  status: z.enum(['draft', 'pending_confirm', 'confirmed', 'cancelled']).optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const settlementConfirmSchema = z.object({
  remark: z.string().max(2000).optional(),
});

const settlementCancelSchema = z.object({
  reason: z.string().min(1).max(2000),
});

const commissionRouter: RouterType = Router();
commissionRouter.get(
  '/summary',
  requirePermission(PERMISSIONS.SALARY_COMMISSION_READ),
  validate(commissionSummaryQuery, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const q = req.query as { groupBy?: string; period?: string; quarter?: string };
    const data = q.groupBy === 'report'
      ? await commissionReportService.getReport(actorId, {
        groupBy: 'overall',
        period: q.period,
        quarter: q.quarter,
      })
      : await commissionSummaryService.getSummary(actorId, q);
    res.json({ success: true, data });
  }),
);
commissionRouter.get(
  '/employees/:employeeId',
  requirePermission(PERMISSIONS.SALARY_COMMISSION_READ),
  validate(commissionPeriodQuery, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await commissionSummaryService.getEmployeeSummary(
      actorId,
      req.params.employeeId,
      req.query as { period?: string; quarter?: string },
    );
    res.json({ success: true, data });
  }),
);
commissionRouter.get(
  '/departments/:departmentId',
  requirePermission(PERMISSIONS.SALARY_COMMISSION_READ),
  validate(commissionPeriodQuery, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await commissionSummaryService.getDepartmentSummary(
      actorId,
      req.params.departmentId,
      req.query as { period?: string; quarter?: string },
    );
    res.json({ success: true, data });
  }),
);
commissionRouter.post(
  '/settlements',
  requirePermission(PERMISSIONS.SALARY_COMMISSION_SETTLE),
  validate(settlementCreateSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await commissionSettlementService.createSettlement(
      actorId,
      req.body as commissionSettlementService.CreateSettlementInput,
    );
    res.json({ success: true, data });
  }),
);
commissionRouter.get(
  '/settlements',
  requirePermission(PERMISSIONS.SALARY_COMMISSION_READ),
  validate(settlementListSchema, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await commissionSettlementService.listSettlements(
      actorId,
      req.query as unknown as commissionSettlementService.ListSettlementFilter,
    );
    res.json({ success: true, data });
  }),
);
commissionRouter.get(
  '/settlements/:id',
  requirePermission(PERMISSIONS.SALARY_COMMISSION_READ),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await commissionSettlementService.getSettlement(actorId, req.params.id);
    res.json({ success: true, data });
  }),
);
commissionRouter.post(
  '/settlements/:id/confirm',
  requirePermission(PERMISSIONS.SALARY_COMMISSION_CONFIRM),
  validate(settlementConfirmSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await commissionSettlementService.confirmSettlement(
      actorId,
      req.params.id,
      req.body as { remark?: string },
    );
    res.json({ success: true, data });
  }),
);
commissionRouter.post(
  '/settlements/:id/cancel',
  requirePermission(PERMISSIONS.SALARY_COMMISSION_CANCEL),
  validate(settlementCancelSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await commissionSettlementService.cancelSettlement(
      actorId,
      req.params.id,
      req.body as { reason: string },
    );
    res.json({ success: true, data });
  }),
);

const costAlertScanSchema = z.object({
  period: z.string().min(7).max(7),
  alertType: z.enum(['overtime_ratio', 'attrition_monthly', 'all']).optional(),
});

const costAlertListSchema = z.object({
  alertType: z.enum(['overtime_ratio', 'attrition_monthly']).optional(),
  period: z.string().optional(),
  status: z.enum(['active', 'acknowledged', 'closed']).optional(),
  severity: z.enum(['warning', 'critical']).optional(),
  departmentId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const costAlertSummarySchema = z.object({
  period: z.string().min(7).max(7),
});

const costAlertAckSchema = z.object({
  note: z.string().max(2000).optional(),
});

const costAlertCloseSchema = z.object({
  reason: z.string().min(1).max(2000),
  remark: z.string().max(2000).optional(),
});

const costAlertRouter: RouterType = Router();
costAlertRouter.post(
  '/scan',
  requirePermission(PERMISSIONS.SALARY_COST_ALERT_SCAN),
  validate(costAlertScanSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await costAlertService.scanCostAlerts(
      actorId,
      req.body as costAlertService.ScanCostAlertsInput,
    );
    res.json({ success: true, data });
  }),
);
costAlertRouter.get(
  '/summary',
  requirePermission(PERMISSIONS.SALARY_COST_ALERT_READ),
  validate(costAlertSummarySchema, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await costAlertService.getAlertSummary(actorId, String(req.query.period));
    res.json({ success: true, data });
  }),
);
costAlertRouter.get(
  '/',
  requirePermission(PERMISSIONS.SALARY_COST_ALERT_READ),
  validate(costAlertListSchema, 'query'),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await costAlertService.listAlerts(
      actorId,
      req.query as unknown as costAlertService.ListAlertFilter,
    );
    res.json({ success: true, data });
  }),
);
costAlertRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.SALARY_COST_ALERT_READ),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await costAlertService.getAlert(actorId, req.params.id);
    res.json({ success: true, data });
  }),
);
costAlertRouter.post(
  '/:id/acknowledge',
  requirePermission(PERMISSIONS.SALARY_COST_ALERT_ACK),
  validate(costAlertAckSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await costAlertService.acknowledgeAlert(
      actorId,
      req.params.id,
      req.body as { note?: string },
    );
    res.json({ success: true, data });
  }),
);
costAlertRouter.post(
  '/:id/close',
  requirePermission(PERMISSIONS.SALARY_COST_ALERT_CLOSE),
  validate(costAlertCloseSchema),
  asyncHandler(async (req, res) => {
    const actorId = requireUserId(req, res);
    if (!actorId) return;
    const data = await costAlertService.closeAlert(
      actorId,
      req.params.id,
      req.body as { reason: string; remark?: string },
    );
    res.json({ success: true, data });
  }),
);

router.use('/insurances/social', insuranceRouter);
router.use('/insurances/housing-fund', housingFundRouter);
router.use('/insurances/employees', employeeInsuranceRouter);
router.use('/tax', taxRouter);
router.use('/payrolls', payrollsRouter);
router.use('/payslips', c5PayslipRouter);
router.use('/commissions', commissionRouter);
router.use('/cost-alerts', costAlertRouter);

export default router;
