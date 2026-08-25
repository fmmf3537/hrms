// M0.5-2: 通知 BullMQ 队列 + 3 个 channel adapter | HRMS
// 设计：发送走 BullMQ 异步队列，失败重试 3 次（指数退避）
// 通道：in_app（站内信，立即入库）/ email（开发用 console.log 模拟 SMTP）/ sms（开发用 console.log 模拟 SMS SDK）

import type { Prisma } from '@prisma/client';
import { Queue, Worker, type Job } from 'bullmq';

import { env } from '../lib/env';
import prisma from '../lib/prisma';
import { connectRedis, redis } from '../lib/redis';

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
export const NOTIFICATION_BACKOFF_MS = 2000; // 指数退避基数（2s, 4s, 8s）

// ============== 队列 ==============

let queueInstance: Queue<SendNotificationJobData> | null = null;

/**
 * 获取通知队列（懒加载）
 * 注意：BullMQ 不允许同连接的 Queue 和 Worker 共享，所以创建逻辑独立
 */
export async function getNotificationQueue(): Promise<Queue<SendNotificationJobData>> {
  if (queueInstance) return queueInstance;
  await connectRedis();
  queueInstance = new Queue<SendNotificationJobData>(NOTIFICATION_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      attempts: NOTIFICATION_MAX_RETRIES,
      backoff: { type: 'exponential', delay: NOTIFICATION_BACKOFF_MS },
      removeOnComplete: { count: 1000 }, // 保留最近 1000 条成功记录用于排查
      removeOnFail: { count: 5000 }, // 保留最近 5000 条失败记录
    },
  });
  return queueInstance;
}

// ============== Channel 适配器 ==============

/**
 * 站内信：直接写库即为发送成功
 * 无外部依赖，最低成本
 */
export async function sendViaInApp(logId: string): Promise<void> {
  await prisma.notificationLog.update({
    where: { id: logId },
    data: { status: 'sent', sentAt: new Date() },
  });
}

/**
 * 邮件：开发环境用 console.log 模拟 SMTP
 * 生产环境（M0.5-4）：接 nodemailer + SMTP
 */
export async function sendViaEmail(
  userId: string,
  subject: string,
  content: string,
): Promise<void> {
  // 实际生产：const transporter = nodemailer.createTransport({...})
  // 实际生产：await transporter.sendMail({ to: user.email, subject, text: content })
  if (env.NODE_ENV === 'production') {
    // 生产环境必须接真实 SMTP（M0.5-4 实现）
    throw new Error('邮件通道在生产环境未配置（M0.5-4 实现）');
  }
  // 开发/测试：模拟发送成功（M0.5-4 接入 nodemailer 后改为真实 await）
  // eslint-disable-next-line no-console
  console.log(`[MOCK EMAIL] to user=${userId} subject=${subject}\n${content}\n`);
  return Promise.resolve();
}

/**
 * 短信：开发环境用 console.log 模拟阿里云/腾讯云 SMS SDK
 * 生产环境（M0.5-4）：接真实 SDK
 */
export async function sendViaSms(
  userId: string,
  content: string,
): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('短信通道在生产环境未配置（M0.5-4 实现）');
  }
  // 开发/测试：模拟发送成功（M0.5-4 接入 SMS SDK 后改为真实 await）
  // eslint-disable-next-line no-console
  console.log(`[MOCK SMS] to user=${userId} content=${content}\n`);
  return Promise.resolve();
}

// ============== Worker 处理函数 ==============

/**
 * 单条发送任务处理
 * 由 Worker 调用，按 channel 路由到对应 adapter
 * 失败时 BullMQ 自动重试 3 次（指数退避）
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
      // 邮件发送成功后，更新 log
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
      // channel 已被前两个分支收窄到 never（TS 类型守卫）
      throw new Error(`未知通知通道: ${(channel as string) || 'undefined'}`);
    }
  } catch (error) {
    // 写 lastError + 抛出让 BullMQ 触发重试
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

// ============== Worker 实例（启动时调用）==============

let workerInstance: Worker<SendNotificationJobData> | null = null;

export async function startNotificationWorker(): Promise<void> {
  if (workerInstance) return;
  await connectRedis();
  workerInstance = new Worker<SendNotificationJobData>(
    NOTIFICATION_QUEUE_NAME,
    processNotificationJob,
    { connection: redis, concurrency: 5 },
  );
  // 监听失败事件（重试用完后最终失败）
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
