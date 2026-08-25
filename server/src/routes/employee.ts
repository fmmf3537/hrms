// M1-A2: 员工档案 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as employeeController from '../controllers/employee.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const listSchema = z.object({
  companyId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  status: z.enum(['probation', 'active', 'resigned']).optional(),
  keyword: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const statsSchema = z.object({
  companyId: z.string().uuid().optional(),
});

const createSchema = z.object({
  companyId: z.string().uuid(),
  departmentId: z.string().uuid(),
  name: z.string().min(1).max(50),
  hireDate: z.string().min(1),
  userId: z.string().uuid().optional(),
  gender: z.enum(['male', 'female']).optional(),
  birthDate: z.string().optional(),
  idCard: z.string().optional(),
  nativePlace: z.string().max(200).optional(),
  ethnicity: z.string().max(20).optional(),
  politicalStatus: z.string().max(50).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  emergencyContactName: z.string().max(50).optional(),
  emergencyContactPhone: z.string().optional(),
  address: z.string().optional(),
  educationLevel: z.string().max(50).optional(),
  degree: z.string().max(50).optional(),
  school: z.string().max(200).optional(),
  major: z.string().max(100).optional(),
  graduationDate: z.string().optional(),
  workHistory: z.unknown().optional(),
  contractType: z.enum(['formal', 'intern', 'consultant', 'labor']).optional(),
  contractStart: z.string().optional(),
  contractEnd: z.string().optional(),
  certificates: z.unknown().optional(),
  bankName: z.string().max(100).optional(),
  bankCard: z.string().optional(),
  socialInsured: z.boolean().optional(),
  socialCity: z.string().max(50).optional(),
  socialBase: z.number().optional(),
  housingFundCity: z.string().max(50).optional(),
  housingFundRate: z.number().optional(),
  housingFundBase: z.number().optional(),
  status: z.enum(['probation', 'active', 'resigned']).optional(),
  remark: z.string().optional(),
  position: z.string().max(100).optional(),
  baseSalary: z.number().optional(),
  performanceSalary: z.number().optional(),
});

const updateSchema = createSchema.omit({
  companyId: true,
  hireDate: true,
  userId: true,
  position: true,
  baseSalary: true,
  performanceSalary: true,
}).partial().extend({
  resignationDate: z.string().nullable().optional(),
});

const ocrSchema = z.object({
  imageBase64: z.string().min(1),
});

const contractExpiringSchema = z.object({
  companyId: z.string().uuid().optional(),
  days: z.coerce.number().int().min(1).max(365)
    .default(30),
});

// 静态路径先于 /:id
router.get(
  '/statistics',
  requirePermission(PERMISSIONS.EMPLOYEE_READ),
  validate(statsSchema, 'query'),
  employeeController.statistics,
);

router.get(
  '/',
  requirePermission(PERMISSIONS.EMPLOYEE_READ),
  validate(listSchema, 'query'),
  employeeController.list,
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.EMPLOYEE_READ),
  employeeController.getById,
);

router.post(
  '/',
  requirePermission(PERMISSIONS.EMPLOYEE_WRITE),
  validate(createSchema),
  employeeController.create,
);

router.put(
  '/:id',
  requirePermission(PERMISSIONS.EMPLOYEE_WRITE),
  validate(updateSchema),
  employeeController.update,
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.EMPLOYEE_WRITE),
  employeeController.remove,
);

router.post(
  '/:id/parse-id-card',
  requirePermission(PERMISSIONS.EMPLOYEE_AI_OCR),
  validate(ocrSchema),
  employeeController.parseIdCard,
);

router.post(
  '/:id/parse-bank-card',
  requirePermission(PERMISSIONS.EMPLOYEE_AI_OCR),
  validate(ocrSchema),
  employeeController.parseBankCard,
);

router.post(
  '/:id/parse-certificate',
  requirePermission(PERMISSIONS.EMPLOYEE_AI_OCR),
  validate(ocrSchema),
  employeeController.parseCertificate,
);

router.get(
  '/:id/contract-expiring',
  requirePermission(PERMISSIONS.EMPLOYEE_READ),
  validate(contractExpiringSchema, 'query'),
  employeeController.contractExpiring,
);

export default router;
