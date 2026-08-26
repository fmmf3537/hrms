// M2-B2: 打卡管理 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as attendanceService from '../services/attendance.service';

export const clockIn = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const body = req.body as attendanceService.ClockInInput;
  const data = await attendanceService.clockIn(body, operatorId);
  res.status(201).json({ success: true, data });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await attendanceService.listAttendance({
    employeeId: req.query.employeeId as string | undefined,
    companyId: req.query.companyId as string | undefined,
    departmentId: req.query.departmentId as string | undefined,
    status: req.query.status as string | undefined,
    clockType: req.query.clockType as string | undefined,
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

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const data = await attendanceService.getAttendanceById(req.params.id);
  res.json({ success: true, data });
});

export const manual = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const body = req.body as attendanceService.ManualClockInput;
  const data = await attendanceService.submitManualClock(body, operatorId);
  res.status(201).json({ success: true, data });
});

export const importData = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const body = req.body as attendanceService.ImportAttendanceInput;
  const data = await attendanceService.importAttendance(body, operatorId);
  res.json({ success: true, data });
});
