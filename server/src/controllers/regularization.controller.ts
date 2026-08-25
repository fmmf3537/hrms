// M1-A4: 转正流程 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as regularizationService from '../services/regularization.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as regularizationService.CreateRegularizationInput;
  const data = await regularizationService.createRegularization({
    ...body,
    createdBy: req.user?.userId,
  });
  res.status(201).json({ success: true, data });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await regularizationService.listRegularizations({
    companyId: req.query.companyId as string | undefined,
    departmentId: req.query.departmentId as string | undefined,
    status: req.query.status as string | undefined,
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

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const data = await regularizationService.getRegularizationById(req.params.id);
  res.json({ success: true, data });
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const { reason } = req.body as { reason: string };
  const data = await regularizationService.cancelRegularization(
    req.params.id,
    reason,
    operatorId,
  );
  res.json({ success: true, data });
});
