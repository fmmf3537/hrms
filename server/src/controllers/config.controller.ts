// M0.5-6: 配置中心 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as configService from '../services/config.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  const data = await configService.listByCategory(category);
  res.json({ success: true, data });
});

export const getValue = asyncHandler(async (req: Request, res: Response) => {
  const { category, key } = req.params;
  const at = req.query.at ? new Date(String(req.query.at)) : undefined;
  const value = await configService.getValue(category, key, at);
  res.json({ success: true, data: { category, key, value } });
});

export const getHistory = asyncHandler(async (req: Request, res: Response) => {
  const { category, key } = req.params;
  const data = await configService.getHistory(category, key);
  res.json({ success: true, data });
});

export const setValue = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as {
    category: string;
    key: string;
    value: unknown;
    effectiveFrom: string;
    effectiveTo?: string | null;
    remark?: string;
  };
  const result = await configService.setValue({
    category: body.category,
    key: body.key,
    value: body.value as never,
    effectiveFrom: new Date(body.effectiveFrom),
    effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
    remark: body.remark,
    createdBy: req.user?.userId ?? null,
  });
  res.status(201).json({ success: true, data: result });
});
