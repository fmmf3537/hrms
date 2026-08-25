// M0.5-2: 通知 service 单元测试 | HRMS
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
   @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await */

import Handlebars from 'handlebars';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

import * as notificationService from './notification.service';

// ============== Mock 工厂（hoisted） ==============

const mocks = vi.hoisted(() => {
  // prisma 链式 stub
  const templateFindFirst = vi.fn();
  const templateCreate = vi.fn();
  const templateFindMany = vi.fn();
  const templateUpdate = vi.fn();
  const logCreate = vi.fn();
  const logFindUnique = vi.fn();
  const logFindMany = vi.fn();
  const logCount = vi.fn();
  const logUpdate = vi.fn();
  const logUpdateMany = vi.fn();

  // BullMQ Queue mock
  const queueAdd = vi.fn();

  return {
    templateFindFirst,
    templateCreate,
    templateFindMany,
    templateUpdate,
    logCreate,
    logFindUnique,
    logFindMany,
    logCount,
    logUpdate,
    logUpdateMany,
    queueAdd,
  };
});

vi.mock('../lib/prisma', () => ({
  default: {
    notificationTemplate: {
      findFirst: mocks.templateFindFirst,
      create: mocks.templateCreate,
      findMany: mocks.templateFindMany,
      update: mocks.templateUpdate,
    },
    notificationLog: {
      create: mocks.logCreate,
      findUnique: mocks.logFindUnique,
      findMany: mocks.logFindMany,
      count: mocks.logCount,
      update: mocks.logUpdate,
      updateMany: mocks.logUpdateMany,
    },
  },
}));

vi.mock('../jobs/notification.queue', () => ({
  getNotificationQueue: vi.fn().mockResolvedValue({
    add: mocks.queueAdd.mockResolvedValue({ id: 'job-1' }),
  }),
  NOTIFICATION_QUEUE_NAME: 'notifications',
  NOTIFICATION_MAX_RETRIES: 3,
  NOTIFICATION_BACKOFF_MS: 2000,
}));

const makeTemplate = (overrides: Record<string, unknown> = {}) => ({
  id: 'tpl-1',
  key: 'contract_expiring',
  name: '合同到期',
  channel: 'in_app',
  subject: '合同 {{days_remaining}} 天后到期',
  contentTemplate: '您好 {{employee_name}}：您的合同将在 {{days_remaining}} 天后到期。',
  variables: null,
  enabled: true,
  description: null,
  createdBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

const makeLog = (overrides: Record<string, unknown> = {}) => ({
  id: 'log-1',
  templateId: 'tpl-1',
  templateKey: 'contract_expiring',
  userId: 'user-1',
  channel: 'in_app',
  status: 'pending',
  subject: '合同 5 天后到期',
  content: '您好 张三：您的合同将在 5 天后到期。',
  data: { employee_name: '张三', days_remaining: 5 },
  retryCount: 0,
  lastError: null,
  sentAt: null,
  readAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queueAdd.mockResolvedValue({ id: 'job-1' });
});

// ============== sendNotification ==============

describe('sendNotification - 模板发送', () => {
  it('合法模板 + 数据 → 渲染 + 写 log(status=pending) + 投递队列', async () => {
    mocks.templateFindFirst.mockResolvedValueOnce(makeTemplate());
    mocks.logCreate.mockImplementationOnce(({ data }: any) => Promise.resolve({ id: 'log-new', ...data }));

    const result = await notificationService.sendNotification({
      templateKey: 'contract_expiring',
      userId: 'user-1',
      data: { employee_name: '张三', days_remaining: 5 },
    });

    expect(result.logId).toBe('log-new');
    expect(result.channel).toBe('in_app');
    expect(result.status).toBe('pending');
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      'send',
      expect.objectContaining({
        logId: 'log-new',
        channel: 'in_app',
        userId: 'user-1',
        content: '您好 张三：您的合同将在 5 天后到期。',
        subject: '合同 5 天后到期',
      }),
      { jobId: 'log-new' },
    );
  });

  it('templateKey 含 ":channel" → 按指定 channel 查模板', async () => {
    mocks.templateFindFirst.mockResolvedValueOnce(
      makeTemplate({ channel: 'email', subject: '邮件主题' }),
    );
    mocks.logCreate.mockImplementationOnce(({ data }: any) => Promise.resolve({ id: 'log-2', ...data }));

    await notificationService.sendNotification({
      templateKey: 'contract_expiring:email',
      userId: 'user-1',
      data: { employee_name: '张三' },
    });

    expect(mocks.templateFindFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        key: 'contract_expiring',
        channel: 'email',
        enabled: true,
      }),
    });
  });

  it('模板不存在 → 抛 30101 (404)', async () => {
    mocks.templateFindFirst.mockResolvedValueOnce(null);

    await expect(
      notificationService.sendNotification({
        templateKey: 'nonexistent',
        userId: 'user-1',
        data: {},
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 30101 });
  });

  it('模板语法错（无效 Handlebars）→ 抛 30102 (500)', async () => {
    // 用 spy 强制 render 抛错
    const spy = vi
      .spyOn(Handlebars, 'compile')
      .mockImplementation(() => {
        throw new Error('Mocked Handlebars render error');
      });

    try {
      mocks.templateFindFirst.mockResolvedValueOnce(makeTemplate());

      await expect(
        notificationService.sendNotification({
          templateKey: 'contract_expiring',
          userId: 'user-1',
          data: {},
        }),
      ).rejects.toMatchObject({ statusCode: 500, code: 30102 });
    } finally {
      spy.mockRestore();
    }
  });

  it('bypassTemplate 跳过模板库直接发', async () => {
    mocks.logCreate.mockImplementationOnce(({ data }: any) => Promise.resolve({ id: 'log-3', ...data }));

    const result = await notificationService.sendNotification({
      templateKey: '',
      userId: 'user-1',
      data: {},
      bypassTemplate: {
        channel: 'sms',
        content: '验证码 123456',
      },
    });

    expect(result.channel).toBe('sms');
    expect(mocks.templateFindFirst).not.toHaveBeenCalled();
  });
});

