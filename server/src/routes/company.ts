// M1-A1: 法人公司 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as companyController from '../controllers/company.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const listSchema = z.object({
  status: z.enum(['active', 'suspended']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const createSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  shortName: z.string().max(50).optional(),
  city: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  contact: z.string().max(100).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  legalRep: z.string().max(50).optional(),
  taxNo: z.string().max(50).optional(),
});

const updateSchema = createSchema.omit({ code: true }).partial();

router.get(
  '/',
  requirePermission(PERMISSIONS.COMPANY_READ),
  validate(listSchema, 'query'),
  companyController.list,
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.COMPANY_READ),
  companyController.getById,
);

router.post(
  '/',
  requirePermission(PERMISSIONS.COMPANY_WRITE),
  validate(createSchema),
  companyController.create,
);

router.put(
  '/:id',
  requirePermission(PERMISSIONS.COMPANY_WRITE),
  validate(updateSchema),
  companyController.update,
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.COMPANY_WRITE),
  companyController.remove,
);

router.get(
  '/:id/statistics',
  requirePermission(PERMISSIONS.COMPANY_READ),
  companyController.statistics,
);

router.get(
  '/:id/headcount-warning',
  requirePermission(PERMISSIONS.COMPANY_READ),
  companyController.headcountWarning,
);

export default router;
