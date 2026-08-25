// M1-A1: 部门 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as departmentService from '../services/department.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.query.companyId as string | undefined;
  const parentIdRaw = req.query.parentId as string | undefined;
  const status = req.query.status as string | undefined;
  const parentId = parentIdRaw === 'null' ? null : parentIdRaw;
  const data = await departmentService.listDepartments({ companyId, parentId, status });
  res.json({ success: true, data });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const dept = await departmentService.getDepartmentById(req.params.id);
  res.json({ success: true, data: dept });
});

export const tree = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.query.companyId as string;
  const rootId = req.query.rootId as string | undefined;
  const data = await departmentService.getDepartmentTree(companyId, rootId);
  res.json({ success: true, data });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as departmentService.CreateDepartmentInput;
  const dept = await departmentService.createDepartment({
    ...body,
    createdBy: req.user?.userId,
  });
  res.status(201).json({ success: true, data: dept });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const dept = await departmentService.updateDepartment(
    req.params.id,
    req.body as departmentService.UpdateDepartmentInput,
    req.user?.userId,
  );
  res.json({ success: true, data: dept });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const dept = await departmentService.deleteDepartment(req.params.id, req.user?.userId);
  res.json({ success: true, data: dept });
});

export const move = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { newParentId?: string | null; newOrder?: number };
  const dept = await departmentService.moveDepartment(
    req.params.id,
    body.newParentId ?? null,
    body.newOrder,
    req.user?.userId,
  );
  res.json({ success: true, data: dept });
});

export const headcount = asyncHandler(async (req: Request, res: Response) => {
  const dept = await departmentService.getDepartmentById(req.params.id);
  const stats = await departmentService.getHeadcountStatistics(dept.companyId);
  const mine = stats[dept.id] ?? {
    departmentId: dept.id,
    code: dept.code,
    name: dept.name,
    headcount: dept.headcount,
    currentCount: 0,
    warningLevel: 'ok' as const,
  };
  res.json({ success: true, data: mine });
});
