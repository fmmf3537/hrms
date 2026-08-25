// M1-A1: 法人公司 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as companyService from '../services/company.service';
import * as departmentService from '../services/department.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;
  const result = await companyService.listCompanies({ status, page, pageSize });
  res.json({
    success: true,
    data: result.data,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const company = await companyService.getCompanyById(req.params.id);
  res.json({ success: true, data: company });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as companyService.CreateCompanyInput;
  const company = await companyService.createCompany({
    ...body,
    createdBy: req.user?.userId,
  });
  res.status(201).json({ success: true, data: company });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const company = await companyService.updateCompany(
    req.params.id,
    req.body as companyService.UpdateCompanyInput,
    req.user?.userId,
  );
  res.json({ success: true, data: company });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const company = await companyService.deleteCompany(req.params.id, req.user?.userId);
  res.json({ success: true, data: company });
});

export const statistics = asyncHandler(async (req: Request, res: Response) => {
  const stats = await companyService.getCompanyStatistics(req.params.id);
  res.json({ success: true, data: stats });
});

export const headcountWarning = asyncHandler(async (req: Request, res: Response) => {
  const warnings = await departmentService.checkHeadcountWarning(req.params.id);
  res.json({ success: true, data: warnings });
});
