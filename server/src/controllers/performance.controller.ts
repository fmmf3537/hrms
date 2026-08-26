// M3-D1: 绩效管理 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as aiSuggestionService from '../services/performance_ai_suggestion.service';
import * as coefficientService from '../services/performance_coefficient.service';
import * as cycleService from '../services/performance_cycle.service';
import * as indicatorService from '../services/performance_indicator.service';
import * as recordService from '../services/performance_record.service';
import type { CeoApproveInput } from '../services/performance_record.service';
import * as schemeService from '../services/performance_scheme.service';
import type { SaveStageScoreInput } from '../services/performance_score.service';

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

// ==================== M3-D2 考核记录 ====================

export const createRecord = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const body = req.body as recordService.CreateRecordInput;
  const data = await recordService.createPerformanceRecord(actorId, body);
  res.status(201).json({ success: true, data });
});

export const listRecords = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?.userId ?? 'anonymous';
  const result = await recordService.listPerformanceRecords(actorId, {
    cycleId: req.query.cycleId as string | undefined,
    employeeId: req.query.employeeId as string | undefined,
    status: req.query.status as string | undefined,
    deptId: req.query.deptId as string | undefined,
    page: req.query.page ? Number(req.query.page) : 1,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20,
  });
  res.json({ success: true, ...result });
});

export const getRecord = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?.userId ?? 'anonymous';
  const data = await recordService.getPerformanceRecord(actorId, req.params.id);
  res.json({ success: true, data });
});

export const saveSelf = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const data = await recordService.saveSelfScore(actorId, req.params.id, req.body as SaveStageScoreInput);
  res.json({ success: true, data });
});

export const submitSelf = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const data = await recordService.submitSelf(actorId, req.params.id);
  res.json({ success: true, data });
});

export const requestAiSuggest = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const data = await aiSuggestionService.requestAiSuggestion(actorId, req.params.id);
  res.json({ success: true, data });
});

export const listAiSuggestions = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?.userId ?? 'anonymous';
  const data = await aiSuggestionService.listAiSuggestions(actorId, req.params.id);
  res.json({ success: true, data });
});

export const saveManagerScore = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const data = await recordService.saveManagerScore(actorId, req.params.id, req.body as SaveStageScoreInput);
  res.json({ success: true, data });
});

export const submitManager = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const data = await recordService.submitManagerScore(actorId, req.params.id);
  res.json({ success: true, data });
});

export const saveCalibrate = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const data = await recordService.saveCalibration(actorId, req.params.id, req.body as SaveStageScoreInput);
  res.json({ success: true, data });
});

export const submitCalibrate = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const data = await recordService.submitCalibration(actorId, req.params.id);
  res.json({ success: true, data });
});

export const saveHrSummary = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const data = await recordService.saveHrSummary(actorId, req.params.id, req.body as SaveStageScoreInput);
  res.json({ success: true, data });
});

export const submitHr = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const data = await recordService.submitHrSummary(actorId, req.params.id);
  res.json({ success: true, data });
});

export const ceoApprove = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const data = await recordService.ceoApprove(actorId, req.params.id, req.body as CeoApproveInput);
  res.json({ success: true, data });
});

export const archiveRecord = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const data = await recordService.archiveRecord(actorId, req.params.id);
  res.json({ success: true, data });
});

export const rejectRecord = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUserId(req, res);
  if (!actorId) return;
  const { reason } = req.body as { reason: string };
  const data = await recordService.rejectRecord(actorId, req.params.id, { reason });
  res.json({ success: true, data });
});
