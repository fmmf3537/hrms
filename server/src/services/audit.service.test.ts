// M0-08: 审计服务单元测试 | HRMS | 2026-08-24
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

import {
  AUDIT_ACTIONS, AUDIT_STATUS, auditLog, listAuditLogs, maskAuditValue, protectAuditValue,
  revealAuditValue,
} from './audit.service';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  findUnique: vi.fn(),
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

// M5-04: 敏感字段保护 / 打码 / reveal 还原
describe('protectAuditValue / maskAuditValue / revealAuditValue', () => {
  it('protect：idCard/baseSalary/phone 加密为 {__enc}，普通字段保留', () => {
    const out = protectAuditValue({
      employeeId: 'e1',
      idCard: '110101199003078812',
      phone: '13800138000',
      baseSalary: 15000,
      description: '正常文本',
    }) as Record<string, unknown>;
    expect(out.employeeId).toBe('e1');
    expect(out.description).toBe('正常文本');
    expect(typeof (out.idCard as { __enc: string }).__enc).toBe('string');
    expect(typeof (out.baseSalary as { __enc: string }).__enc).toBe('string');
    expect((out.phone as { __enc: string }).__enc).toBeTruthy();
  });

  it('protect：已打码值（含 *）不再重复加密；嵌套数组递归处理', () => {
    const out = protectAuditValue({
      list: [{ idCard: '110101********0023' }, { note: 'x' }],
    }) as Record<string, unknown>;
    expect((out.list as Array<{ idCard: string }>)[0].idCard).toBe('110101********0023');
    expect((out.list as Array<{ note: string }>)[1].note).toBe('x');
  });

  it('mask：加密值解密后打码，绝不回传明文', () => {
    const enc = protectAuditValue({ idCard: '110101199003078812', baseSalary: 15080 });
    const masked = maskAuditValue(enc) as Record<string, string>;
    expect(masked.idCard).toBe('110101********8812');
    expect(masked.idCard).not.toContain('19900307');
    expect(masked.baseSalary).toBe('15000-15099'); // 整百区间
  });

  it('reveal：after.baseSalary 与 idCard 还原明文', () => {
    const enc = protectAuditValue({ baseSalary: 15000, idCard: '110101199003078812' });
    const log = { oldValue: null, newValue: enc };
    expect(revealAuditValue(log, 'after.baseSalary')).toBe('15000');
    expect(revealAuditValue(log, 'newValue.idCard')).toBe('110101199003078812');
    expect(revealAuditValue(log, 'baseSalary')).toBe('15000');
  });

  it('reveal：字段不存在或非敏感 → 抛 40110', () => {
    const log = { oldValue: null, newValue: { name: '张三' } };
    expect(() => revealAuditValue(log, 'after.nonexistent')).toThrowError(
      expect.objectContaining({ code: 40110 }),
    );
    expect(() => revealAuditValue(log, 'after.name')).toThrowError(
      expect.objectContaining({ code: 40110 }),
    );
  });
});
