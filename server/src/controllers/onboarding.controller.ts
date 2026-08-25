// M1-A3: 入职流程 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as onboardingService from '../services/onboarding.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as onboardingService.CreateOnboardingInput;
  const data = await onboardingService.createOnboarding({
    ...body,
    createdBy: req.user?.userId,
  });
  res.status(201).json({ success: true, data });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await onboardingService.listOnboardings({
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

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const data = await onboardingService.getOnboardingById(req.params.id);
  res.json({ success: true, data });
});

export const parseOcr = asyncHandler(async (req: Request, res: Response) => {
  const { type, imageBase64 } = req.body as {
    type: onboardingService.OcrType;
    imageBase64: string;
  };
  const data = await onboardingService.parseOnboardingOCR(
    req.params.id,
    type,
    imageBase64,
    req.user?.userId,
  );
  res.json({ success: true, data });
});

/**
 * 提交审批（draft → submitted）。审批通过后由回调调用 confirmOnboarding。
 */
export const confirm = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }

  const body = req.body as {
    approved?: boolean;
    instanceId?: string;
    reason?: string;
  } | undefined;

  // 审批回调：body.approved === true/false → confirm / reject
  if (body && typeof body.approved === 'boolean') {
    if (body.approved) {
      const data = await onboardingService.confirmOnboarding(
        req.params.id,
        { approved: true, instanceId: body.instanceId },
        operatorId,
      );
      res.json({ success: true, data });
      return;
    }
    const data = await onboardingService.rejectOnboarding(
      req.params.id,
      body.reason ?? '审批驳回',
      operatorId,
    );
    res.json({ success: true, data });
    return;
  }

  // 默认：HR 提交审批 draft → submitted
  const data = await onboardingService.submitOnboarding(req.params.id, operatorId);
  res.json({ success: true, data });
});
