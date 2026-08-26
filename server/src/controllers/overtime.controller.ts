// M2-B4: 加班 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as overtimeService from '../services/overtime.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const body = req.body as overtimeService.CreateOvertimeRequestInput;
  const data = await overtimeService.createOvertimeRequest(body, operatorId);
  res.status(201).json({ success: true, data });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await overtimeService.listOvertimeRequests({
    employeeId: req.query.employeeId as string | undefined,
    companyId: req.query.companyId as string | undefined,
    departmentId: req.query.departmentId as string | undefined,
    compensationType: req.query.compensationType as string | undefined,
    status: req.query.status as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    page: req.query.page ? Number(req.query.page) : 1,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20,
  });
  res.json({
    success: true,
    data: result.data,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const { reason } = req.body as { reason: string };
  const data = await overtimeService.cancelOvertimeRequest(req.params.id, reason, operatorId);
  res.json({ success: true, data });
});
