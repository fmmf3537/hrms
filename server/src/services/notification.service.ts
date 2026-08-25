// M0.5-2: 通知 service | HRMS
// 职责：模板查找 + 渲染 + 写 log + 投递到 BullMQ 队列
// 模板渲染：Handlebars
// 失败重试：BullMQ 自动 3 次指数退避（详见 jobs/notification.queue.ts）

import type { Prisma } from '@prisma/client';
import Handlebars from 'handlebars';

import { getNotificationQueue } from '../jobs/notification.queue';
import type { NotificationChannel } from '../jobs/notification.queue';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

export type { NotificationChannel } from '../jobs/notification.queue';

// ============== 输入类型 ==============

export interface SendNotificationInput {
  templateKey: string; // 模板 key（含 channel 后缀由调用方选择具体模板）
  userId: string;
  data: Record<string, unknown>;
  // 高级用法：跳过模板直接发送内容（不走模板库）
  bypassTemplate?: {
    channel: NotificationChannel;
    subject?: string;
    content: string;
  };
}

export interface SendNotificationResult {
  logId: string;
  channel: NotificationChannel;
  status: 'pending';
}

// ============== 工具：渲染模板 ==============

function renderTemplate(
  template: string,
  data: Record<string, unknown>,
): string {
  try {
    const compiled = Handlebars.compile(template);
    return compiled(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new AppError(`模板渲染失败: ${msg}`, 500, 30102);
  }
}

// ============== 核心：发送通知 ==============

/**
 * 发送一条通知
 * 流程：
 *   1. 查模板（如果传了 bypassTemplate 则跳过）
 *   2. 渲染 subject + content
 *   3. 写 notification_log (status=pending)
 *   4. 投递到 BullMQ 队列（异步发送）
 *   5. 返回 logId（前端可轮询 / WebSocket 查状态）
 */
export async function sendNotification(
  input: SendNotificationInput,
): Promise<SendNotificationResult> {
  // 1. 解析模板
  let template: Prisma.NotificationTemplateGetPayload<Record<string, never>> | null = null;
  let channel: NotificationChannel;
  let subject: string | null;
  let content: string;

  if (input.bypassTemplate) {
    // 跳过模板库
    channel = input.bypassTemplate.channel;
    subject = input.bypassTemplate.subject ?? null;
    content = input.bypassTemplate.content;
  } else {
    // 查模板（按 key + channel，channel 由用户传或默认 in_app）
    // 注：模板的 (key, channel) 唯一，需要指定 channel
    // 这里我们约定：templateKey 可以是 "key" 或 "key:channel"，否则默认 in_app
    let key = input.templateKey;
    let explicitChannel: NotificationChannel | null = null;
    if (key.includes(':')) {
      const [k, c] = key.split(':');
      key = k!;
      explicitChannel = c as NotificationChannel;
    }
    channel = explicitChannel ?? 'in_app';

    template = await prisma.notificationTemplate.findFirst({
      where: {
        key,
        channel,
        enabled: true,
        deletedAt: null,
      },
    });

    if (!template) {
      throw new AppError(
        `通知模板不存在或已停用: ${input.templateKey} (channel=${channel})`,
        404,
        30101,
      );
    }

    subject = template.subject ? renderTemplate(template.subject, input.data) : null;
    content = renderTemplate(template.contentTemplate, input.data);
  }

  // 2. 写 log（status=pending）
  const log = await prisma.notificationLog.create({
    data: {
      templateId: template?.id ?? null,
      templateKey: input.bypassTemplate ? null : input.templateKey,
      userId: input.userId,
      channel,
      status: 'pending',
      subject,
      content,
      data: input.data as unknown as Prisma.InputJsonValue,
    },
  });

  // 3. 投递到 BullMQ 队列
  const queue = await getNotificationQueue();
  await queue.add(
    'send',
    {
      logId: log.id,
      channel,
      userId: input.userId,
      subject,
      content,
      data: input.data as Prisma.JsonValue,
    },
    { jobId: log.id }, // 用 logId 作为 jobId，便于排查
  );

  return {
    logId: log.id,
    channel,
    status: 'pending',
  };
}

/**
 * 批量发送（同一模板，不同用户）
 * 用于审批超时升级、合同到期批量通知等场景
 */
export async function sendNotificationBatch(
  inputs: SendNotificationInput[],
): Promise<SendNotificationResult[]> {
  // 串行执行（保证 log 创建顺序与 BullMQ 任务提交顺序一致，便于排查）
  // eslint-disable-next-line no-restricted-syntax, no-await-in-loop
  const results: SendNotificationResult[] = await inputs.reduce<Promise<SendNotificationResult[]>>(
    async (acc, input) => {
      const arr = await acc;
      arr.push(await sendNotification(input));
      return arr;
    },
    Promise.resolve([]),
  );
  return results;
}

// ============== 用户侧 API ==============

/**
 * 标记已读
 */
export async function markAsRead(logId: string, userId: string): Promise<void> {
  // 先查存在性 + 校验所有权
  const log = await prisma.notificationLog.findUnique({
    where: { id: logId },
    select: { userId: true, readAt: true },
  });
  if (!log) {
    throw new AppError('通知不存在', 404, 30101);
  }
  if (log.userId !== userId) {
    throw new AppError('无权操作此通知', 403, 30120);
  }
  if (log.readAt) {
    // 已读，幂等
    return;
  }
  await prisma.notificationLog.update({
    where: { id: logId },
    data: { readAt: new Date() },
  });
}

/**
 * 全部已读
 */
export async function markAllAsRead(userId: string): Promise<{ count: number }> {
  const result = await prisma.notificationLog.updateMany({
    where: {
      userId,
      readAt: null,
      status: 'sent', // 只标记"已成功发送"的为已读，pending/failed 不标记
    },
    data: { readAt: new Date() },
  });
  return { count: result.count };
}

/**
 * 我的通知列表
 */
export interface ListMyOptions {
  userId: string;
  unreadOnly?: boolean;
  channel?: NotificationChannel;
  page?: number;
  pageSize?: number;
}

export async function listMyNotifications(options: ListMyOptions): Promise<{
  data: Array<{
    id: string;
    templateKey: string | null;
    channel: string;
    subject: string | null;
    content: string;
    status: string;
    sentAt: Date | null;
    readAt: Date | null;
    createdAt: Date;
  }>;
  total: number;
}> {
  const {
    userId, unreadOnly = false, channel, page = 1, pageSize = 20,
  } = options;

  const where: Prisma.NotificationLogWhereInput = {
    userId,
    ...(unreadOnly ? { readAt: null } : {}),
    ...(channel ? { channel } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notificationLog.count({ where }),
  ]);

  return {
    data: data.map((d) => ({
      id: d.id,
      templateKey: d.templateKey,
      channel: d.channel,
      subject: d.subject,
      content: d.content,
      status: d.status,
      sentAt: d.sentAt,
      readAt: d.readAt,
      createdAt: d.createdAt,
    })),
    total,
  };
}

/**
 * 未读数
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notificationLog.count({
    where: {
      userId,
      readAt: null,
      status: 'sent', // 未发送成功的算"未知"，不计入未读
    },
  });
}

// ============== 模板 CRUD（admin/HR 端）==============

export interface CreateTemplateInput {
  key: string;
  name: string;
  channel: NotificationChannel;
  subject?: string;
  contentTemplate: string;
  variables?: Prisma.InputJsonValue;
  description?: string;
}

export async function createTemplate(
  input: CreateTemplateInput,
): Promise<{ id: string }> {
  // 校验模板语法
  try {
    Handlebars.compile(input.contentTemplate);
    if (input.subject) {
      Handlebars.compile(input.subject);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new AppError(`模板语法错误: ${msg}`, 400, 30101);
  }

  const created = await prisma.notificationTemplate.create({
    data: {
      key: input.key,
      name: input.name,
      channel: input.channel,
      subject: input.subject ?? null,
      contentTemplate: input.contentTemplate,
      variables: input.variables ?? undefined,
      description: input.description ?? null,
      enabled: true,
    },
  });
  return { id: created.id };
}

export async function listTemplates(channel?: NotificationChannel): Promise<Array<{
  id: string;
  key: string;
  name: string;
  channel: string;
  enabled: boolean;
}>> {
  const templates = await prisma.notificationTemplate.findMany({
    where: {
      deletedAt: null,
      ...(channel ? { channel } : {}),
    },
    orderBy: [{ key: 'asc' }, { channel: 'asc' }],
    select: {
      id: true,
      key: true,
      name: true,
      channel: true,
      enabled: true,
    },
  });
  return templates;
}

export async function updateTemplate(
  id: string,
  input: Partial<Omit<CreateTemplateInput, 'key'>>,
): Promise<{ id: string }> {
  // 校验新模板语法
  if (input.contentTemplate) {
    try {
      Handlebars.compile(input.contentTemplate);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new AppError(`模板语法错误: ${msg}`, 400, 30101);
    }
  }
  if (input.subject) {
    try {
      Handlebars.compile(input.subject);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new AppError(`主题模板语法错误: ${msg}`, 400, 30101);
    }
  }

  const updated = await prisma.notificationTemplate.update({
    where: { id },
    data: {
      name: input.name,
      subject: input.subject,
      contentTemplate: input.contentTemplate,
      variables: input.variables ?? undefined,
      description: input.description,
    },
  });
  return { id: updated.id };
}

export async function deleteTemplate(id: string): Promise<void> {
  // 软删除
  await prisma.notificationTemplate.update({
    where: { id },
    data: { deletedAt: new Date(), enabled: false },
  });
}
