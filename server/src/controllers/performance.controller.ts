// M3-D1: 绩效管理 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as coefficientService from '../services/performance_coefficient.service';
import * as cycleService from '../services/performance_cycle.service';
import * as indicatorService from '../services/performance_indicator.service';
import * as schemeService from '../services/performance_scheme.service';

function requireUserId(req: Request, res: Response): string | null {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ success: false, message: '未认证' });
    return null;
  }
  return userId;
}

export const createCycle = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const body = req.body as cycleService.CreateCycleInput;
  const data = await cycleService.createPerformanceCycle(actorId, body);
  res.status(201).json({ success: true, data });
});

export const listCycles = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?.userId ?? 'anonymous';
  const result = await cycleService.listPerformanceCycles(actorId, {
    type: req.query.type as string | undefined,
    status: req.query.status as string | undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    page: req.query.page ? Number(req.query.page) : 1,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20,
  });
  res.json({ success: true, ...result });
});

export const updateCycle = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const body = req.body as cycleService.UpdateCycleInput;
  const data = await cycleService.updatePerformanceCycle(actorId, req.params.id, body);
  res.json({ success: true, data });
});

export const createIndicator = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const body = req.body as indicatorService.CreateIndicatorInput;
  const data = await indicatorService.createPerformanceIndicator(actorId, body);
  res.status(201).json({ success: true, data });
});

export const listIndicators = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?.userId ?? 'anonymous';
  const result = await indicatorService.listPerformanceIndicators(actorId, {
    type: req.query.type as string | undefined,
    status: req.query.status as string | undefined,
    category: req.query.category as string | undefined,
    page: req.query.page ? Number(req.query.page) : 1,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20,
  });
  res.json({ success: true, ...result });
});

export const createScheme = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const body = req.body as schemeService.CreateSchemeInput;
  const data = await schemeService.createPerformanceScheme(actorId, body);
  res.status(201).json({ success: true, data });
});

export const listSchemes = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?.userId ?? 'anonymous';
  const result = await schemeService.listPerformanceSchemes(actorId, {
    cycleId: req.query.cycleId as string | undefined,
    status: req.query.status as string | undefined,
    applicableScope: req.query.applicableScope as string | undefined,
    page: req.query.page ? Number(req.query.page) : 1,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20,
  });
  res.json({ success: true, ...result });
});

export const cloneScheme = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const { newCode, newName } = req.body as { newCode: string; newName: string };
  const data = await schemeService.clonePerformanceScheme(
    actorId,
    req.params.id,
    newCode,
    newName,
  );
  res.status(201).json({ success: true, data });
});

export const getCoefficients = asyncHandler(async (_req: Request, res: Response) => {
  const data = await coefficientService.getActiveCoefficients();
  res.json({ success: true, data });
});

export const updateCoefficients = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const body = req.body as coefficientService.UpdateCoefficientInput;
  const data = await coefficientService.updateCoefficients(actorId, body);
  res.json({ success: true, data });
});
