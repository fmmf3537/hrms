// M0.5-2: 通知 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import * as notificationController from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate);

// ===== 用户侧 =====

const listMySchema = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  channel: z.enum(['in_app', 'email', 'sms']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

router.get('/', validate(listMySchema, 'query'), notificationController.listMy);
router.get('/unread-count', notificationController.unreadCount);
router.post('/:id/read', notificationController.markAsRead);
router.post('/read-all', notificationController.markAllAsRead);

// ===== 主动发送（admin/HR）=====

const sendSchema = z
  .object({
    templateKey: z.string().min(1).max(100).optional(),
    userId: z.string().uuid().optional(),
    userIds: z.array(z.string().uuid()).max(1000).optional(),
    channel: z.enum(['in_app', 'email', 'sms']).optional(),
    subject: z.string().max(200).optional(),
    content: z.string().min(1).max(5000).optional(),
    data: z.record(z.unknown()).optional(),
  })
  .refine(
    (data) => Boolean(data.templateKey) !== Boolean(data.content),
    { message: 'templateKey 和 content 互斥，必须二选一' },
  );

router.post('/send', validate(sendSchema), notificationController.send);

// ===== 模板管理（admin）=====

const listTemplatesSchema = z.object({
  channel: z.enum(['in_app', 'email', 'sms']).optional(),
});

const createTemplateSchema = z.object({
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  channel: z.enum(['in_app', 'email', 'sms']),
  subject: z.string().max(200).optional(),
  contentTemplate: z.string().min(1).max(5000),
  variables: z.record(z.unknown()).optional(),
  description: z.string().max(1000).optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().max(200).optional(),
  contentTemplate: z.string().min(1).max(5000).optional(),
  variables: z.record(z.unknown()).optional(),
  description: z.string().max(1000).optional(),
});

router.get('/templates', validate(listTemplatesSchema, 'query'), notificationController.listTemplates);
router.post('/templates', validate(createTemplateSchema), notificationController.createTemplate);
router.put('/templates/:id', validate(updateTemplateSchema), notificationController.updateTemplate);
router.delete('/templates/:id', notificationController.deleteTemplate);

export default router;
