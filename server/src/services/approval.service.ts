// M0.5-1: 审批流基础设施 | HRMS | 2026-08-25
// 状态机：pending → approved / rejected / withdrawn
// JSON 模板：每节点 { id, type, approverType, approverValue, condition }
// 审批人解析：role(角色) / user(指定人) / direct_leader(直属上级) / department_leader(部门负责人)
// 条件分支：condition 表达式（data.xxx > N 形式），true 时节点进入流程

import type { Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

// ============== 类型定义 ==============

export interface ApprovalNode {
  id: string;
  type: 'sequential'; // M0.5-1 仅支持 sequential（依次审批）；M3+ 加 parallel 会签
  approverType: 'role' | 'user' | 'direct_leader' | 'department_leader';
  approverValue: string;
  condition: string | null; // 简单表达式，如 "data.leave_days > 3"，null = 总是进入
}

export interface SubmitApprovalInput {
  flowKey: string; // category:key 格式，如 "leave:leave_default"
  businessType: string;
  businessId: string;
  title: string;
  initiatorId: string;
  data: Record<string, unknown>;
}

export interface ApprovalActionInput {
  instanceId: string;
  approverId: string;
  comment?: string;
}

// ============== 错误码（与 docs/error-codes.md §2xxxx 对齐）==============

// 20101 APPROVAL_FLOW_NOT_FOUND
// 20102 APPROVAL_INSTANCE_NOT_FOUND
// 20103 APPROVAL_INSTANCE_ALREADY_FINISHED
// 20104 APPROVAL_NOT_YOUR_TURN
// 20105 APPROVAL_PARALLEL_REJECTED
// 20106 APPROVAL_TRANSFER_SELF
// 20107 APPROVAL_CONDITION_NOT_MET
// 20108 INVALID_NODE_STRUCTURE

// ============== 工具：条件表达式求值 ==============

/**
 * 求值条件表达式
 * 支持形式：
 *   - "always" / null → 永远 true
 *   - "data.leave_days > 3" → JSONPath 简单解析
 *   - "data.leave_type == 'annual'" → 等值比较
 * 不支持：复杂表达式（与/或、函数调用、负数）。M3+ 再升级为 jsonata 或 jmespath
 */
function evaluateCondition(condition: string | null, data: Record<string, unknown>): boolean {
  if (!condition || condition === 'always') return true;

  // data.xxx > N
  const gtMatch = /^data\.(\w+)\s*>\s*(\d+(?:\.\d+)?)$/.exec(condition);
  if (gtMatch) {
    const [, key, threshold] = gtMatch;
    const value = data[key];
    return typeof value === 'number' && value > parseFloat(threshold);
  }

  // data.xxx < N
  const ltMatch = /^data\.(\w+)\s*<\s*(\d+(?:\.\d+)?)$/.exec(condition);
  if (ltMatch) {
    const [, key, threshold] = ltMatch;
    const value = data[key];
    return typeof value === 'number' && value < parseFloat(threshold);
  }

  // data.xxx == 'value'
  const eqMatch = /^data\.(\w+)\s*==\s*['"](.+)['"]$/.exec(condition);
  if (eqMatch) {
    const [, key, expected] = eqMatch;
    return data[key] === expected;
  }

  // data.xxx != 'value'
  const neqMatch = /^data\.(\w+)\s*!=\s*['"](.+)['"]$/.exec(condition);
  if (neqMatch) {
    const [, key, expected] = neqMatch;
    return data[key] !== expected;
  }

  // 解析失败：保守拒绝（防止误判进入）
  return false;
}

// ============== 工具：解析 flowKey ==============

function parseFlowKey(flowKey: string): { category: string; key: string } {
  const idx = flowKey.indexOf(':');
  if (idx <= 0 || idx === flowKey.length - 1) {
    throw new AppError(
      `flowKey 格式错误，应为 category:key，实际: ${flowKey}`,
      400,
      20101,
    );
  }
  return {
    category: flowKey.substring(0, idx),
    key: flowKey.substring(idx + 1),
  };
}

// ============== 工具：根据条件筛选出实际经过的节点 ==============

function resolveActiveNodes(
  nodes: ApprovalNode[],
  data: Record<string, unknown>,
): ApprovalNode[] {
  return nodes.filter((node) => evaluateCondition(node.condition, data));
}

// ============== 工具：找到"当前等待审批人" ==============

/**
 * 根据 instance.currentNodeId + 节点列表 + 审批人类型，找到该节点的审批人 userId
 * M0.5-1 简化版：
 *   - approverType='role' 时，按 approverValue 角色（direct_leader / hr / ceo 等）查 user_roles
 *   - approverType='direct_leader' 时，查发起人 employee 的 direct_leader_id（V1+ 接 M1 后再实现）
 *   - approverType='user' 时，直接用 approverValue 作为 userId
 * 当前只实现 'role' 类型的精确解析；其他类型返回 null（让上层决定"无审批人"如何兜底）
 */
async function resolveApproverUserId(
  node: ApprovalNode,
  // M0.5-1 MVP: 暂未使用 initiatorId（M1 接 direct_leader 后启用）
  _initiatorId: string,
  tx: Prisma.TransactionClient,
): Promise<string | null> {
  if (node.approverType === 'user') {
    return node.approverValue;
  }

  if (node.approverType === 'role') {
    // 按角色名找拥有该角色的 userId
    // 注意：一个角色可能多个用户（M0 简化：返回第一个；M2+ 接"任意一人通过即可"或签）
    const userRole = await tx.userRole.findFirst({
      where: { role: { code: node.approverValue } },
      select: { userId: true },
    });
    return userRole?.userId ?? null;
  }

  // direct_leader / department_leader: V1 接 M1 后实现（依赖 employee 表 direct_leader_id）
  return null;
}

// ============== 工具：判断 approverId 是否有权限审批当前节点 ==============

async function canApprove(
  approverId: string,
  node: ApprovalNode,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  // M0.5-1 MVP: 暂忽略 initiatorId（待 M1 接 direct_leader 后使用）
  const expectedApproverId = await resolveApproverUserId(node, '', tx);
  if (!expectedApproverId) return false;
  return expectedApproverId === approverId;
}

// ============== 核心：提交审批 ==============

export async function submitApproval(input: SubmitApprovalInput): Promise<{
  id: string;
  currentNodeId: string | null;
  status: string;
}> {
  const { category, key } = parseFlowKey(input.flowKey);

  // 1. 查模板（取当前启用且 version 最大的）
  const flow = await prisma.approvalFlow.findFirst({
    where: {
      category,
      key,
      enabled: true,
      deletedAt: null,
    },
    orderBy: { version: 'desc' },
  });

  if (!flow) {
    throw new AppError(
      `审批流模板不存在或已停用: ${input.flowKey}`,
      404,
      20101,
    );
  }

  // 2. 解析 nodes，校验结构
  const nodes = flow.nodes as unknown as ApprovalNode[];
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new AppError('审批流模板节点为空', 500, 20108);
  }
  nodes.forEach((node) => {
    if (!node.id || !node.approverType || !node.approverValue) {
      throw new AppError(
        `审批流节点结构不合法: id=${node.id}`,
        500,
        20108,
      );
    }
  });

  // 3. 解析实际经过的节点（条件分支过滤）
  const activeNodes = resolveActiveNodes(nodes, input.data);
  if (activeNodes.length === 0) {
    throw new AppError(
      '审批流没有可执行的节点（所有条件分支都被过滤）',
      400,
      20107,
    );
  }

  // 4. 创建 instance + 首条 record（作为"等待审批"标记）
  const firstNode = activeNodes[0];
  const instance = await prisma.$transaction(async (tx) => {
    const created = await tx.approvalInstance.create({
      data: {
        flowId: flow.id,
        flowKey: input.flowKey,
        businessType: input.businessType,
        businessId: input.businessId,
        title: input.title,
        initiatorId: input.initiatorId,
        currentNodeId: firstNode.id,
        status: 'pending',
        data: input.data as Prisma.InputJsonValue,
      },
    });
    return created;
  });

  return {
    id: instance.id,
    currentNodeId: instance.currentNodeId,
    status: instance.status,
  };
}

// ============== 核心：审批通过 ==============

export async function approve(input: ApprovalActionInput): Promise<{
  id: string;
  status: string;
  currentNodeId: string | null;
}> {
  return prisma.$transaction(async (tx) => {
    const instance = await tx.approvalInstance.findUnique({
      where: { id: input.instanceId },
      include: { flow: true },
    });

    if (!instance) {
      throw new AppError('审批实例不存在', 404, 20102);
    }
    if (instance.status !== 'pending') {
      throw new AppError(
        `审批已结束，当前状态: ${instance.status}`,
        409,
        20103,
      );
    }
    if (!instance.currentNodeId) {
      throw new AppError('审批实例无当前节点（数据异常）', 500, 20108);
    }

    // 找到当前节点
    const nodes = instance.flow.nodes as unknown as ApprovalNode[];
    const currentNode = nodes.find((n) => n.id === instance.currentNodeId);
    if (!currentNode) {
      throw new AppError(
        `当前节点 ${instance.currentNodeId} 不在模板中`,
        500,
        20108,
      );
    }

    // 校验审批人
    if (!(await canApprove(input.approverId, currentNode, tx))) {
      throw new AppError('当前节点不是你的审批', 403, 20104);
    }

    // 写 record
    await tx.approvalRecord.create({
      data: {
        instanceId: instance.id,
        nodeId: currentNode.id,
        approverId: input.approverId,
        action: 'approve',
        comment: input.comment ?? null,
      },
    });

    // 找下一个活跃节点
    const currentIdx = nodes.findIndex((n) => n.id === currentNode.id);
    const remainingNodes = nodes.slice(currentIdx + 1);
    const nextActiveNode = resolveActiveNodes(remainingNodes, instance.data as Record<string, unknown>)[0];

    if (nextActiveNode) {
      // 还有下一节点，更新 currentNodeId
      const updated = await tx.approvalInstance.update({
        where: { id: instance.id },
        data: {
          currentNodeId: nextActiveNode.id,
        },
      });
      return {
        id: updated.id,
        status: updated.status,
        currentNodeId: updated.currentNodeId,
      };
    }

    // 全部通过 → approved
    const updated = await tx.approvalInstance.update({
      where: { id: instance.id },
      data: {
        currentNodeId: null,
        status: 'approved',
        finishedAt: new Date(),
      },
    });
    return {
      id: updated.id,
      status: updated.status,
      currentNodeId: null,
    };
  });
}

// ============== 核心：审批驳回 ==============

export async function reject(input: ApprovalActionInput): Promise<{
  id: string;
  status: string;
}> {
  return prisma.$transaction(async (tx) => {
    const instance = await tx.approvalInstance.findUnique({
      where: { id: input.instanceId },
      include: { flow: true },
    });

    if (!instance) {
      throw new AppError('审批实例不存在', 404, 20102);
    }
    if (instance.status !== 'pending') {
      throw new AppError(
        `审批已结束，当前状态: ${instance.status}`,
        409,
        20103,
      );
    }
    if (!instance.currentNodeId) {
      throw new AppError('审批实例无当前节点（数据异常）', 500, 20108);
    }

    const nodes = instance.flow.nodes as unknown as ApprovalNode[];
    const currentNode = nodes.find((n) => n.id === instance.currentNodeId);
    if (!currentNode) {
      throw new AppError(
        `当前节点 ${instance.currentNodeId} 不在模板中`,
        500,
        20108,
      );
    }

    if (!(await canApprove(input.approverId, currentNode, tx))) {
      throw new AppError('当前节点不是你的审批', 403, 20104);
    }

    // 写 record
    await tx.approvalRecord.create({
      data: {
        instanceId: instance.id,
        nodeId: currentNode.id,
        approverId: input.approverId,
        action: 'reject',
        comment: input.comment ?? null,
      },
    });

    // 驳回 → 整个流程结束
    const updated = await tx.approvalInstance.update({
      where: { id: instance.id },
      data: {
        currentNodeId: null,
        status: 'rejected',
        finishedAt: new Date(),
      },
    });
    return { id: updated.id, status: updated.status };
  });
}

// ============== 核心：转交 ==============

export interface TransferInput {
  instanceId: string;
  fromUserId: string;
  toUserId: string;
  comment?: string;
}

export async function transfer(input: TransferInput): Promise<{
  id: string;
  currentNodeId: string | null;
}> {
  if (input.fromUserId === input.toUserId) {
    throw new AppError('不能转给自己', 400, 20106);
  }

  return prisma.$transaction(async (tx) => {
    const instance = await tx.approvalInstance.findUnique({
      where: { id: input.instanceId },
      include: { flow: true },
    });

    if (!instance) {
      throw new AppError('审批实例不存在', 404, 20102);
    }
    if (instance.status !== 'pending') {
      throw new AppError(
        `审批已结束，当前状态: ${instance.status}`,
        409,
        20103,
      );
    }
    if (!instance.currentNodeId) {
      throw new AppError('审批实例无当前节点（数据异常）', 500, 20108);
    }

    const nodes = instance.flow.nodes as unknown as ApprovalNode[];
    const currentNode = nodes.find((n) => n.id === instance.currentNodeId);
    if (!currentNode) {
      throw new AppError(
        `当前节点 ${instance.currentNodeId} 不在模板中`,
        500,
        20108,
      );
    }

    // 校验转出方就是当前节点的合法审批人
    if (!(await canApprove(input.fromUserId, currentNode, tx))) {
      throw new AppError('你不是当前节点的审批人，无权转交', 403, 20104);
    }

    // 校验转入方存在（简单：查 user 表）
    const toUser = await tx.user.findUnique({
      where: { id: input.toUserId },
      select: { id: true, status: true },
    });
    if (!toUser || toUser.status !== 'active') {
      throw new AppError('转交目标用户不存在或已停用', 400, 20102);
    }

    // 写 record
    await tx.approvalRecord.create({
      data: {
        instanceId: instance.id,
        nodeId: currentNode.id,
        approverId: input.fromUserId,
        action: 'transfer',
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        comment: input.comment ?? null,
      },
    });

    // 注意：转交后 currentNodeId 不变（仍是同一节点），但实际的"待审批人"通过 record 推断
    // M0.5-1 简化版：转交后由前端 UI 控制；M3+ 可加 pendingApproverId 字段
    return {
      id: instance.id,
      currentNodeId: instance.currentNodeId,
    };
  });
}

// ============== 核心：发起人撤回 ==============

export interface WithdrawInput {
  instanceId: string;
  initiatorId: string;
}

export async function withdraw(input: WithdrawInput): Promise<{
  id: string;
  status: string;
}> {
  return prisma.$transaction(async (tx) => {
    const instance = await tx.approvalInstance.findUnique({
      where: { id: input.instanceId },
    });

    if (!instance) {
      throw new AppError('审批实例不存在', 404, 20102);
    }
    if (instance.status !== 'pending') {
      throw new AppError(
        `审批已结束，当前状态: ${instance.status}`,
        409,
        20103,
      );
    }
    if (instance.initiatorId !== input.initiatorId) {
      throw new AppError('只有发起人可以撤回', 403, 20104);
    }

    // 写 record
    await tx.approvalRecord.create({
      data: {
        instanceId: instance.id,
        nodeId: instance.currentNodeId ?? 'initiator_withdraw',
        approverId: input.initiatorId,
        action: 'withdraw',
        comment: null,
      },
    });

    const updated = await tx.approvalInstance.update({
      where: { id: instance.id },
      data: {
        currentNodeId: null,
        status: 'withdrawn',
        finishedAt: new Date(),
      },
    });
    return { id: updated.id, status: updated.status };
  });
}

// ============== 列表：我的待办 ==============

export interface ListMyOptions {
  userId: string;
  role?: 'approver' | 'initiator' | 'all';
  status?: 'pending' | 'finished' | 'all';
  page?: number;
  pageSize?: number;
}

export async function listMyApprovals(options: ListMyOptions): Promise<{
  data: Array<{
    id: string;
    flowKey: string;
    businessType: string;
    businessId: string;
    title: string;
    currentNodeId: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    finishedAt: Date | null;
  }>;
  total: number;
}> {
  const {
    userId, role = 'all', status = 'pending', page = 1, pageSize = 20,
  } = options;

  // 构造 status 过滤
  let statusFilter: Prisma.ApprovalInstanceWhereInput['status'];
  if (status === 'pending') {
    statusFilter = 'pending';
  } else if (status === 'finished') {
    statusFilter = { not: 'pending' };
  } else {
    statusFilter = undefined;
  }

  // 构造 role 过滤
  let where: Prisma.ApprovalInstanceWhereInput = { status: statusFilter };
  if (role === 'approver') {
    // 待办：返回所有 pending instance，前端按"我能否审"过滤（M0.5-1 MVP）
    // M3+ 优化：加 pendingApproverId 字段，SQL 端精确过滤
    where = {
      ...where,
      status: 'pending',
    };
  } else if (role === 'initiator') {
    where = { ...where, initiatorId: userId };
  }

  const [data, total] = await Promise.all([
    prisma.approvalInstance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.approvalInstance.count({ where }),
  ]);

  return {
    data: data.map((d) => ({
      id: d.id,
      flowKey: d.flowKey,
      businessType: d.businessType,
      businessId: d.businessId,
      title: d.title,
      currentNodeId: d.currentNodeId,
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      finishedAt: d.finishedAt,
    })),
    total,
  };
}

// ============== 模板 CRUD ==============

export interface CreateFlowInput {
  category: string;
  key: string;
  name: string;
  description?: string;
  nodes: ApprovalNode[];
}

export async function createFlow(input: CreateFlowInput): Promise<{
  id: string;
  version: number;
}> {
  // 校验 nodes 结构
  if (!Array.isArray(input.nodes) || input.nodes.length === 0) {
    throw new AppError('审批流节点不能为空', 400, 20108);
  }
  input.nodes.forEach((node) => {
    if (!node.id || !node.approverType || !node.approverValue) {
      throw new AppError(
        `审批流节点结构不合法: id=${node.id}`,
        400,
        20108,
      );
    }
  });

  const created = await prisma.approvalFlow.create({
    data: {
      category: input.category,
      key: input.key,
      name: input.name,
      version: 1,
      nodes: input.nodes as unknown as Prisma.InputJsonValue,
      description: input.description ?? null,
      enabled: true,
    },
  });
  return { id: created.id, version: created.version };
}

export async function getFlowByKey(
  category: string,
  key: string,
): Promise<{
    id: string;
    version: number;
    name: string;
    nodes: ApprovalNode[];
  } | null> {
  const flow = await prisma.approvalFlow.findFirst({
    where: {
      category, key, enabled: true, deletedAt: null,
    },
    orderBy: { version: 'desc' },
  });
  if (!flow) return null;
  return {
    id: flow.id,
    version: flow.version,
    name: flow.name,
    nodes: flow.nodes as unknown as ApprovalNode[],
  };
}

export async function listFlows(category?: string): Promise<Array<{
  id: string;
  category: string;
  key: string;
  name: string;
  version: number;
  enabled: boolean;
}>> {
  const flows = await prisma.approvalFlow.findMany({
    where: {
      deletedAt: null,
      ...(category ? { category } : {}),
    },
    orderBy: [{ category: 'asc' }, { key: 'asc' }, { version: 'desc' }],
    select: {
      id: true,
      category: true,
      key: true,
      name: true,
      version: true,
      enabled: true,
    },
  });
  return flows;
}
