// M2-B1: 班次定义 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as shiftService from '../services/shift.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const body = req.body as shiftService.CreateShiftInput;
  const data = await shiftService.createShift(body, operatorId);
  res.status(201).json({ success: true, data });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await shiftService.listShifts({
    companyId: req.query.companyId as string | undefined,
    shiftType: req.query.shiftType as string | undefined,
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
  const data = await shiftService.getShiftById(req.params.id);
  res.json({ success: true, data });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const body = req.body as shiftService.UpdateShiftInput;
  const data = await shiftService.updateShift(req.params.id, body, operatorId);
  res.json({ success: true, data });
});

export const assign = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const body = req.body as shiftService.AssignShiftsInput;
  const data = await shiftService.assignShifts(body, operatorId);
  res.json({ success: true, data });
});
