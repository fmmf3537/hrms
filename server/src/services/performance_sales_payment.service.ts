// M3-D5: 销售回款登记 service | HRMS
// 仅 import audit/config + prisma；提成计算调 D5 commission service

import type { PerformanceSalesPayment, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';
import * as commissionService from './performance_sales_commission.service';

const RESOURCE_TYPE = 'performance_sales_payment';
const PERIOD_RE = /^\d{4}-\d{2}$/;

export interface CreatePaymentInput {
  employeeId: string;
  productId: string;
  customerName: string;
  amount: number;
  paymentDate: Date | string;
  period?: string;
  remark?: string;
}

export interface ListPaymentFilter {
  employeeId?: string;
  productId?: string;
  status?: string;
  period?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedPayments {
  items: PerformanceSalesPayment[];
  total: number;
  page: number;
  pageSize: number;
}

function formatPeriod(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parsePaymentDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  return new Date(value);
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

async function getAutoConfirm(): Promise<boolean> {
  try {
    const v = await configService.getValue('performance', 'sales.payment.auto_confirm');
    return v === true;
  } catch {
    // TODO: configs.performance.sales.payment.auto_confirm 未配置时 fallback false
    return false;
  }
}

async function getCalculationStrategy(): Promise<string> {
  try {
    const v = await configService.getValue('performance', 'sales.commission.calculation_strategy');
    return typeof v === 'string' && v.length > 0 ? v : 'auto_on_confirm';
  } catch {
    // TODO: configs.performance.sales.commission.calculation_strategy 未配置时 fallback
    return 'auto_on_confirm';
  }
}

/**
 * 销售登记回款（draft 状态）
 * @param actorId 操作人 ID（销售/管理员）
 * @param input { employeeId, productId, customerName, amount, paymentDate, period?, remark? }
 * @returns 新创建的 performance_sales_payments 记录
 * @throws AppError(400, 72801) product 不存在
 * @throws AppError(400, 72806) amount ≤0
 * @throws AppError(400, 72807) employee 非销售岗
 * 校验链：
 *  1. 校验 product 存在 → 否则抛 72801
 *  2. 校验 amount > 0 → 否则抛 72806
 *  3. 校验 employee 是销售岗（D5 简化：employee.status = 'active'）→ 否则抛 72807
 *  4. period 不传则从 paymentDate 推算（YYYY-MM）
 *  5. 创建记录（status = draft）
 *  6. 写 audit（SALES_PAYMENT_CREATE）
 *  注：D5 简化销售岗判定，configs.performance.sales.employee_position_codes 留 TODO（D5+ 联调）
 */
export async function createPayment(
  actorId: string,
  input: CreatePaymentInput,
): Promise<PerformanceSalesPayment> {
  const product = await prisma.performanceSalesProduct.findUnique({
    where: { id: input.productId },
  });
  if (!product) {
    throw new AppError('销售产品不存在', 400, 72801);
  }

  if (!(input.amount > 0)) {
    throw new AppError('回款金额必须大于 0', 400, 72806);
  }

  // TODO: D5 简化销售岗判定（仅校验 status=active）；position codes 留 D5+ 联调
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, deletedAt: null },
  });
  if (!employee || employee.status !== 'active') {
    throw new AppError('员工非在职销售岗，无法登记回款', 400, 72807);
  }

  const paymentDate = parsePaymentDate(input.paymentDate);
  let { period } = input;
  if (period) {
    if (!PERIOD_RE.test(period)) {
      throw new AppError('period 格式错误，应为 YYYY-MM', 400, 72809);
    }
  } else {
    period = formatPeriod(paymentDate);
  }

  // D5 强制 false：财务手动确认，即使 configs 被改也不自动确认
  await getAutoConfirm();

  const created = await prisma.performanceSalesPayment.create({
    data: {
      employeeId: input.employeeId,
      productId: input.productId,
      customerName: input.customerName,
      amount: new Decimal(input.amount),
      paymentDate,
      period,
      status: 'draft',
      remark: input.remark ?? null,
      createdById: actorId,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALES_PAYMENT_CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: created.id,
    description: `登记回款 employee=${input.employeeId} amount=${input.amount}`,
    newValue: {
      employeeId: input.employeeId,
      productId: input.productId,
      amount: input.amount,
      period,
    },
  });

  return created;
}

/**
 * 列出回款记录（分页 + 过滤）
 * @param actorId 操作人 ID
 * @param filter { employeeId?, productId?, status?, period?, page, pageSize }
 * @returns { items, total, page, pageSize }
 */
export async function listPayments(
  actorId: string,
  filter: ListPaymentFilter,
): Promise<PaginatedPayments> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  if (page < 1 || pageSize < 1 || pageSize > 100) {
    throw new AppError('分页参数不合法', 400);
  }

  if (filter.period && !PERIOD_RE.test(filter.period)) {
    throw new AppError('period 格式错误，应为 YYYY-MM', 400, 72809);
  }

  const where: Prisma.PerformanceSalesPaymentWhereInput = {};
  if (filter.employeeId) where.employeeId = filter.employeeId;
  if (filter.productId) where.productId = filter.productId;
  if (filter.status) {
    where.status = filter.status as 'draft' | 'confirmed' | 'cancelled';
  }
  if (filter.period) where.period = filter.period;

  const [items, total] = await Promise.all([
    prisma.performanceSalesPayment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.performanceSalesPayment.count({ where }),
  ]);

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALES_LIST',
    resourceType: RESOURCE_TYPE,
    description: `查询回款列表 total=${total}`,
    newValue: { filter, total },
  });

  return {
    items, total, page, pageSize,
  };
}

