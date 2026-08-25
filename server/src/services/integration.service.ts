// M0.5-4: 第三方对接 service | HRMS
// 职责：CRUD + 调用 adapter（按 code 路由）+ 写 sync log + 测试连通性

import type { Prisma } from '@prisma/client';

import { getAdapter } from '../integrations/adapter.interface';
import type { AdapterResult, TestResult } from '../integrations/adapter.interface';
import { registerAllAdapters } from '../integrations/adapters/register';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

// ============== 错误码（与 docs/error-codes.md §5xxxx 对齐）==============

// 50100 INTEGRATION_CONFIG_MISSING（env 未配置）
// 50101 INTEGRATION_NOT_FOUND
// 50110 INTEGRATION_PROVIDER_ERROR
// 50111 INTEGRATION_TIMEOUT
// 50112 INTEGRATION_RATE_LIMITED
// 50120 INTEGRATION_PAYLOAD_INVALID

// ============== 初始化 ==============

/**
 * 确保 adapter 注册（懒加载）
 * service 任何方法首次调用时触发
 */
function ensureAdaptersRegistered(): void {
  registerAllAdapters();
}

// ============== 同步日志 ==============

async function writeSyncLog(
  integrationId: string,
  operation: 'send' | 'sync' | 'test_connection' | 'pull',
  result: AdapterResult | TestResult,
): Promise<void> {
  const isAdapterResult = 'recordCount' in result;
  const status = result.success ? 'success' : 'failed';
  // AdapterResult 有 duration，TestResult 有 latency
  const duration = isAdapterResult
    ? (result).duration ?? 0
    : (result as TestResult).latency ?? 0;
  await prisma.integrationSyncLog.create({
    data: {
      integrationId,
      status,
      operation,
      recordCount: isAdapterResult ? (result).recordCount ?? 0 : 0,
      duration,
      errorMessage: result.error ?? null,
    },
  });

  // 成功后更新 lastSyncAt
  if (result.success) {
    await prisma.integration.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date() },
    }).catch(() => { /* ignore if not found */ });
  }
}

// ============== 配置管理 ==============

export interface CreateIntegrationInput {
  code: string;
  name: string;
  type: 'http_api' | 'webhook' | 'database' | 'file';
  config: Prisma.InputJsonValue;
  description?: string;
}

export async function createIntegration(input: CreateIntegrationInput): Promise<{ id: string }> {
  // 检查 code 唯一
  const existing = await prisma.integration.findUnique({ where: { code: input.code } });
  if (existing) {
    throw new AppError(`集成 code 已存在: ${input.code}`, 409, 50101);
  }

  const created = await prisma.integration.create({
    data: {
      code: input.code,
      name: input.name,
      type: input.type,
      config: input.config,
      description: input.description ?? null,
      enabled: true,
    },
  });
  return { id: created.id };
}

export async function listIntegrations(): Promise<Array<{
  id: string;
  code: string;
  name: string;
  type: string;
  enabled: boolean;
  lastSyncAt: Date | null;
}>> {
  const list = await prisma.integration.findMany({
    where: { deletedAt: null },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      enabled: true,
      lastSyncAt: true,
    },
  });
  return list;
}

export async function getIntegrationByCode(code: string): Promise<{
  id: string;
  code: string;
  name: string;
  type: string;
  config: Prisma.JsonValue;
  enabled: boolean;
}> {
  const integ = await prisma.integration.findUnique({
    where: { code },
  });
  if (!integ || integ.deletedAt) {
    throw new AppError(`集成不存在: ${code}`, 404, 50101);
  }
  return {
    id: integ.id,
    code: integ.code,
    name: integ.name,
    type: integ.type,
    config: integ.config,
    enabled: integ.enabled,
  };
}

export async function updateIntegration(
  id: string,
  input: Partial<Omit<CreateIntegrationInput, 'code'>>,
): Promise<{ id: string }> {
  const updated = await prisma.integration.update({
    where: { id },
    data: {
      name: input.name,
      type: input.type,
      config: input.config,
      description: input.description,
    },
  });
  return { id: updated.id };
}

