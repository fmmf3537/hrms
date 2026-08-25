// M0-08: 审计日志查询路由 | HRMS | 2026-08-24
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as auditController from '../controllers/audit.controller';
import { authenticate, rejectIfMustChangePassword, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

// 查询参数校验 schema（validate 中间件会将解析结果写回 req.query）
const listQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),
  userId: z.string().uuid().optional(),
  action: z.string().max(50).optional(),
  resourceType: z.string().max(50).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

/**
 * GET /api/audit-logs
 * 分页过滤查询审计日志：page / pageSize / userId / action / resourceType / from / to
 * 仅 admin（通配）与 hr（audit:read）可读
 */
router.get(
  '/',
  authenticate,
  rejectIfMustChangePassword,
  requirePermission(PERMISSIONS.AUDIT_READ),
  validate(listQuerySchema, 'query'),
  auditController.list,
);

export default router;
