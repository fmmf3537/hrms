// M0.5-2: 通知 BullMQ 队列 + channel 适配器 | HRMS
// email/sms 走 M0.5-4 integrationService.send（mock adapter 或真实 SDK）

import type { Prisma } from '@prisma/client';
import { Queue, Worker, type Job } from 'bullmq';

import prisma from '../lib/prisma';
import { connectRedis, createBullMqRedis } from '../lib/redis';
import * as integrationService from '../services/integration.service';

// ============== 类型定义 ==============

export type NotificationChannel = 'in_app' | 'email' | 'sms';

export interface SendNotificationJobData {
  logId: string;
  channel: NotificationChannel;
  userId: string;
  subject: string | null;
  content: string;
  data?: Prisma.JsonValue;
}

// ============== 队列常量 ==============

export const NOTIFICATION_QUEUE_NAME = 'notifications';
export const NOTIFICATION_MAX_RETRIES = 3;
export const NOTIFICATION_BACKOFF_MS = 2000;

// ============== 队列 ==============

let queueInstance: Queue<SendNotificationJobData> | null = null;

/**
 * 获取通知队列（懒加载）
 */
export async function getNotificationQueue(): Promise<Queue<SendNotificationJobData>> {
  if (queueInstance) return queueInstance;
  await connectRedis();
  queueInstance = new Queue<SendNotificationJobData>(NOTIFICATION_QUEUE_NAME, {
    connection: createBullMqRedis(),
    defaultJobOptions: {
      attempts: NOTIFICATION_MAX_RETRIES,
      backoff: { type: 'exponential', delay: NOTIFICATION_BACKOFF_MS },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
  return queueInstance;
}

// ============== Channel 适配器 ==============

/**
 * 站内信：直接写库即为发送成功
 */
export async function sendViaInApp(logId: string): Promise<void> {
  await prisma.notificationLog.update({
    where: { id: logId },
    data: { status: 'sent', sentAt: new Date() },
  });
}

/**
 * 邮件：经 integration code=email
 */
export async function sendViaEmail(
  userId: string,
  subject: string,
  content: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const to = user?.email ?? `user-${userId}@local`;
  const result = await integrationService.send({
    code: 'email',
    payload: {
      to, subject, content, userId,
    },
  });
  if (!result.success) {
    throw new Error(result.error ?? '邮件发送失败');
  }
}

/**
 * 短信：经 integration code=sms
 */
export async function sendViaSms(
  userId: string,
  content: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true },
  });
  const to = user?.phone ?? '';
  const result = await integrationService.send({
    code: 'sms',
    payload: { to, content, userId },
  });
  if (!result.success) {
    throw new Error(result.error ?? '短信发送失败');
  }
}

// ============== Worker 处理函数 ==============

/**
 * 单条发送任务处理
 */
export async function processNotificationJob(job: Job<SendNotificationJobData>): Promise<void> {
  const {
    logId, channel, userId, subject, content,
  } = job.data;

  try {
    if (channel === 'in_app') {
      await sendViaInApp(logId);
    } else if (channel === 'email') {
      await sendViaEmail(userId, subject ?? '(无主题)', content);
      await prisma.notificationLog.update({
        where: { id: logId },
        data: { status: 'sent', sentAt: new Date() },
      });
    } else if (channel === 'sms') {
      await sendViaSms(userId, content);
      await prisma.notificationLog.update({
        where: { id: logId },
        data: { status: 'sent', sentAt: new Date() },
      });
    } else {
      throw new Error(`未知通知通道: ${(channel as string) || 'undefined'}`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await prisma.notificationLog.update({
      where: { id: logId },
      data: {
        retryCount: { increment: 1 },
        lastError: errorMsg,
      },
    });
    throw error;
  }
}

// ============== Worker 实例 ==============

let workerInstance: Worker<SendNotificationJobData> | null = null;

export async function startNotificationWorker(): Promise<void> {
  if (workerInstance) return;
  await connectRedis();
  workerInstance = new Worker<SendNotificationJobData>(
    NOTIFICATION_QUEUE_NAME,
    processNotificationJob,
    { connection: createBullMqRedis(), concurrency: 5 },
  );
  workerInstance.on('failed', async (job) => {
    if (job && job.attemptsMade >= NOTIFICATION_MAX_RETRIES) {
      await prisma.notificationLog.update({
        where: { id: job.data.logId },
        data: { status: 'failed' },
      });
    }
  });
  // eslint-disable-next-line no-console
  console.log(`[notification worker] started (queue: ${NOTIFICATION_QUEUE_NAME})`);
}

export async function stopNotificationWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}
