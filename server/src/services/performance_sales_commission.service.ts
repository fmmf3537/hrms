// M3-D5: 销售提成计算 service | HRMS
// 仅 import audit/config + prisma（不 import 跨业务 service）

import type { PerformanceSalesCommission, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'performance_sales_commission';
const PERIOD_RE = /^\d{4}-\d{2}$/;

export interface ListCommissionFilter {
  employeeId?: string;
  productId?: string;
  status?: string;
  period?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedCommissions {
  items: PerformanceSalesCommission[];
  total: number;
  page: number;
  pageSize: number;
}

async function getPerfConfigNumber(key: string, fallback: number): Promise<number> {
  try {
    const v = await configService.getValue('performance', key);
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    // TODO: configs.performance.{key} 未配置时 fallback
    return fallback;
  }
}

async function getPerfConfigString(key: string, fallback: string): Promise<string> {
  try {
    const v = await configService.getValue('performance', key);
    return typeof v === 'string' && v.length > 0 ? v : fallback;
  } catch {
    // TODO: configs.performance.{key} 未配置时 fallback
    return fallback;
  }
}

async function getTargetCompletionBonus(): Promise<{ threshold: number; bonus_rate: number }> {
  const fallback = { threshold: 1.2, bonus_rate: 0.2 };
  try {
    const v = await configService.getValue('performance', 'sales.commission.target_completion_bonus');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      return {
        threshold: Number(obj.threshold) || fallback.threshold,
        bonus_rate: Number(obj.bonus_rate) || fallback.bonus_rate,
      };
    }
    return fallback;
  } catch {
    // TODO: configs.performance.sales.commission.target_completion_bonus 未配置时 fallback
    return fallback;
  }
}

/**
 * 目标完成率校验（D5 暂不从销售目标表读取，仅在显式传入时触发 72810）
 * @param rate 目标完成率；undefined 表示 D5 默认 1.0（无上浮）
 * @throws AppError(400, 72810) rate < 1.0
 */
export function assertTargetCompletionRate(rate: number): void {
  if (rate < 1.0) {
    throw new AppError('目标完成率未达标', 400, 72810);
  }
}

/**
 * 提成计算（被 confirmPayment 触发，也可手动调用）
 * @param actorId 操作人 ID（hr/admin/系统）
 * @param paymentId payment ID
 * @returns 新创建的 performance_sales_commissions 记录
 * @throws AppError(400, 72804) payment 不存在
 * @throws AppError(400, 72805) payment 状态非 confirmed
 * @throws AppError(400, 72808) commission 已计算
 * 校验链：
 *  1. 查询 payment（含 product）→ 不存在抛 72804
 *  2. 状态检查：payment.status === 'confirmed' → 否则抛 72805
 *  3. 查是否已存在该 paymentId 的 commission → 存在抛 72808
 *  4. 计算：
 *     - baseAmount = payment.amount
 *     - commissionRate = payment.product.baseRate
 *     - targetBonusRate = 0（D5 不实现销售目标，留 D5+ 联调）
 *     - finalAmount = baseAmount × (commissionRate + targetBonusRate)
 *  5. 事务：create commission（status=calculated）
 *  6. 写 audit（SALES_COMMISSION_CALCULATE）
 *  注：D5 公式简化为加法（vs 实际乘法上浮 20%），留 D5+ 联调细化
 */
export async function calculateCommission(
  actorId: string,
  paymentId: string,
): Promise<PerformanceSalesCommission> {
  // 读取策略/周期/批量上限（D5 单条计算仅作配置化埋点）
  await getPerfConfigString('sales.commission.calculation_strategy', 'auto_on_confirm');
  await getPerfConfigString('sales.commission.target_period', 'monthly');
  await getPerfConfigNumber('sales.commission.batch_size', 200);
  // TODO: D5 不实现销售目标表，targetBonusRate 固定 0；D5+ 联调时按完成率上浮
  await getTargetCompletionBonus();

  const payment = await prisma.performanceSalesPayment.findUnique({
    where: { id: paymentId },
    include: { product: true },
  });
  if (!payment) {
    throw new AppError('回款记录不存在', 400, 72804);
  }
  if (payment.status !== 'confirmed') {
    throw new AppError('回款尚未确认，无法计算提成', 400, 72805);
  }

  const existing = await prisma.performanceSalesCommission.findUnique({
    where: { paymentId },
  });
  if (existing) {
    throw new AppError('该回款已计算提成', 400, 72808);
  }

  const baseAmount = new Decimal(payment.amount);
  const commissionRate = new Decimal(payment.product.baseRate);
  // D5 不实现销售目标：targetBonusRate = 0（完成率默认 1.0，无上浮）
  const targetBonusRate = new Decimal(0);
  const finalAmount = baseAmount.mul(commissionRate.add(targetBonusRate)).toDecimalPlaces(2);

  const created = await prisma.performanceSalesCommission.create({
    data: {
      employeeId: payment.employeeId,
      paymentId: payment.id,
      productId: payment.productId,
      baseAmount,
      commissionRate,
      targetBonusRate,
      finalAmount,
      period: payment.period,
      status: 'calculated',
      calculatedBy: actorId,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALES_COMMISSION_CALCULATE',
    resourceType: RESOURCE_TYPE,
    resourceId: created.id,
    description: `计算提成 payment=${paymentId} finalAmount=${String(finalAmount)}`,
    newValue: {
      baseAmount: Number(baseAmount),
      commissionRate: Number(commissionRate),
      finalAmount: Number(finalAmount),
    },
  });

  return created;
}

/**
 * 标记发放提成（calculated → paid）
 * @param actorId 操作人 ID（hr/admin）
 * @param id commission ID
 * @returns 更新后的 commission
 * @throws AppError(404) commission 不存在
 * @throws AppError(400) status 非 calculated
 * 校验链：
 *  1. 查询 commission → 不存在抛 404
 *  2. 状态检查：status === 'calculated' → 否则抛 400
 *  3. update { status='paid', paidAt=now() }
 *  4. 写 audit（SALES_COMMISSION_PAYOUT）
 *  注：D5 仅标记 + audit，实际联动 M4 薪酬留独立任务
 */
export async function payoutCommission(
  actorId: string,
  id: string,
): Promise<PerformanceSalesCommission> {
  const existing = await prisma.performanceSalesCommission.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('提成记录不存在', 404);
  }
  if (existing.status !== 'calculated') {
    throw new AppError('仅 calculated 状态可标记发放', 400);
  }

  const updated = await prisma.performanceSalesCommission.update({
    where: { id },
    data: {
      status: 'paid',
      paidAt: new Date(),
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALES_COMMISSION_PAYOUT',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `标记发放提成 period=${existing.period} amount=${String(existing.finalAmount)}`,
    newValue: { finalAmount: Number(existing.finalAmount), period: existing.period },
  });

  return updated;
}

/**
 * 列出提成记录（分页 + 过滤）
 * @param actorId 操作人 ID（用于权限过滤 + 审计）
 * @param filter { employeeId?, productId?, status?, period?, page, pageSize }
 * @returns { items, total, page, pageSize }
 * 校验链：
 *  1. 校验 page ≥ 1 / pageSize ∈ [1, 100]
 *  2. 权限过滤：employee 仅返本人；其他全返
 *  3. 构建 prisma where
 *  4. findMany + count
 *  5. 写 audit（SALES_LIST）
 */
export async function listCommissions(
  actorId: string,
  filter: ListCommissionFilter,
): Promise<PaginatedCommissions> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  if (page < 1 || pageSize < 1 || pageSize > 100) {
    throw new AppError('分页参数不合法', 400);
  }

  if (filter.period && !PERIOD_RE.test(filter.period)) {
    throw new AppError('period 格式错误，应为 YYYY-MM', 400, 72809);
  }

  const where: Prisma.PerformanceSalesCommissionWhereInput = {};
  if (filter.employeeId) where.employeeId = filter.employeeId;
  if (filter.productId) where.productId = filter.productId;
  if (filter.status) {
    where.status = filter.status as 'calculated' | 'paid' | 'cancelled';
  }
  if (filter.period) where.period = filter.period;

  const user = await prisma.user.findUnique({
    where: { id: actorId },
    include: { userRoles: { include: { role: true } } },
  });
  const roleCodes = user?.userRoles.map((r) => r.role.code) ?? [];
  const isEmployeeOnly = roleCodes.includes('employee')
    && !roleCodes.some((c) => ['admin', 'hr', 'executive', 'dept_head'].includes(c));
  if (isEmployeeOnly) {
    const emp = await prisma.employee.findFirst({
      where: { userId: actorId, deletedAt: null },
      select: { id: true },
    });
    where.employeeId = emp?.id ?? '__none__';
  }

  const [items, total] = await Promise.all([
    prisma.performanceSalesCommission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.performanceSalesCommission.count({ where }),
  ]);

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALES_LIST',
    resourceType: RESOURCE_TYPE,
    description: `查询提成列表 total=${total}`,
    newValue: { filter, total },
  });

  return {
    items, total, page, pageSize,
  };
}
