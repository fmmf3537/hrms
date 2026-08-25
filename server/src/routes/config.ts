// M0.5-6: 配置中心 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as configController from '../controllers/config.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const listSchema = z.object({
  category: z.string().min(1).max(50).optional(),
});

const setSchema = z.object({
  category: z.string().min(1).max(50),
  key: z.string().min(1).max(100),
  value: z.unknown(),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().nullable().optional(),
  remark: z.string().max(1000).optional(),
});

router.get(
  '/',
  requirePermission(PERMISSIONS.CONFIG_READ),
  validate(listSchema, 'query'),
  configController.list,
);

router.get(
  '/:category/:key/history',
  requirePermission(PERMISSIONS.CONFIG_READ),
  configController.getHistory,
);

router.get(
  '/:category/:key',
  requirePermission(PERMISSIONS.CONFIG_READ),
  configController.getValue,
);

router.post(
  '/',
  requirePermission(PERMISSIONS.CONFIG_WRITE),
  validate(setSchema),
  configController.setValue,
);

export default router;