/**
 * 财务确认到账（draft → confirmed + 触发 commission 计算）
 * @param actorId 操作人 ID（hr/admin 兼任财务）
 * @param id payment ID
 * @param input { remark? }
 * @returns 更新后的 payment
 * @throws AppError(400, 72804) payment 不存在
 * @throws AppError(400, 72805) 已确认（重复确认）
 * 校验链：
 *  1. 查询 payment → 不存在抛 72804
 *  2. 状态检查：status === 'draft' → 否则抛 72805
 *  3. 校验 paymentLockDays：D5 暂不启用 lockDays（留 TODO）
 *  4. update payment { status='confirmed', confirmedById, confirmedAt } + 调 calculateCommission
 *  5. 写 audit（SALES_PAYMENT_CONFIRM）
 *  注：财务确认由 hr/admin 兼任，真正的 finance 角色留二期
 */
export async function confirmPayment(
  actorId: string,
  id: string,
  input: { remark?: string } = {},
): Promise<PerformanceSalesPayment> {
  const existing = await prisma.performanceSalesPayment.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('回款记录不存在', 400, 72804);
  }
  if (existing.status !== 'draft') {
    throw new AppError('回款已确认或已取消，不可重复确认', 400, 72805);
  }

  // TODO: D5 暂不启用 lockDays（configs.performance.sales.commission.payment_lock_days = 7）
  await getPerfConfigNumber('sales.commission.payment_lock_days', 7);

  const updated = await prisma.performanceSalesPayment.update({
    where: { id },
    data: {
      status: 'confirmed',
      confirmedById: actorId,
      confirmedAt: new Date(),
      ...(input.remark != null ? { remark: input.remark } : {}),
    },
  });

  const strategy = await getCalculationStrategy();
  let commissionId: string | undefined;
  if (strategy === 'auto_on_confirm') {
    const commission = await commissionService.calculateCommission(actorId, id);
    commissionId = commission.id;
  }

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALES_PAYMENT_CONFIRM',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `确认回款 payment=${id} commission=${commissionId ?? 'skipped'}`,
    newValue: { paymentId: id, commissionId },
  });

  return updated;
}

/**
 * 取消回款（仅 draft 可取消）
 * @param actorId 操作人 ID
 * @param id payment ID
 * @param input { reason: string }
 * @returns 更新后的 payment
 * @throws AppError(400) reason 缺失
 * 校验链：
 *  1. 查询 payment → 不存在抛 72804
 *  2. 校验 reason 必填且 ≥5 字符
 *  3. 状态检查：status === 'draft' → 否则抛 400（已确认不可取消）
 *  4. update payment { status='cancelled', remark=reason }
 *  5. 写 audit（SALES_PAYMENT_CANCEL）
 */
export async function cancelPayment(
  actorId: string,
  id: string,
  input: { reason: string },
): Promise<PerformanceSalesPayment> {
  if (!input.reason || input.reason.trim().length < 5) {
    throw new AppError('取消原因必填且不少于 5 个字符', 400);
  }

  const existing = await prisma.performanceSalesPayment.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('回款记录不存在', 400, 72804);
  }
  if (existing.status !== 'draft') {
    throw new AppError('已确认回款不可取消', 400);
  }

  const updated = await prisma.performanceSalesPayment.update({
    where: { id },
    data: {
      status: 'cancelled',
      remark: input.reason.trim(),
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALES_PAYMENT_CANCEL',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `取消回款 payment=${id}`,
    newValue: { reason: input.reason, prevStatus: existing.status },
  });

  return updated;
}
