// M0.5-4: 集成 service 单元测试 | HRMS
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
   @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

import * as integrationService from './integration.service';

// ============== Mock ==============

const mocks = vi.hoisted(() => {
  const integFindUnique = vi.fn();
  const integFindMany = vi.fn();
  const integCreate = vi.fn();
  const integUpdate = vi.fn();
  const syncLogCreate = vi.fn();
  const syncLogFindMany = vi.fn();
  const syncLogCount = vi.fn();
  return {
    integFindUnique,
    integFindMany,
    integCreate,
    integUpdate,
    syncLogCreate,
    syncLogFindMany,
    syncLogCount,
  };
});

vi.mock('../lib/prisma', () => ({
  default: {
    integration: {
      findUnique: mocks.integFindUnique,
      findMany: mocks.integFindMany,
      create: mocks.integCreate,
      update: mocks.integUpdate,
    },
    integrationSyncLog: {
      create: mocks.syncLogCreate,
      findMany: mocks.syncLogFindMany,
      count: mocks.syncLogCount,
    },
  },
}));

// Mock adapter interface
const mockAdapter = {
  code: 'sms',
  type: 'http_api' as const,
  send: vi.fn().mockResolvedValue({
    success: true, recordCount: 1, data: { messageId: 'msg-1' }, duration: 10,
  }),
  testConnection: vi.fn().mockResolvedValue({ success: true, latency: 5 }),
  sync: vi.fn().mockResolvedValue({ success: true, recordCount: 0 }),
};

vi.mock('../integrations/adapter.interface', async () => {
  const actual = await vi.importActual<typeof import('../integrations/adapter.interface')>('../integrations/adapter.interface');
  return {
    ...actual,
    getAdapter: vi.fn(() => mockAdapter),
  };
});

vi.mock('../integrations/adapters/register', () => ({
  registerAllAdapters: vi.fn(),
}));

const makeIntegration = (overrides: Record<string, unknown> = {}) => ({
  id: 'integ-1',
  code: 'sms',
  name: '短信',
  type: 'http_api',
  config: {
    provider: 'mock', accessKey: 'k', accessSecret: 's', signName: 'n',
  },
  enabled: true,
  description: null,
  lastSyncAt: null,
  createdBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  // 重新挂载 adapter mock
  mockAdapter.send.mockResolvedValue({
    success: true, recordCount: 1, data: { messageId: 'msg-1' }, duration: 10,
  });
  mockAdapter.testConnection.mockResolvedValue({ success: true, latency: 5 });
});

