// M5-1: 运维健康检查（公开端点，Docker healthcheck 用；不写审计、不抛业务错误码）| HRMS

import {
  Router, type Request, type Response, type Router as RouterType,
} from 'express';

import prisma from '../lib/prisma';
import { redis } from '../lib/redis';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  uptime: number;
  db: 'ok' | 'error';
  redis: 'ok' | 'error';
}

/**
 * 探测 PostgreSQL + Redis 并汇总健康状态（V1.2 §四.1 M0-09 / §6.1）
 * @returns HealthCheckResult status=ok 仅当 db 与 redis 均为 ok
 * 注：不抛 AppError；不写 audit；不读 configService
 */
export async function getHealthCheck(): Promise<HealthCheckResult> {
  let db: 'ok' | 'error' = 'error';
  let redisStatus: 'ok' | 'error' = 'error';

  try {
    await prisma.$queryRaw`SELECT 1`;
    db = 'ok';
  } catch {
    db = 'error';
  }

  try {
    const pong = await redis.ping();
    if (pong === 'PONG' || pong === 'pong') {
      redisStatus = 'ok';
    }
  } catch {
    redisStatus = 'error';
  }

  const allOk = db === 'ok' && redisStatus === 'ok';
  return {
    status: allOk ? 'ok' : 'error',
    uptime: process.uptime(),
    db,
    redis: redisStatus,
  };
}

/**
 * GET /api/health 处理函数
 * 200 + { status, uptime, db, redis }；任一依赖失败则 500
 */
export async function handleHealth(_req: Request, res: Response): Promise<void> {
  const result = await getHealthCheck();
  const code = result.status === 'ok' ? 200 : 500;
  res.status(code).json(result);
}

const healthRouter: RouterType = Router();
healthRouter.get('/', handleHealth);
healthRouter.get('/health', handleHealth);

export default healthRouter;
