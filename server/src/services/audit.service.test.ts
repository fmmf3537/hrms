// M0-08: 审计服务单元测试 | HRMS | 2026-08-24
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

import {
  AUDIT_ACTIONS, AUDIT_STATUS, auditLog, listAuditLogs,
} from './audit.service';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    auditLog: mocks,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auditLog', () => {
  it('写入成功：以正确字段调用 prisma.auditLog.create，缺省值落为 null / SUCCESS', async () => {
    mocks.create.mockResolvedValue({});

    await auditLog({
      userId: 'user-1',
      action: AUDIT_ACTIONS.LOGIN,
      resourceType: 'Auth',
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    });

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        actorType: 'USER',
        action: 'LOGIN',
        resourceType: 'Auth',
        resourceId: null,
        description: null,
        oldValue: undefined,
        newValue: undefined,
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
        status: AUDIT_STATUS.SUCCESS,
      },
    });
  });

  it('写入失败不抛错：create reject 时 auditLog 正常 resolve，仅 console.error 告警', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.create.mockRejectedValue(new Error('db down'));

    // 主流程可继续：不 reject
    await expect(auditLog({
      action: AUDIT_ACTIONS.CREATE,
      resourceType: 'Employee',
    })).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});

describe('listAuditLogs', () => {
  it('分页与过滤条件正确传入 findMany / count', async () => {
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-08-24T00:00:00Z');
    mocks.findMany.mockResolvedValue([{ id: 'log-1' }]);
    mocks.count.mockResolvedValue(1);

    const result = await listAuditLogs({
      page: 2,
      pageSize: 10,
      userId: 'user-1',
      action: 'LOGIN',
      resourceType: 'Auth',
      from,
      to,
    });

    const expectedWhere = {
      userId: 'user-1',
      action: 'LOGIN',
      resourceType: 'Auth',
      createdAt: { gte: from, lte: to },
    };
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(mocks.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(result).toEqual({
      data: [{ id: 'log-1' }],
      total: 1,
      page: 2,
      pageSize: 10,
    });
  });

  it('无过滤条件时 where 为空对象，首页 skip=0', async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);

    const result = await listAuditLogs({ page: 1, pageSize: 20 });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
    expect(result.total).toBe(0);
  });
});
