// M0.5-1: 审批流 routes | HRMS
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../constants/permissions';
import * as approvalController from '../controllers/approval.controller';
import {
  authenticate, rejectIfMustChangePassword, requirePermission,
} from '../middleware/auth';
import { validate } from '../middleware/validate';

const router: RouterType = Router();

router.use(authenticate, rejectIfMustChangePassword);

const nodeSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal('sequential'),
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
  requirePermission(PERMISSIONS.APPROVAL_FLOW_READ),
  validate(listFlowsSchema, 'query'),
  approvalController.listFlows,
);

router.get(
  '/flows/by-key',
  requirePermission(PERMISSIONS.APPROVAL_FLOW_READ),
  validate(z.object({
    category: z.string().min(1).max(50),
    key: z.string().min(1).max(100),
  }), 'query'),
  approvalController.getFlowByKey,
);

router.post(
  '/flows',
  requirePermission(PERMISSIONS.APPROVAL_FLOW_WRITE),
  validate(createFlowSchema),
  approvalController.createFlow,
);

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
  requirePermission(PERMISSIONS.APPROVAL_INSTANCE_ACT),
  validate(submitSchema),
  approvalController.submit,
);

router.post(
  '/instances/:id/approve',
  requirePermission(PERMISSIONS.APPROVAL_INSTANCE_ACT),
  validate(actionCommentSchema),
  approvalController.approve,
);

router.post(
  '/instances/:id/reject',
  requirePermission(PERMISSIONS.APPROVAL_INSTANCE_ACT),
  validate(actionCommentSchema),
  approvalController.reject,
);

router.post(
  '/instances/:id/transfer',
  requirePermission(PERMISSIONS.APPROVAL_INSTANCE_ACT),
  validate(transferSchema),
  approvalController.transfer,
);

router.post(
  '/instances/:id/withdraw',
  requirePermission(PERMISSIONS.APPROVAL_INSTANCE_ACT),
  approvalController.withdraw,
);

router.get(
  '/instances',
  requirePermission(PERMISSIONS.APPROVAL_INSTANCE_ACT),
  validate(listMySchema, 'query'),
  approvalController.listMy,
);

router.get(
  '/instances/:id',
  requirePermission(PERMISSIONS.APPROVAL_INSTANCE_ACT),
  approvalController.getInstance,
);

export default router;
