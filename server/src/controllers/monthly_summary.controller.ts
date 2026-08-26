// M2-B6: 月度考勤汇总 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as monthlySummaryService from '../services/monthly_summary.service';

export const generate = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const body = req.body as monthlySummaryService.GenerateMonthlySummaryInput;
  const data = await monthlySummaryService.generateMonthlySummary(body, operatorId);
  res.status(201).json({ success: true, data });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await monthlySummaryService.getMonthlySummary({
    employeeId: req.query.employeeId as string | undefined,
    companyId: req.query.companyId as string | undefined,
    departmentId: req.query.departmentId as string | undefined,
    year: Number(req.query.year),
    month: Number(req.query.month),
    status: req.query.status as string | undefined,
  });
  res.json({ success: true, data: result });
});

export const confirm = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const data = await monthlySummaryService.confirmMonthlySummary(req.params.id, operatorId);
  res.json({ success: true, data });
});

export const lock = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const data = await monthlySummaryService.lockMonthlySummary(req.params.id, operatorId);
  res.json({ success: true, data });
});