describe('createIntegration - 创建集成', () => {
  it('合法配置 → 创建成功', async () => {
    mocks.integFindUnique.mockResolvedValueOnce(null);
    mocks.integCreate.mockImplementationOnce(({ data }: any) => Promise.resolve({ id: 'new-integ', ...data }));

    const result = await integrationService.createIntegration({
      code: 'new_one',
      name: '新集成',
      type: 'http_api',
      config: { foo: 'bar' },
    });

    expect(result.id).toBe('new-integ');
    expect(mocks.integCreate).toHaveBeenCalled();
  });

  it('code 重复 → 抛 50101 (409)', async () => {
    mocks.integFindUnique.mockResolvedValueOnce(makeIntegration());

    await expect(
      integrationService.createIntegration({
        code: 'sms',
        name: 'X',
        type: 'http_api',
        config: {},
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 50101 });
  });
});

describe('listIntegrations - 列出集成', () => {
  it('基本列表', async () => {
    mocks.integFindMany.mockResolvedValueOnce([
      makeIntegration(),
      makeIntegration({ id: 'integ-2', code: 'llm' }),
    ]);

    const result = await integrationService.listIntegrations();

    expect(result).toHaveLength(2);
    expect(mocks.integFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
  });
});

describe('getIntegrationByCode - 按 code 查', () => {
  it('找到 → 返回配置（含 config 字段）', async () => {
    mocks.integFindUnique.mockResolvedValueOnce(makeIntegration());

    const result = await integrationService.getIntegrationByCode('sms');

    expect(result.code).toBe('sms');
    expect(result.config).toEqual({
      provider: 'mock', accessKey: 'k', accessSecret: 's', signName: 'n',
    });
  });

  it('不存在 → 抛 50101 (404)', async () => {
    mocks.integFindUnique.mockResolvedValueOnce(null);

    await expect(
      integrationService.getIntegrationByCode('nonexistent'),
    ).rejects.toMatchObject({ statusCode: 404, code: 50101 });
  });

  it('软删除的（deletedAt != null）→ 抛 50101', async () => {
    mocks.integFindUnique.mockResolvedValueOnce(makeIntegration({ deletedAt: new Date() }));

    await expect(
      integrationService.getIntegrationByCode('sms'),
    ).rejects.toMatchObject({ statusCode: 404, code: 50101 });
  });
});

describe('send - 发送', () => {
  it('集成存在 + 启用 + adapter 注册 → 调 send + 写 success 日志 + 更新 lastSyncAt', async () => {
    mocks.integFindUnique.mockResolvedValueOnce(makeIntegration());
    mocks.syncLogCreate.mockResolvedValueOnce({});
    mocks.integUpdate.mockResolvedValueOnce({});

    const result = await integrationService.send({ code: 'sms', payload: { to: '13800138000', content: 'hi' } });

    expect(result.success).toBe(true);
    expect(mockAdapter.send).toHaveBeenCalledWith(
      { to: '13800138000', content: 'hi' },
      expect.objectContaining({ provider: 'mock' }),
    );
    expect(mocks.syncLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'success',
        operation: 'send',
        recordCount: 1,
        duration: 10,
      }),
    });
    expect(mocks.integUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastSyncAt: expect.any(Date) }) }),
    );
  });

  it('集成已禁用 → 抛 50100 (400)', async () => {
    mocks.integFindUnique.mockResolvedValueOnce(makeIntegration({ enabled: false }));

    await expect(
      integrationService.send({ code: 'sms', payload: {} }),
    ).rejects.toMatchObject({ statusCode: 400, code: 50100 });
  });

  it('集成不存在 → 抛 50101 (404)', async () => {
    mocks.integFindUnique.mockResolvedValueOnce(null);

    await expect(
      integrationService.send({ code: 'nonexistent', payload: {} }),
    ).rejects.toMatchObject({ statusCode: 404, code: 50101 });
  });

  it('adapter 未注册 → 抛 50120 (501)', async () => {
    // 临时把 getAdapter mock 返回 null
    const { getAdapter } = await import('../integrations/adapter.interface');
    vi.mocked(getAdapter).mockReturnValueOnce(null);

    mocks.integFindUnique.mockResolvedValueOnce(makeIntegration());

    await expect(
      integrationService.send({ code: 'sms', payload: {} }),
    ).rejects.toMatchObject({ statusCode: 501, code: 50120 });
  });

  it('adapter 返回失败 → 写 failed 日志', async () => {
    mockAdapter.send.mockResolvedValueOnce({
      success: false,
      error: '外部服务超时',
      duration: 5000,
    });
    mocks.integFindUnique.mockResolvedValueOnce(makeIntegration());
    mocks.syncLogCreate.mockResolvedValueOnce({});

    const result = await integrationService.send({ code: 'sms', payload: {} });

    expect(result.success).toBe(false);
    expect(mocks.syncLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'failed',
        errorMessage: '外部服务超时',
      }),
    });
  });
});

describe('sync + testConnection', () => {
  it('sync：调 adapter.sync + 写日志', async () => {
    mockAdapter.sync.mockResolvedValueOnce({ success: true, recordCount: 5 });
    mocks.integFindUnique.mockResolvedValueOnce(makeIntegration());
    mocks.syncLogCreate.mockResolvedValueOnce({});
    mocks.integUpdate.mockResolvedValueOnce({});

    const result = await integrationService.sync({ code: 'sms' });

    expect(result.recordCount).toBe(5);
    expect(mocks.syncLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ operation: 'sync' }),
    });
  });

  it('testConnection：调 adapter.testConnection + 写日志（无 recordCount）', async () => {
    mockAdapter.testConnection.mockResolvedValueOnce({ success: true, latency: 12 });
    mocks.integFindUnique.mockResolvedValueOnce(makeIntegration());
    mocks.syncLogCreate.mockResolvedValueOnce({});
    mocks.integUpdate.mockResolvedValueOnce({});

    const result = await integrationService.testConnection({ code: 'sms' });

    expect(result.success).toBe(true);
    expect(mocks.syncLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: 'test_connection',
        recordCount: 0,
        duration: 12, // latency 映射到 duration
      }),
    });
  });
});

describe('listSyncLogs - 同步日志列表', () => {
  it('基本查询：分页 + 过滤', async () => {
    const items = [
      {
        id: 'l1', integrationId: 'i1', status: 'success', operation: 'send', recordCount: 1, duration: 10, errorMessage: null, createdAt: new Date(),
      },
    ];
    mocks.syncLogFindMany.mockResolvedValueOnce(items);
    mocks.syncLogCount.mockResolvedValueOnce(1);

    const result = await integrationService.listSyncLogs({
      integrationId: 'i1',
      status: 'success',
      page: 1,
      pageSize: 20,
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(mocks.syncLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ integrationId: 'i1', status: 'success' }) }),
    );
  });
});

describe('deleteIntegration - 软删除', () => {
  it('软删除 + enabled=false', async () => {
    mocks.integUpdate.mockResolvedValueOnce({});

    await integrationService.deleteIntegration('integ-1');

    expect(mocks.integUpdate).toHaveBeenCalledWith({
      where: { id: 'integ-1' },
      data: expect.objectContaining({
        deletedAt: expect.any(Date),
        enabled: false,
      }),
    });
  });
});
