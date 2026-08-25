// M0.5-1: 审批流 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as approvalService from '../services/approval.service';
import type {
  ApprovalActionInput, ApprovalNode, CreateFlowInput, ListMyOptions, SubmitApprovalInput, TransferInput, WithdrawInput,
} from '../services/approval.service';

// ============== 模板管理 ==============

export const listFlows = asyncHandler(async (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  const flows = await approvalService.listFlows(category);
  res.json({ success: true, data: flows });
});

export const getFlowByKey = asyncHandler(async (req: Request, res: Response) => {
  const { category, key } = req.query;
  if (!category || !key || typeof category !== 'string' || typeof key !== 'string') {
    throw new Error('需要 category 和 key 查询参数'); // 实际由 Zod 校验拦截
  }
  const flow = await approvalService.getFlowByKey(category, key);
  if (!flow) {
    res.status(404).json({
      success: false,
      error: '审批流模板不存在',
      code: 20101,
    });
    return;
  }
  res.json({ success: true, data: flow });
});

export const createFlow = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Omit<CreateFlowInput, 'nodes'> & { nodes: ApprovalNode[] };
  const result = await approvalService.createFlow({
    category: body.category,
    key: body.key,
    name: body.name,
    description: body.description,
    nodes: body.nodes,
  });
  res.status(201).json({ success: true, data: result });
});

// ============== 实例操作 ==============

export const submit = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as SubmitApprovalInput;
  // 取当前用户作为 initiator
  const initiatorId = req.user!.userId;
  const result = await approvalService.submitApproval({
    flowKey: body.flowKey,
    businessType: body.businessType,
    businessId: body.businessId,
    title: body.title,
    initiatorId,
    data: body.data,
  });
  res.status(201).json({ success: true, data: result });
});

export const approve = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { comment } = req.body as { comment?: string };
  const input: ApprovalActionInput = {
    instanceId: id,
    approverId: req.user!.userId,
    comment,
  };
  const result = await approvalService.approve(input);
  res.json({ success: true, data: result });
});

export const reject = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { comment } = req.body as { comment?: string };
  const input: ApprovalActionInput = {
    instanceId: id,
    approverId: req.user!.userId,
    comment,
  };
  const result = await approvalService.reject(input);
  res.json({ success: true, data: result });
});

export const transfer = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { toUserId, comment } = req.body as { toUserId: string; comment?: string };
  const input: TransferInput = {
    instanceId: id,
    fromUserId: req.user!.userId,
    toUserId,
    comment,
  };
  const result = await approvalService.transfer(input);
  res.json({ success: true, data: result });
});

export const withdraw = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const input: WithdrawInput = {
    instanceId: id,
    initiatorId: req.user!.userId,
  };
  const result = await approvalService.withdraw(input);
  res.json({ success: true, data: result });
});

export const listMy = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req.user!);
  const role = (req.query.role as 'approver' | 'initiator' | 'all' | undefined) ?? 'all';
  const status = (req.query.status as 'pending' | 'finished' | 'all' | undefined) ?? 'pending';
  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;

  const options: ListMyOptions = {
    userId, role, status, page, pageSize,
  };
  const result = await approvalService.listMyApprovals(options);
  res.json({
    success: true, data: result.data, total: result.total, page, pageSize,
  });
});

export const getInstance = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const instance = await (await import('../lib/prisma')).default.approvalInstance.findUnique({
    where: { id },
    include: { flow: true },
  });
  if (!instance) {
    res.status(404).json({
      success: false,
      error: '审批实例不存在',
      code: 20102,
    });
    return;
  }
  res.json({ success: true, data: instance });
});
