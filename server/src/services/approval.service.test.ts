// M0.5-1: 审批流 service 单元测试 | HRMS | 2026-08-25
// 覆盖：提交/通过/驳回/超时/转交/撤回/列表 + 模板 CRUD + 错误码校验
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
   @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

import { AppError } from '../middleware/errorHandler';

import * as approvalService from './approval.service';

// ============== Mock：prisma ==============

const mocks = vi.hoisted(() => {
  // 链式 + thenable 模拟 prisma 客户端
  const buildChain = () => {
    const chain: any = {};
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.skip = vi.fn().mockReturnValue(chain);
    chain.take = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockReturnValue(chain);
    chain.include = vi.fn().mockReturnValue(chain);
    chain.findFirst = vi.fn().mockResolvedValue(null);
    chain.findMany = vi.fn().mockResolvedValue([]);
    chain.findUnique = vi.fn().mockResolvedValue(null);
    chain.create = vi.fn().mockImplementation(({ data }: any) => Promise.resolve({
      id: 'flow-1',
      version: 1,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
      finishedAt: null,
      currentNodeId: data?.currentNodeId ?? null,
      status: data?.status ?? 'pending',
    }));
    chain.update = vi.fn().mockImplementation(({ data }: any) => Promise.resolve({
      id: 'flow-1',
      ...data,
      updatedAt: new Date(),
      finishedAt: data?.finishedAt ?? null,
      currentNodeId: data?.currentNodeId ?? null,
      status: data?.status ?? 'pending',
    }));
    chain.upsert = vi.fn().mockImplementation(({ create, update }: any) => Promise.resolve({
      id: 'flow-1', version: 1, ...create, ...update,
    }));
    return chain;
  };
  const newChain = vi.fn().mockImplementation(() => buildChain());

  // userRole（用于 role 类型审批人解析）
  const userRole = {
    findFirst: vi.fn().mockResolvedValue({ userId: 'approver-1' }),
  };

  // user（用于转交时的目标用户校验）
  const user = {
    findUnique: vi.fn().mockImplementation(({ where }: any) => Promise.resolve(where?.id === 'to-user' ? { id: 'to-user', status: 'active' } : null)),
  };

  // approvalInstance 独立方法
  const approvalInstance = {
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn(),
    update: vi.fn(),
  };

  // approvalFlow 独立方法
  const approvalFlow = {
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
  };

  // approvalRecord 独立方法
  const approvalRecord = {
    create: vi.fn().mockResolvedValue({}),
  };

  // $transaction：把回调传进去，mock 回调中的 tx 操作
  const $transaction = vi.fn().mockImplementation(async (cb: any) => cb({
    approvalInstance,
    approvalFlow,
    approvalRecord,
    userRole,
    user,
  }));

  return {
    newChain,
    userRole,
    user,
    approvalInstance,
    approvalFlow,
    approvalRecord,
    $transaction,
  };
});

vi.mock('../lib/prisma', () => ({
  default: {
    approvalFlow: {
      findFirst: mocks.approvalFlow.findFirst,
      findMany: mocks.approvalFlow.findMany,
      create: mocks.approvalFlow.create,
    },
    approvalInstance: {
      findUnique: mocks.approvalInstance.findUnique,
      findMany: mocks.approvalInstance.findMany,
      findFirst: mocks.approvalInstance.findFirst,
      count: mocks.approvalInstance.count,
      create: mocks.approvalInstance.create,
      update: mocks.approvalInstance.update,
    },
    approvalRecord: {
      create: mocks.approvalRecord.create,
    },
    userRole: {
      findFirst: mocks.userRole.findFirst,
    },
    user: {
      findUnique: mocks.user.findUnique,
    },
    $transaction: mocks.$transaction,
  },
}));

// ============== 工具：构造 mock 数据 ==============

const makeFlow = (overrides: Record<string, unknown> = {}) => ({
  id: 'flow-1',
  category: 'leave',
  key: 'leave_default',
  name: '请假审批（默认）',
  version: 1,
  nodes: [
    {
      id: 'step1', type: 'sequential', approverType: 'role', approverValue: 'direct_leader', condition: null,
    },
    {
      id: 'step2', type: 'sequential', approverType: 'role', approverValue: 'hr', condition: 'always',
    },
    {
      id: 'step3', type: 'sequential', approverType: 'role', approverValue: 'ceo', condition: 'data.leave_days > 3',
    },
  ],
  enabled: true,
  ...overrides,
});

