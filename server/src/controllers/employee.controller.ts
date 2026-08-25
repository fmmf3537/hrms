// M1-A2: 员工档案 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as employeeService from '../services/employee.service';
import * as employeeAIService from '../services/employeeAI.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await employeeService.listEmployees({
    companyId: req.query.companyId as string | undefined,
    departmentId: req.query.departmentId as string | undefined,
    status: req.query.status as string | undefined,
    keyword: req.query.keyword as string | undefined,
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

export const statistics = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.query.companyId as string | undefined;
  const data = await employeeService.getEmployeeStatistics(companyId);
  res.json({ success: true, data });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const emp = await employeeService.getEmployeeById(req.params.id);
  res.json({ success: true, data: emp });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as employeeService.CreateEmployeeInput;
  const emp = await employeeService.createEmployee({
    ...body,
    createdBy: req.user?.userId,
  });
  res.status(201).json({ success: true, data: emp });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const emp = await employeeService.updateEmployee(
    req.params.id,
    req.body as employeeService.UpdateEmployeeInput,
    req.user?.userId,
  );
  res.json({ success: true, data: emp });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const emp = await employeeService.deleteEmployee(req.params.id, req.user?.userId);
  res.json({ success: true, data: emp });
});

export const parseIdCard = asyncHandler(async (req: Request, res: Response) => {
  const { imageBase64 } = req.body as { imageBase64: string };
  const data = await employeeAIService.parseIdCard(imageBase64, req.user?.userId);
  res.json({ success: true, data });
});

export const parseBankCard = asyncHandler(async (req: Request, res: Response) => {
  const { imageBase64 } = req.body as { imageBase64: string };
  const data = await employeeAIService.parseBankCard(imageBase64, req.user?.userId);
  res.json({ success: true, data });
});

export const parseCertificate = asyncHandler(async (req: Request, res: Response) => {
  const { imageBase64 } = req.body as { imageBase64: string };
  const data = await employeeAIService.parseCertificate(imageBase64, req.user?.userId);
  res.json({ success: true, data });
});

export const contractExpiring = asyncHandler(async (req: Request, res: Response) => {
  // 路由挂在 /:id/contract-expiring，此处 id 视为 companyId（与 api 清单一致用 query 亦可）
  const companyId = (req.query.companyId as string | undefined) ?? req.params.id;
  const days = req.query.days ? Number(req.query.days) : 30;
  const data = await employeeService.getContractExpiringEmployees(companyId, days);
  res.json({ success: true, data });
});

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const data = await employeeAIService.generateEmployeeSummary(
    req.params.id,
    req.user?.userId,
  );
  res.json({ success: true, data });
});
