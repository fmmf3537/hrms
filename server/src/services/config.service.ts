// M0.5-6: 配置中心 service | HRMS
// getValue / getHistory / setValue + 内存缓存（启动全量 + 5 分钟刷新）

import type { Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  category: string;
  key: string;
  value: Prisma.JsonValue;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

let cache: CacheEntry[] = [];
let cacheLoadedAt = 0;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isEffectiveAt(entry: CacheEntry, at: Date): boolean {
  const day = toDateOnly(at);
  const from = toDateOnly(entry.effectiveFrom);
  if (from > day) return false;
  if (entry.effectiveTo == null) return true;
  return toDateOnly(entry.effectiveTo) >= day;
}

/**
 * 从 DB 全量刷新内存缓存
 */
export async function refreshCache(): Promise<void> {
  const rows = await prisma.config.findMany({
    orderBy: [{ category: 'asc' }, { key: 'asc' }, { version: 'desc' }],
  });
  cache = rows.map((r) => ({
    category: r.category,
    key: r.key,
    value: r.value,
    version: r.version,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
  }));
  cacheLoadedAt = Date.now();
}

async function ensureCache(): Promise<void> {
  if (cacheLoadedAt === 0 || Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    await refreshCache();
  }
}

/**
 * 启动定时刷新（进程级，幂等）
 */
export function startCacheRefresh(): void {
  if (refreshTimer) return;
  refreshCache().catch((err) => {
    console.error('[config] 初始缓存加载失败:', err);
  });
  refreshTimer = setInterval(() => {
    refreshCache().catch((err) => {
      console.error('[config] 定时刷新失败:', err);
    });
  }, CACHE_TTL_MS);
  // 不阻止进程退出
  if (typeof refreshTimer.unref === 'function') {
    refreshTimer.unref();
  }
}

export function stopCacheRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

/**
 * 读取当前生效配置值（按 atDate 过滤 effective_from/to，取最高 version）
 */
export async function getValue(
  category: string,
  key: string,
  atDate?: Date,
): Promise<Prisma.JsonValue> {
  await ensureCache();
  const at = atDate ?? new Date();
  const matches = cache
    .filter((e) => e.category === category && e.key === key && isEffectiveAt(e, at))
    .sort((a, b) => b.version - a.version);
  if (matches.length === 0) {
    throw new AppError(`配置不存在: ${category}.${key}`, 404, 70101);
  }
  return matches[0].value;
}

/**
 * 历史版本（按 version 降序）
 */
export async function getHistory(category: string, key: string): Promise<Array<{
  id: string;
  version: number;
  value: Prisma.JsonValue;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  remark: string | null;
  createdAt: Date;
  createdBy: string | null;
}>> {
  const rows = await prisma.config.findMany({
    where: { category, key },
    orderBy: { version: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    value: r.value,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    remark: r.remark,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
  }));
}

export interface SetConfigInput {
  category: string;
  key: string;
  value: Prisma.InputJsonValue;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  remark?: string;
  createdBy?: string | null;
}

/**
 * 写入新版本：关闭同 category+key 且 effective_to=null 的旧行，再插入新 version
 */
export async function setValue(input: SetConfigInput): Promise<{ id: string; version: number }> {
  const result = await prisma.$transaction(async (tx) => {
    const latest = await tx.config.findFirst({
      where: { category: input.category, key: input.key },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    // 关闭当前生效行（effective_to = null）
    if (latest && latest.effectiveTo == null) {
      const closeTo = new Date(input.effectiveFrom);
      closeTo.setUTCDate(closeTo.getUTCDate() - 1);
      await tx.config.update({
        where: { id: latest.id },
        data: { effectiveTo: closeTo },
      });
    }

    const created = await tx.config.create({
      data: {
        category: input.category,
        key: input.key,
        value: input.value,
        version: nextVersion,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        remark: input.remark ?? null,
        createdBy: input.createdBy ?? null,
      },
    });
    return created;
  });

  await refreshCache();

  auditService.auditLog({
    userId: input.createdBy ?? null,
    actorType: input.createdBy ? 'USER' : 'SYSTEM',
    action: auditService.AUDIT_ACTIONS.UPDATE,
    resourceType: 'Config',
    resourceId: result.id,
    description: `配置变更 ${input.category}.${input.key} → v${result.version}`,
    newValue: { category: input.category, key: input.key, version: result.version },
  }).catch(() => { /* fire-and-forget */ });

  return { id: result.id, version: result.version };
}

export async function listByCategory(category?: string): Promise<Array<{
  category: string;
  key: string;
  value: Prisma.JsonValue;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}>> {
  await ensureCache();
  const at = new Date();
  const map = new Map<string, CacheEntry>();
  cache.forEach((e) => {
    if (category && e.category !== category) return;
    if (!isEffectiveAt(e, at)) return;
    const k = `${e.category}:${e.key}`;
    const prev = map.get(k);
    if (!prev || e.version > prev.version) {
      map.set(k, e);
    }
  });
  return [...map.values()].map((e) => ({
    category: e.category,
    key: e.key,
    value: e.value,
    version: e.version,
    effectiveFrom: e.effectiveFrom,
    effectiveTo: e.effectiveTo,
  }));
}

/** 测试用：清空内存缓存 */
export function clearCacheForTest(): void {
  cache = [];
  cacheLoadedAt = 0;
}
