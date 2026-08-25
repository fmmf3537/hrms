// M0.5-4: 集成 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import * as integrationController from '../controllers/integration.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate);

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

router.get('/', integrationController.list);
router.get('/sync-logs', validate(listSyncLogsSchema, 'query'), integrationController.listSyncLogs);
router.get('/:code', integrationController.getByCode);
router.post('/', validate(createSchema), integrationController.create);
router.put('/:id', validate(updateSchema), integrationController.update);
router.delete('/:id', integrationController.remove);
router.post('/send', validate(sendSchema), integrationController.send);
router.post('/:code/sync', integrationController.sync);
router.post('/:code/test', integrationController.testConnection);

export default router;
