// M0.5-4: 集成 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as integrationController from '../controllers/integration.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const listSyncLogsSchema = z.object({
  integrationId: z.string().uuid().optional(),
  status: z.enum(['success', 'failed', 'partial']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

const createSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  type: z.enum(['http_api', 'webhook', 'database', 'file']),
  config: z.record(z.unknown()),
  description: z.string().max(1000).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(['http_api', 'webhook', 'database', 'file']).optional(),
  config: z.record(z.unknown()).optional(),
  description: z.string().max(1000).optional(),
});

const sendSchema = z.object({
  code: z.string().min(1).max(50),
  payload: z.unknown(),
});

router.get('/', requirePermission(PERMISSIONS.INTEGRATION_READ), integrationController.list);
router.get(
  '/sync-logs',
  requirePermission(PERMISSIONS.INTEGRATION_READ),
  validate(listSyncLogsSchema, 'query'),
  integrationController.listSyncLogs,
);
router.get('/:code', requirePermission(PERMISSIONS.INTEGRATION_READ), integrationController.getByCode);
router.post(
  '/',
  requirePermission(PERMISSIONS.INTEGRATION_WRITE),
  validate(createSchema),
  integrationController.create,
);
router.put(
  '/:id',
  requirePermission(PERMISSIONS.INTEGRATION_WRITE),
  validate(updateSchema),
  integrationController.update,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.INTEGRATION_WRITE),
  integrationController.remove,
);
router.post(
  '/send',
  requirePermission(PERMISSIONS.INTEGRATION_SEND),
  validate(sendSchema),
  integrationController.send,
);
router.post(
  '/:code/sync',
  requirePermission(PERMISSIONS.INTEGRATION_SEND),
  integrationController.sync,
);
router.post(
  '/:code/test',
  requirePermission(PERMISSIONS.INTEGRATION_READ),
  integrationController.testConnection,
);

export default router;
