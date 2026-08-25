// M0.5-1: 审批流 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import * as approvalController from '../controllers/approval.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

// 所有端点都需要鉴权
router.use(authenticate);

// ===== 模板管理 =====

// 节点 schema（递归简化：单层）
const nodeSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal('sequential'), // M0.5-1 仅支持依次审批
  approverType: z.enum(['role', 'user', 'direct_leader', 'department_leader']),
  approverValue: z.string().min(1).max(100),
  condition: z.string().max(200).nullable().optional(),
});

const createFlowSchema = z.object({
  category: z.string().min(1).max(50),
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  nodes: z.array(nodeSchema).min(1).max(20),
});

const listFlowsSchema = z.object({
  category: z.string().max(50).optional(),
});

router.get(
  '/flows',
  validate(listFlowsSchema, 'query'),
  approvalController.listFlows,
);

router.get(
  '/flows/by-key',
  validate(z.object({
    category: z.string().min(1).max(50),
    key: z.string().min(1).max(100),
  }), 'query'),
  approvalController.getFlowByKey,
);

router.post(
  '/flows',
  validate(createFlowSchema),
  approvalController.createFlow,
);

// ===== 实例操作 =====

const submitSchema = z.object({
  flowKey: z.string().regex(/^[\w-]+:[\w-]+$/, 'flowKey 格式错误，应为 category:key'),
  businessType: z.string().min(1).max(50),
  businessId: z.string().uuid(),
  title: z.string().min(1).max(200),
  data: z.record(z.unknown()),
});

const actionCommentSchema = z.object({
  comment: z.string().max(1000).optional(),
});

const transferSchema = z.object({
  toUserId: z.string().uuid(),
  comment: z.string().max(1000).optional(),
});

const listMySchema = z.object({
  role: z.enum(['approver', 'initiator', 'all']).default('all'),
  status: z.enum(['pending', 'finished', 'all']).default('pending'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100)
    .default(20),
});

router.post(
  '/instances',
  validate(submitSchema),
  approvalController.submit,
);

router.post(
  '/instances/:id/approve',
  validate(actionCommentSchema),
  approvalController.approve,
);

router.post(
  '/instances/:id/reject',
  validate(actionCommentSchema),
  approvalController.reject,
);

router.post(
  '/instances/:id/transfer',
  validate(transferSchema),
  approvalController.transfer,
);

router.post(
  '/instances/:id/withdraw',
  approvalController.withdraw, // 无 body 校验
);

router.get(
  '/instances',
  validate(listMySchema, 'query'),
  approvalController.listMy,
);

router.get(
  '/instances/:id',
  approvalController.getInstance,
);

export default router;
