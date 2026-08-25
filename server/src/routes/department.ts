// M1-A1: 部门 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as departmentController from '../controllers/department.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const listSchema = z.object({
  companyId: z.string().uuid().optional(),
  parentId: z.string().optional(),
  status: z.enum(['active', 'suspended', 'merged']).optional(),
});

const treeSchema = z.object({
  companyId: z.string().uuid(),
  rootId: z.string().uuid().optional(),
});

const createSchema = z.object({
  companyId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  leaderId: z.string().uuid().optional(),
  headcount: z.number().int().min(0).optional(),
  order: z.number().int().optional(),
  status: z.enum(['active', 'suspended', 'merged']).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  leaderId: z.string().uuid().nullable().optional(),
  headcount: z.number().int().min(0).optional(),
  order: z.number().int().optional(),
  status: z.enum(['active', 'suspended', 'merged']).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

const moveSchema = z.object({
  newParentId: z.string().uuid().nullable().optional(),
  newOrder: z.number().int().optional(),
});

// 静态路径须在 /:id 之前
router.get(
  '/tree',
  requirePermission(PERMISSIONS.DEPARTMENT_READ),
  validate(treeSchema, 'query'),
  departmentController.tree,
);

router.get(
  '/',
  requirePermission(PERMISSIONS.DEPARTMENT_READ),
  validate(listSchema, 'query'),
  departmentController.list,
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.DEPARTMENT_READ),
  departmentController.getById,
);

router.post(
  '/',
  requirePermission(PERMISSIONS.DEPARTMENT_WRITE),
  validate(createSchema),
  departmentController.create,
);

router.put(
  '/:id',
  requirePermission(PERMISSIONS.DEPARTMENT_WRITE),
  validate(updateSchema),
  departmentController.update,
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.DEPARTMENT_WRITE),
  departmentController.remove,
);

router.post(
  '/:id/move',
  requirePermission(PERMISSIONS.DEPARTMENT_WRITE),
  validate(moveSchema),
  departmentController.move,
);

router.get(
  '/:id/headcount',
  requirePermission(PERMISSIONS.DEPARTMENT_READ),
  departmentController.headcount,
);

export default router;
