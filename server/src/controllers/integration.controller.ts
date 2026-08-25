// M0.5-4: 集成 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as integrationService from '../services/integration.service';
import type {
  CreateIntegrationInput, SendInput, SyncInput, TestConnectionInput,
} from '../services/integration.service';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const data = await integrationService.listIntegrations();
  res.json({ success: true, data });
});

export const getByCode = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.params;
  const integ = await integrationService.getIntegrationByCode(code);
  res.json({ success: true, data: integ });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Omit<CreateIntegrationInput, 'description'> & { description?: string };
  const result = await integrationService.createIntegration({
    code: body.code,
    name: body.name,
    type: body.type,
    config: body.config as never,
    description: body.description,
  });
  res.status(201).json({ success: true, data: result });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as Partial<Omit<CreateIntegrationInput, 'code'>>;
  const result = await integrationService.updateIntegration(id, {
    name: body.name,
    type: body.type,
    config: body.config as never,
    description: body.description,
  });
  res.json({ success: true, data: result });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  await integrationService.deleteIntegration(id);
  res.json({ success: true });
});

export const send = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { code: string; payload: unknown };
  const input: SendInput = { code: body.code, payload: body.payload };
  const result = await integrationService.send(input);
  res.json({ success: true, data: result });
});

export const sync = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.params;
  const input: SyncInput = { code };
  const result = await integrationService.sync(input);
  res.json({ success: true, data: result });
});

export const testConnection = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.params;
  const input: TestConnectionInput = { code };
  const result = await integrationService.testConnection(input);
  res.json({ success: true, data: result });
});

export const listSyncLogs = asyncHandler(async (req: Request, res: Response) => {
  const integrationId = req.query.integrationId as string | undefined;
  const status = req.query.status as 'success' | 'failed' | 'partial' | undefined;
  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;

  const result = await integrationService.listSyncLogs({
    integrationId,
    status,
    page,
    pageSize,
  });
  res.json({
    success: true,
    data: result.data,
    total: result.total,
    page,
    pageSize,
  });
});