// ============== 标记已读 ==============

describe('markAsRead - 标记已读', () => {
  it('当前用户 + 未读 → 写 readAt', async () => {
    mocks.logFindUnique.mockResolvedValueOnce(makeLog({ readAt: null }));

    await notificationService.markAsRead('log-1', 'user-1');

    expect(mocks.logUpdate).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: { readAt: expect.any(Date) },
    });
  });

  it('已读 → 幂等（不重复写）', async () => {
    mocks.logFindUnique.mockResolvedValueOnce(
      makeLog({ readAt: new Date() }),
    );

    await notificationService.markAsRead('log-1', 'user-1');

    expect(mocks.logUpdate).not.toHaveBeenCalled();
  });

  it('非本人 → 抛 30120 (403)', async () => {
    mocks.logFindUnique.mockResolvedValueOnce(
      makeLog({ userId: 'OTHER-USER' }),
    );

    await expect(
      notificationService.markAsRead('log-1', 'user-1'),
    ).rejects.toMatchObject({ statusCode: 403, code: 30120 });
  });

  it('logId 不存在 → 抛 30101 (404)', async () => {
    mocks.logFindUnique.mockResolvedValueOnce(null);

    await expect(
      notificationService.markAsRead('nonexistent', 'user-1'),
    ).rejects.toMatchObject({ statusCode: 404, code: 30101 });
  });
});

// ============== 全部已读 ==============

describe('markAllAsRead - 全部已读', () => {
  it('返回更新条数（只更新 sent 状态）', async () => {
    mocks.logUpdateMany.mockResolvedValueOnce({ count: 5 });

    const result = await notificationService.markAllAsRead('user-1');

    expect(result.count).toBe(5);
    expect(mocks.logUpdateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'user-1',
        readAt: null,
        status: 'sent',
      }),
      data: { readAt: expect.any(Date) },
    });
  });
});

// ============== 列表 ==============

