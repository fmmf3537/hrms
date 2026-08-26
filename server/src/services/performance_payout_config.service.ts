// M3-D4: 绩效兑现模式配置 service | HRMS
// 仅 import audit/config + prisma

import type { PerformancePayoutConfig } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'performance_payout_config';
const VALID_MODES = ['direct', 'pool'] as const;

export type PayoutMode = (typeof VALID_MODES)[number];

export interface SwitchConfigInput {
  mode: PayoutMode;
  effectiveFrom?: Date;
  remark?: string;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function assertMode(mode: string): asserts mode is PayoutMode {
  if (!VALID_MODES.includes(mode as PayoutMode)) {
    throw new AppError('兑现模式不合法', 400, 72702);
  }
}

/**
 * 读当前生效的兑现模式配置
 * @param actorId 操作人 ID（可选，传入时写审计）
 * @returns 当前 effectiveTo=null 的最新配置
 * @throws AppError(400, 72701) 当前无生效配置
 */
export async function getCurrentConfig(actorId?: string): Promise<PerformancePayoutConfig> {
  const config = await prisma.performancePayoutConfig.findFirst({
    where: { effectiveTo: null },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!config) {
    throw new AppError('当前无生效兑现配置', 400, 72701);
  }

  if (actorId) {
    await auditService.auditLog({
      userId: actorId,
      action: 'PAYOUT_CONFIG_READ',
      resourceType: RESOURCE_TYPE,
      resourceId: config.id,
      description: `读取兑现模式配置 mode=${config.mode}`,
    });
  }

  return config;
}

/**
 * 切换兑现模式（写入新版本 + 关闭旧版本）
 * @param actorId 操作人 ID（hr/admin）
 * @param input mode / effectiveFrom / remark
 * @returns 新写入的配置
 * @throws AppError(400, 72702) mode 不在 direct / pool
 */
export async function switchConfig(
  actorId: string,
  input: SwitchConfigInput,
): Promise<PerformancePayoutConfig> {
  assertMode(input.mode);

  const effectiveFrom = startOfDay(input.effectiveFrom ?? new Date());
  const current = await prisma.performancePayoutConfig.findFirst({
    where: { effectiveTo: null },
    orderBy: { effectiveFrom: 'desc' },
  });

  const created = await prisma.$transaction(async (tx) => {
    if (current) {
      await tx.performancePayoutConfig.update({
        where: { id: current.id },
        data: { effectiveTo: addDays(effectiveFrom, -1) },
      });
    }

    return tx.performancePayoutConfig.create({
      data: {
        mode: input.mode,
        effectiveFrom,
        effectiveTo: null,
        remark: input.remark ?? null,
        createdBy: actorId,
      },
    });
  });

  try {
    await configService.setValue({
      category: 'performance',
      key: 'payout.mode',
      value: input.mode,
      effectiveFrom: new Date(),
      remark: 'D4 兑现模式切换',
      createdBy: actorId,
    });
  } catch {
    // TODO: configService 不可用时仅依赖表记录
  }

  await auditService.auditLog({
    userId: actorId,
    action: 'PAYOUT_CONFIG_SWITCH',
    resourceType: RESOURCE_TYPE,
    resourceId: created.id,
    description: `切换兑现模式 ${current?.mode ?? 'none'} → ${input.mode}`,
    oldValue: current ? { mode: current.mode, id: current.id } : null,
    newValue: { mode: input.mode, id: created.id },
  });

  return created;
}
