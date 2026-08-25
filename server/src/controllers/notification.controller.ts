// M0.5-2: 通知 controller | HRMS
import type { Request, Response } from 'express';

import { asyncHandler } from '../middleware/errorHandler';
import * as notificationService from '../services/notification.service';

// ============== 用户侧 ==============

export const listMy = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req.user!);
  const unreadOnly = req.query.unreadOnly === 'true';
  const channel = req.query.channel as 'in_app' | 'email' | 'sms' | undefined;
  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;

  const result = await notificationService.listMyNotifications({
    userId,
    unreadOnly,
    channel,
    page,
    pageSize,
  });
  res.json({
    success: true, data: result.data, total: result.total, page, pageSize,
  });
});

export const unreadCount = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req.user!);
  const count = await notificationService.getUnreadCount(userId);
  res.json({ success: true, data: { count } });
});

export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = (req.user!);
  await notificationService.markAsRead(id, userId);
  res.json({ success: true });
});

export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req.user!);
  const result = await notificationService.markAllAsRead(userId);
  res.json({ success: true, data: result });
});

// ============== 主动发送（admin/HR） ==============

export const send = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as {
    templateKey?: string;
    userId?: string;
    userIds?: string[];
    channel?: 'in_app' | 'email' | 'sms';
    subject?: string;
    content?: string;
    data?: Record<string, unknown>;
  };

  // 校验：要么用模板，要么 bypass
  if (!body.templateKey && !body.content) {
    res.status(400).json({
      success: false,
      error: '必须传 templateKey 或 content',
      code: 30101,
    });
    return;
  }
  if (body.templateKey && body.content) {
    res.status(400).json({
      success: false,
      error: 'templateKey 和 content 互斥',
      code: 30101,
    });
    return;
  }

  // 收集 userIds
  const userIds: string[] = [];
  if (body.userId) userIds.push(body.userId);
  if (body.userIds) userIds.push(...body.userIds);
  if (userIds.length === 0) {
    res.status(400).json({
      success: false,
      error: '必须传 userId 或 userIds',
      code: 30101,
    });
    return;
  }

  // 批量发送
  const inputs = userIds.map((uid) => {
    if (body.templateKey) {
      return {
        templateKey: body.templateKey,
        userId: uid,
        data: body.data ?? {},
      };
    }
    return {
      templateKey: '',
      userId: uid,
      data: body.data ?? {},
      bypassTemplate: {
        channel: body.channel ?? 'in_app',
        subject: body.subject,
        content: body.content!,
      },
    };
  });

  const results = await notificationService.sendNotificationBatch(inputs);
  res.status(202).json({ success: true, data: results });
});

// ============== 模板管理（admin） ==============

export const listTemplates = asyncHandler(async (req: Request, res: Response) => {
  const channel = req.query.channel as 'in_app' | 'email' | 'sms' | undefined;
  const templates = await notificationService.listTemplates(channel);
  res.json({ success: true, data: templates });
});

export const createTemplate = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as {
    key: string;
    name: string;
    channel: 'in_app' | 'email' | 'sms';
    subject?: string;
    contentTemplate: string;
    variables?: Record<string, unknown>;
    description?: string;
  };
  const result = await notificationService.createTemplate({
    key: body.key,
    name: body.name,
    channel: body.channel,
    subject: body.subject,
    contentTemplate: body.contentTemplate,
    variables: body.variables as never,
    description: body.description,
  });
  res.status(201).json({ success: true, data: result });
});

export const updateTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as {
    name?: string;
    subject?: string;
    contentTemplate?: string;
    variables?: Record<string, unknown>;
    description?: string;
  };
  const result = await notificationService.updateTemplate(id, {
    name: body.name,
    subject: body.subject,
    contentTemplate: body.contentTemplate,
    variables: body.variables as never,
    description: body.description,
  });
  res.json({ success: true, data: result });
});

export const deleteTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  await notificationService.deleteTemplate(id);
  res.json({ success: true });
});