describe('listMyNotifications - 我的通知列表', () => {
  it('基本查询：含分页 + 返回 total', async () => {
    const items = [makeLog(), makeLog({ id: 'log-2' })];
    mocks.logFindMany.mockResolvedValueOnce(items);
    mocks.logCount.mockResolvedValueOnce(2);

    const result = await notificationService.listMyNotifications({
      userId: 'user-1',
      page: 1,
      pageSize: 20,
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(mocks.logFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
  });

  it('unreadOnly=true → where 含 readAt: null', async () => {
    mocks.logFindMany.mockResolvedValueOnce([]);
    mocks.logCount.mockResolvedValueOnce(0);

    await notificationService.listMyNotifications({
      userId: 'user-1',
      unreadOnly: true,
    });

    expect(mocks.logFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ readAt: null }) }),
    );
  });

  it('channel=sms → where 含 channel', async () => {
    mocks.logFindMany.mockResolvedValueOnce([]);
    mocks.logCount.mockResolvedValueOnce(0);

    await notificationService.listMyNotifications({
      userId: 'user-1',
      channel: 'sms',
    });

    expect(mocks.logFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ channel: 'sms' }) }),
    );
  });
});

// ============== 未读数 ==============

describe('getUnreadCount - 未读数', () => {
  it('返回 count，只计 sent 状态', async () => {
    mocks.logCount.mockResolvedValueOnce(7);

    const count = await notificationService.getUnreadCount('user-1');

    expect(count).toBe(7);
    expect(mocks.logCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'user-1',
        readAt: null,
        status: 'sent',
      }),
    });
  });
});

// ============== 模板 CRUD ==============

describe('模板 CRUD', () => {
  it('createTemplate：合法 Handlebars 模板 → 写入数据库', async () => {
    mocks.templateCreate.mockImplementationOnce(({ data }: any) => Promise.resolve({ id: 'tpl-new', ...data }));

    const result = await notificationService.createTemplate({
      key: 'new_template',
      name: '新模板',
      channel: 'in_app',
      contentTemplate: 'Hello {{name}}',
    });

    expect(result.id).toBe('tpl-new');
    expect(mocks.templateCreate).toHaveBeenCalled();
  });

  it('createTemplate：模板语法错 → 抛 30101 (400)', async () => {
    // 用 vi.spyOn 强制 Handlebars.compile 在本测试抛错
    const spy = vi
      .spyOn(Handlebars, 'compile')
      .mockImplementation(() => {
        throw new Error('Mocked Handlebars syntax error');
      });

    try {
      await expect(
        notificationService.createTemplate({
          key: 'bad',
          name: 'X',
          channel: 'in_app',
          contentTemplate: '任何内容',
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: 30101 });
    } finally {
      spy.mockRestore();
    }
  });

  it('listTemplates：按 channel 过滤', async () => {
    mocks.templateFindMany.mockResolvedValueOnce([
      {
        id: 'tpl-1', key: 'k', name: 'n', channel: 'email', enabled: true,
      },
    ]);

    const result = await notificationService.listTemplates('email');

    expect(result).toHaveLength(1);
    expect(mocks.templateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ channel: 'email' }) }),
    );
  });

  it('updateTemplate：只更新传入字段', async () => {
    mocks.templateUpdate.mockResolvedValueOnce({ id: 'tpl-1' });

    const result = await notificationService.updateTemplate('tpl-1', {
      name: '新名字',
    });

    expect(result.id).toBe('tpl-1');
    expect(mocks.templateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tpl-1' },
        data: expect.objectContaining({ name: '新名字' }),
      }),
    );
  });

  it('deleteTemplate：软删除（deletedAt + enabled=false）', async () => {
    mocks.templateUpdate.mockResolvedValueOnce({});

    await notificationService.deleteTemplate('tpl-1');

    expect(mocks.templateUpdate).toHaveBeenCalledWith({
      where: { id: 'tpl-1' },
      data: expect.objectContaining({
        deletedAt: expect.any(Date),
        enabled: false,
      }),
    });
  });
});

// ============== 批量发送 ==============

describe('sendNotificationBatch - 批量发送', () => {
  it('3 个用户 → 3 个 log + 3 个 job', async () => {
    mocks.templateFindFirst.mockResolvedValue(makeTemplate());
    mocks.logCreate.mockImplementation(({ data }: any) => Promise.resolve({ id: `log-${data.userId}`, ...data }));

    const results = await notificationService.sendNotificationBatch([
      { templateKey: 'contract_expiring', userId: 'u1', data: { employee_name: 'A' } },
      { templateKey: 'contract_expiring', userId: 'u2', data: { employee_name: 'B' } },
      { templateKey: 'contract_expiring', userId: 'u3', data: { employee_name: 'C' } },
    ]);

    expect(results).toHaveLength(3);
    expect(mocks.queueAdd).toHaveBeenCalledTimes(3);
  });
});
