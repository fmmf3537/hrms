// M0-08: 审计日志查询 controller | HRMS | 2026-08-24
// M5-04: 新增 reveal（二次授权查看明文）
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as auditService from '../services/audit.service';

/**
 * GET /api/audit-logs
 * 分页查询审计日志（仅 admin / hr，见路由上的 requirePermission）
 */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as {
    page: number;
    pageSize: number;
    userId?: string;
    action?: string;
    resourceType?: string;
    from?: string;
    to?: string;
  };

  const result = await auditService.listAuditLogs({
    page: query.page,
    pageSize: query.pageSize,
    userId: query.userId,
    action: query.action,
    resourceType: query.resourceType,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  });

  res.json({
    success: true,
    data: result.data,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
});

/**
 * POST /api/audit-logs/:id/reveal
 * 二次授权查看审计中某条敏感字段的明文（仅 admin/hr/executive，路由层 requireRole 已拦）
 * 响应仅含请求字段；每次 reveal 写一条 AUDIT_REVEAL 审计（留痕）
 */
export const reveal = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.user!;
  const { id } = req.params;
  const { fields, reason } = req.body as { fields: string[]; reason: string };

  const log = await auditService.getAuditLogById(id);
  if (!log) {
    res.status(404).json({ success: false, error: '审计日志不存在', code: 70101 });
    return;
  }

  const data: Record<string, unknown> = {};
  fields.forEach((field) => {
    data[field] = auditService.revealAuditValue(log, field);
  });

  // 二次审计：reveal 行为本身留痕（fire-and-forget）
  await auditService.auditLog({
    userId: actor.userId,
    action: 'AUDIT_REVEAL',
    resourceType: 'AuditLog',
    resourceId: log.id,
    description: `reveal fields: [${fields.join(', ')}] reason: ${reason}`,
    newValue: { revealedFields: fields, reason },
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });

  res.json({ success: true, data });
});
