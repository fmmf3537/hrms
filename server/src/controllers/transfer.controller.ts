// M1-A5: 调动流程 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as transferService from '../services/transfer.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const body = req.body as transferService.CreateTransferInput;
  const data = await transferService.createTransfer(body, operatorId);
  res.status(201).json({ success: true, data });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await transferService.listTransfers({
    employeeId: req.query.employeeId as string | undefined,
    status: req.query.status as string | undefined,
    fromDeptId: req.query.fromDeptId as string | undefined,
    toDeptId: req.query.toDeptId as string | undefined,
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
  const data = await transferService.getTransferById(req.params.id);
  res.json({ success: true, data });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const body = req.body as transferService.UpdateTransferInput;
  const data = await transferService.updateTransfer(
    req.params.id,
    body,
    operatorId,
  );
  res.json({ success: true, data });
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const { reason } = req.body as { reason: string };
  const data = await transferService.cancelTransfer(
    req.params.id,
    reason,
    operatorId,
  );
  res.json({ success: true, data });
});