export async function deleteIntegration(id: string): Promise<void> {
  // 软删除 + 禁用
  await prisma.integration.update({
    where: { id },
    data: { deletedAt: new Date(), enabled: false },
  });
}

// ============== 调用 ==============

export interface SendInput {
  code: string;
  payload: unknown;
}

/**
 * 通过指定 code 发送 / 调用集成
 * - 查 integration + 找 adapter
 * - adapter 缺失 → 50120
 * - integration 禁用 → 50100
 * - 调 adapter.send(payload, config)
 * - 写 sync log
 */
export async function send(input: SendInput): Promise<AdapterResult> {
  ensureAdaptersRegistered();
  const integration = await prisma.integration.findUnique({
    where: { code: input.code },
  });
  if (!integration || integration.deletedAt) {
    throw new AppError(`集成不存在: ${input.code}`, 404, 50101);
  }
  if (!integration.enabled) {
    throw new AppError(`集成已禁用: ${input.code}`, 400, 50100);
  }
  const adapter = getAdapter(input.code);
  if (!adapter) {
    throw new AppError(
      `集成 ${input.code} 没有对应 adapter（请检查 integrations/adapters/register.ts）`,
      501,
      50120,
    );
  }

  const result = await adapter.send(input.payload, integration.config as Record<string, unknown>);
  await writeSyncLog(integration.id, 'send', result);
  return result;
}

export interface SyncInput {
  code: string;
}

/**
 * 手动触发同步（拉取外部数据）
 */
export async function sync(input: SyncInput): Promise<AdapterResult> {
  ensureAdaptersRegistered();
  const integration = await prisma.integration.findUnique({
    where: { code: input.code },
  });
  if (!integration || integration.deletedAt) {
    throw new AppError(`集成不存在: ${input.code}`, 404, 50101);
  }
  const adapter = getAdapter(input.code);
  if (!adapter) {
    throw new AppError(`集成 ${input.code} 没有对应 adapter`, 501, 50120);
  }

  const result = await adapter.sync(integration.config as Record<string, unknown>);
  await writeSyncLog(integration.id, 'sync', result);
  return result;
}

export interface TestConnectionInput {
  code: string;
}

/**
 * 测试连通性（不传业务参数）
 */
export async function testConnection(input: TestConnectionInput): Promise<TestResult> {
  ensureAdaptersRegistered();
  const integration = await prisma.integration.findUnique({
    where: { code: input.code },
  });
  if (!integration || integration.deletedAt) {
    throw new AppError(`集成不存在: ${input.code}`, 404, 50101);
  }
  const adapter = getAdapter(input.code);
  if (!adapter) {
    throw new AppError(`集成 ${input.code} 没有对应 adapter`, 501, 50120);
  }

  const result = await adapter.testConnection(integration.config as Record<string, unknown>);
  await writeSyncLog(integration.id, 'test_connection', result);
  return result;
}

// ============== 同步日志查询 ==============

export interface ListSyncLogsOptions {
  integrationId?: string;
  status?: 'success' | 'failed' | 'partial';
  page?: number;
  pageSize?: number;
}

export async function listSyncLogs(options: ListSyncLogsOptions): Promise<{
  data: Array<{
    id: string;
    integrationId: string;
    status: string;
    operation: string;
    recordCount: number;
    duration: number;
    errorMessage: string | null;
    createdAt: Date;
  }>;
  total: number;
}> {
  const {
    integrationId, status, page = 1, pageSize = 20,
  } = options;
  const where: Prisma.IntegrationSyncLogWhereInput = {
    ...(integrationId ? { integrationId } : {}),
    ...(status ? { status } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.integrationSyncLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.integrationSyncLog.count({ where }),
  ]);

  return {
    data: data.map((d) => ({
      id: d.id,
      integrationId: d.integrationId,
      status: d.status,
      operation: d.operation,
      recordCount: d.recordCount,
      duration: d.duration,
      errorMessage: d.errorMessage,
      createdAt: d.createdAt,
    })),
    total,
  };
}