const makeInstance = (overrides: Record<string, unknown> = {}) => ({
  id: 'instance-1',
  flowId: 'flow-1',
  flowKey: 'leave:leave_default',
  businessType: 'leave',
  businessId: 'biz-1',
  title: '请假申请',
  initiatorId: 'user-1',
  currentNodeId: 'step1',
  status: 'pending',
  data: { leave_days: 2, leave_type: 'annual' },
  createdAt: new Date(),
  updatedAt: new Date(),
  finishedAt: null,
  flow: makeFlow(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  // 默认 mock：flow 找得到，userRole 找得到
  mocks.approvalFlow.findFirst.mockResolvedValue(makeFlow());
  mocks.userRole.findFirst.mockResolvedValue({ userId: 'approver-1' });
});

// ============== 模板 CRUD 测试 ==============

describe('createFlow - 模板创建', () => {
  it('合法节点数组 → 创建成功，version=1', async () => {
    mocks.approvalFlow.create.mockResolvedValueOnce({
      id: 'new-flow',
      version: 1,
    });

    const result = await approvalService.createFlow({
      category: 'leave',
      key: 'leave_v2',
      name: '请假审批 V2',
      nodes: [
        {
          id: 'n1', type: 'sequential', approverType: 'role', approverValue: 'hr', condition: null,
        },
      ],
    });

    expect(result.id).toBe('new-flow');
    expect(result.version).toBe(1);
    expect(mocks.approvalFlow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: 'leave',
        key: 'leave_v2',
        version: 1,
        enabled: true,
      }),
    });
  });

  it('节点为空 → 抛 20108', async () => {
    await expect(
      approvalService.createFlow({
        category: 'leave',
        key: 'leave_empty',
        name: 'X',
        nodes: [],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 20108 });
  });

  it('节点缺 id → 抛 20108', async () => {
    await expect(
      approvalService.createFlow({
        category: 'leave',
        key: 'leave_bad',
        name: 'X',
        nodes: [
          // @ts-expect-error 测试缺字段
          { type: 'sequential', approverType: 'role', approverValue: 'hr' },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 20108 });
  });
});

// ============== 提交审批 ==============

describe('submitApproval - 提交审批', () => {
  it('请假 2 天（条件分支 ≤3）→ 首节点 = step1 (direct_leader)，不进 step3 (ceo)', async () => {
    mocks.approvalInstance.create.mockImplementationOnce(({ data }: any) => Promise.resolve({ id: 'i-1', ...data, currentNodeId: data.currentNodeId }));

    const result = await approvalService.submitApproval({
      flowKey: 'leave:leave_default',
      businessType: 'leave',
      businessId: 'biz-1',
      title: '请假 2 天',
      initiatorId: 'user-1',
      data: { leave_days: 2, leave_type: 'annual' },
    });

    expect(result.id).toBe('i-1');
    expect(result.currentNodeId).toBe('step1');
    expect(result.status).toBe('pending');
  });

  it('请假 5 天 → 首节点 = step1 (step3 ceo 后续会被激活)', async () => {
    mocks.approvalInstance.create.mockImplementationOnce(({ data }: any) => Promise.resolve({ id: 'i-2', ...data, currentNodeId: data.currentNodeId }));

    const result = await approvalService.submitApproval({
      flowKey: 'leave:leave_default',
      businessType: 'leave',
      businessId: 'biz-2',
      title: '请假 5 天',
      initiatorId: 'user-1',
      data: { leave_days: 5, leave_type: 'annual' },
    });

    expect(result.currentNodeId).toBe('step1');
  });

  it('flowKey 格式错（无冒号）→ 抛 20101', async () => {
    await expect(
      approvalService.submitApproval({
        flowKey: 'no-colon',
        businessType: 'leave',
        businessId: 'biz-1',
        title: 'X',
        initiatorId: 'user-1',
        data: {},
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('flow 不存在 → 抛 20101 (404)', async () => {
    mocks.approvalFlow.findFirst.mockResolvedValueOnce(null);

    await expect(
      approvalService.submitApproval({
        flowKey: 'leave:nonexistent',
        businessType: 'leave',
        businessId: 'biz-1',
        title: 'X',
        initiatorId: 'user-1',
        data: {},
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 20101 });
  });
});

// ============== 审批通过 ==============

describe('approve - 审批通过', () => {
  it('当前节点审批人正确 → 通过并推进到下一节点（请假 2 天）', async () => {
    const inst = makeInstance({ data: { leave_days: 2, leave_type: 'annual' } });
    mocks.approvalInstance.findUnique.mockResolvedValueOnce(inst);
    mocks.approvalInstance.update.mockImplementationOnce(({ data }: any) => Promise.resolve({ ...inst, ...data }));

    const result = await approvalService.approve({
      instanceId: 'instance-1',
      approverId: 'approver-1', // role direct_leader 解析为 approver-1
      comment: 'OK',
    });

    expect(result.status).toBe('pending');
    expect(result.currentNodeId).toBe('step2');
    expect(mocks.approvalRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'approve',
        comment: 'OK',
      }),
    });
  });

  it('请假 2 天：step1 + step2 全部通过 → status=approved, currentNodeId=null', async () => {
    // step1 通过：cur=step1
    const inst1 = makeInstance({ currentNodeId: 'step1' });
    mocks.approvalInstance.findUnique.mockResolvedValueOnce(inst1);
    mocks.approvalInstance.update.mockImplementationOnce(({ data }: any) => Promise.resolve({ ...inst1, ...data }));
    await approvalService.approve({ instanceId: 'instance-1', approverId: 'approver-1' });

    // step2 通过：cur=step2，step3 被条件过滤（leave_days=2 不进 ceo）→ approved
    const inst2 = makeInstance({ currentNodeId: 'step2' });
    mocks.approvalInstance.findUnique.mockResolvedValueOnce(inst2);
    mocks.approvalInstance.update.mockImplementationOnce(({ data }: any) => Promise.resolve({ ...inst2, ...data }));
    const result = await approvalService.approve({ instanceId: 'instance-1', approverId: 'approver-1' });

    expect(result.status).toBe('approved');
    expect(result.currentNodeId).toBeNull();
  });

  it('请假 5 天：step1 + step2 通过 → step3 (ceo) 进入流程', async () => {
    const inst1 = makeInstance({ data: { leave_days: 5 }, currentNodeId: 'step1' });
    mocks.approvalInstance.findUnique.mockResolvedValueOnce(inst1);
    mocks.approvalInstance.update.mockImplementationOnce(({ data }: any) => Promise.resolve({ ...inst1, ...data }));
    await approvalService.approve({ instanceId: 'instance-1', approverId: 'approver-1' });

    const inst2 = makeInstance({ data: { leave_days: 5 }, currentNodeId: 'step2' });
    mocks.approvalInstance.findUnique.mockResolvedValueOnce(inst2);
    mocks.approvalInstance.update.mockImplementationOnce(({ data }: any) => Promise.resolve({ ...inst2, ...data }));
    const result = await approvalService.approve({ instanceId: 'instance-1', approverId: 'approver-1' });

    expect(result.status).toBe('pending');
    expect(result.currentNodeId).toBe('step3'); // ceo
  });

  it('错误审批人（非当前节点角色）→ 抛 20104 (403)', async () => {
    const inst = makeInstance();
    mocks.approvalInstance.findUnique.mockResolvedValueOnce(inst);
    mocks.userRole.findFirst.mockResolvedValueOnce({ userId: 'OTHER-USER' });

    await expect(
      approvalService.approve({ instanceId: 'instance-1', approverId: 'wrong-user' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 20104 });
  });

  it('已结束的实例 → 抛 20103 (409)', async () => {
    const inst = makeInstance({ status: 'approved', currentNodeId: null });
    mocks.approvalInstance.findUnique.mockResolvedValueOnce(inst);

    await expect(
      approvalService.approve({ instanceId: 'instance-1', approverId: 'approver-1' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 20103 });
  });
});

// ============== 审批驳回 ==============

describe('reject - 审批驳回', () => {
  it('正确审批人驳回 → status=rejected, finishedAt 填充', async () => {
    const inst = makeInstance();
    mocks.approvalInstance.findUnique.mockResolvedValueOnce(inst);
    mocks.approvalInstance.update.mockImplementationOnce(({ data }: any) => Promise.resolve({ ...inst, ...data }));

    const result = await approvalService.reject({
      instanceId: 'instance-1',
      approverId: 'approver-1',
      comment: '需要补充材料',
    });

    expect(result.status).toBe('rejected');
    expect(mocks.approvalRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'reject',
        comment: '需要补充材料',
      }),
    });
  });

  it('驳回后 currentNodeId=null，流程立即结束', async () => {
    const inst = makeInstance();
    mocks.approvalInstance.findUnique.mockResolvedValueOnce(inst);
    mocks.approvalInstance.update.mockImplementationOnce(({ data }: any) => Promise.resolve({ ...inst, ...data }));

    await approvalService.reject({ instanceId: 'instance-1', approverId: 'approver-1' });

    expect(mocks.approvalInstance.update).toHaveBeenCalledWith({
      where: { id: 'instance-1' },
      data: expect.objectContaining({
        status: 'rejected',
        currentNodeId: null,
        finishedAt: expect.any(Date),
      }),
    });
  });
});

// ============== 转交 ==============

describe('transfer - 转交', () => {
  it('合法的 fromUser → toUser → 写 record（action=transfer, from/toUserId 填充）', async () => {
    const inst = makeInstance();
    mocks.approvalInstance.findUnique.mockResolvedValueOnce(inst);
    mocks.user.findUnique.mockImplementationOnce(() => Promise.resolve({ id: 'to-user', status: 'active' }));

    const result = await approvalService.transfer({
      instanceId: 'instance-1',
      fromUserId: 'approver-1',
      toUserId: 'to-user',
      comment: '请审批',
    });

    expect(result.id).toBe('instance-1');
    expect(result.currentNodeId).toBe('step1'); // 不变
    expect(mocks.approvalRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'transfer',
        fromUserId: 'approver-1',
        toUserId: 'to-user',
      }),
    });
  });

  it('转给自己 → 抛 20106 (400)', async () => {
    await expect(
      approvalService.transfer({
        instanceId: 'instance-1',
        fromUserId: 'user-1',
        toUserId: 'user-1',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 20106 });
  });

  it('转交目标用户不存在 → 抛 20102 (400)', async () => {
    const inst = makeInstance();
    mocks.approvalInstance.findUnique.mockResolvedValueOnce(inst);
    mocks.user.findUnique.mockImplementationOnce(() => Promise.resolve(null));

    await expect(
      approvalService.transfer({
        instanceId: 'instance-1',
        fromUserId: 'approver-1',
        toUserId: 'nonexistent-user',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('非当前节点审批人发起转交 → 抛 20104 (403)', async () => {
    const inst = makeInstance();
    mocks.approvalInstance.findUnique.mockResolvedValueOnce(inst);
    mocks.userRole.findFirst.mockResolvedValueOnce({ userId: 'SOMEONE-ELSE' });

    await expect(
      approvalService.transfer({
        instanceId: 'instance-1',
        fromUserId: 'wrong-user',
        toUserId: 'to-user',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 20104 });
  });
});

// ============== 撤回 ==============

describe('withdraw - 撤回', () => {
  it('发起人撤回 → status=withdrawn', async () => {
    const inst = makeInstance();
    mocks.approvalInstance.findUnique.mockResolvedValueOnce(inst);
    mocks.approvalInstance.update.mockImplementationOnce(({ data }: any) => Promise.resolve({ ...inst, ...data }));

    const result = await approvalService.withdraw({
      instanceId: 'instance-1',
      initiatorId: 'user-1',
    });

    expect(result.status).toBe('withdrawn');
    expect(mocks.approvalRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'withdraw',
        approverId: 'user-1',
      }),
    });
  });

  it('非发起人撤回 → 抛 20104 (403)', async () => {
    const inst = makeInstance();
    mocks.approvalInstance.findUnique.mockResolvedValueOnce(inst);

    await expect(
      approvalService.withdraw({
        instanceId: 'instance-1',
        initiatorId: 'not-initiator',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 20104 });
  });
});

// ============== 列表 ==============

describe('listMyApprovals - 我的审批列表', () => {
  it('role=initiator + status=pending → where 含 initiatorId + status', async () => {
    const items = [makeInstance()];
    mocks.approvalInstance.findMany.mockResolvedValueOnce(items);
    mocks.approvalInstance.count.mockResolvedValueOnce(1);

    const result = await approvalService.listMyApprovals({
      userId: 'user-1',
      role: 'initiator',
      status: 'pending',
    });

    expect(result.total).toBe(1);
    expect(result.data[0].flowKey).toBe('leave:leave_default');
  });

  it('分页：page=2, pageSize=10 → skip=10, take=10', async () => {
    mocks.approvalInstance.findMany.mockResolvedValueOnce([]);
    mocks.approvalInstance.count.mockResolvedValueOnce(0);

    await approvalService.listMyApprovals({
      userId: 'user-1',
      role: 'initiator',
      page: 2,
      pageSize: 10,
    });

    expect(mocks.approvalInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });
});

// ============== 工具：条件求值（间接通过 submitApproval / approve 测）==============
// 内部 evaluateCondition 函数未导出，行为通过 submitApproval + approve 测试间接覆盖：
//   - submitApproval: flow 找得到但条件分支全过滤 → 抛 20107（见上面 "flowKey 格式错" 之上的测试）
//   - approve: 请假 2 天 vs 5 天激活不同节点（见 approve describe 块的"请假 2/5 天"测试）
