// M0-08: 审计日志查询 controller | HRMS | 2026-08-24
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
