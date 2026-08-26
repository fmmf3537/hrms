// M1-A7: 合同管理 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as contractService from '../services/contract.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const body = req.body as contractService.CreateContractInput;
  const data = await contractService.createContract(body, operatorId);
  res.status(201).json({ success: true, data });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await contractService.listContracts({
    employeeId: req.query.employeeId as string | undefined,
    contractType: req.query.contractType as string | undefined,
    status: req.query.status as string | undefined,
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
  const data = await contractService.getContractById(req.params.id);
  res.json({ success: true, data });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const body = req.body as contractService.UpdateContractInput & { submit?: boolean };
  const { submit, ...updateInput } = body;
  let data = await contractService.updateContract(
    req.params.id,
    updateInput,
    operatorId,
  );
  if (submit) {
    data = await contractService.submitContract(req.params.id, operatorId);
  }
  res.json({ success: true, data });
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const operatorId = req.user?.userId;
  if (!operatorId) {
    res.status(401).json({ success: false, message: '未认证' });
    return;
  }
  const { reason } = req.body as { reason: string };
  const data = await contractService.cancelContract(
    req.params.id,
    reason,
    operatorId,
  );
  res.json({ success: true, data });
});

export const eSignWebhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = (req.headers['x-esign-signature'] as string) ?? '';
  const payload = req.body as contractService.ESignCallbackPayload;
  const data = await contractService.handleESignCallback(payload, signature);
  res.json({ success: true, data });
});
