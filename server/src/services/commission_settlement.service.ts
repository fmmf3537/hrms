// M4-C6: 销售提成季度结算单（1 新表 commission_settlements；不联动 C4 / 不改 D5）| HRMS

import type { CommissionSettlement, CommissionSettlementStatus, Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import {
  getFiscalQuarterStart,
  getQuarterDateRange,
  getQuarterPeriodKeys,
  toNum,
} from './commission_summary.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'commission_settlement';
const FALLBACK_CONFIRM_WINDOW = 7;
const FALLBACK_MAX_ADJUSTMENT = 0.5;
const OPEN_STATUSES = ['draft', 'pending_confirm'] as const;

export interface CreateSettlementInput {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  initialStatus?: 'draft' | 'pending_confirm';
}

export interface ListSettlementFilter {
  year?: number;
  status?: string;
  periodStart?: string;
  periodEnd?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedSettlements {
  items: CommissionSettlement[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CommissionSettlementDetail extends CommissionSettlement {
  commissionCount: number;
}

async function getConfirmWindowDays(): Promise<number> {
  try {
    const v = await configService.getValue('salary', 'commission.settlement.confirm_window_days');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : FALLBACK_CONFIRM_WINDOW;
  } catch {
    // TODO: configs.salary.commission.settlement.confirm_window_days 未配置时 fallback
    return FALLBACK_CONFIRM_WINDOW;
  }
}

async function getMaxAdjustmentRatio(): Promise<number> {
  try {
    const v = await configService.getValue('salary', 'commission.settlement.max_adjustment_ratio');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n >= 0 ? n : FALLBACK_MAX_ADJUSTMENT;
  } catch {
    // TODO: configs.salary.commission.settlement.max_adjustment_ratio 未配置时 fallback
    return FALLBACK_MAX_ADJUSTMENT;
  }
}

async function assertMockMode(): Promise<void> {
  try {
    const v = await configService.getValue('salary', 'commission.settlement.mock_mode');
    if (v === false) {
      throw new AppError('C6 强制 mock 模式，禁止联动 C4 算薪', 400, 73604);
    }
  } catch (err) {
    if (err instanceof AppError && err.code === 73604) throw err;
    // TODO: configs.salary.commission.settlement.mock_mode 未配置时视为 true
  }
}

async function loadPaidForQuarter(year: number, quarter: 1 | 2 | 3 | 4) {
  const fiscal = await getFiscalQuarterStart();
  const periods = getQuarterPeriodKeys(year, quarter, fiscal);
  return prisma.performanceSalesCommission.findMany({
    where: { status: 'paid', period: { in: periods } },
    select: {
      id: true,
      employeeId: true,
      productId: true,
      finalAmount: true,
    },
  });
}

/**
 * 创建季度结算单（V1.2 §二.5.4 销售提成 + §四.8 遗留 D5 联动）
 * @param actorId 操作人 ID（hr/admin）
 * @param input { year, quarter: 1|2|3|4, initialStatus?: draft | pending_confirm }
 * @returns 新创建的 CommissionSettlement
 * @throws AppError(400, 73605) quarter 不在 1-4 / year 越界
 * @throws AppError(400, 73606) 季度内无 paid commissions
 * @throws AppError(400, 73607) 同一 (year, quarter) 已存在结算单
 * 校验链：
 *  1. year ∈ [2020, 2099]；quarter ∈ {1,2,3,4}
 *  2. initialStatus 默认 pending_confirm
 *  3. periodStart/periodEnd 按 fiscal_quarter_start（默认 1=自然年）
 *  4. 只读 D5 status=paid commissions 汇总，无数据抛 73606
 *  5. 同一年季已有 draft/pending_confirm（及 unique 占用）抛 73607
 *  6. 读 max_adjustment_ratio（C6 不实现调整 API）
 *  7. create + audit COMMISSION_SETTLEMENT_CREATE
 * 注：不联动 C4 算薪、不写 payslip_items、不改 D5 commissions
 */
export async function createSettlement(
  actorId: string,
  input: CreateSettlementInput,
): Promise<CommissionSettlement> {
  if (!Number.isInteger(input.year) || input.year < 2020 || input.year > 2099) {
    throw new AppError('year 越界，应为 2020-2099', 400, 73605);
  }
  if (![1, 2, 3, 4].includes(input.quarter)) {
    throw new AppError('quarter 不在 1-4', 400, 73605);
  }
  const initialStatus = input.initialStatus ?? 'pending_confirm';
  if (initialStatus !== 'draft' && initialStatus !== 'pending_confirm') {
    throw new AppError('initialStatus 非法', 400, 73604);
  }
  await getMaxAdjustmentRatio();
  const fiscal = await getFiscalQuarterStart();
  const { periodStart, periodEnd } = getQuarterDateRange(input.year, input.quarter, fiscal);

  const existing = await prisma.commissionSettlement.findFirst({
    where: { year: input.year, quarter: input.quarter },
  });
  if (existing) {
    throw new AppError('该季度已存在结算单', 400, 73607);
  }

  const paid = await loadPaidForQuarter(input.year, input.quarter);
  if (paid.length === 0) {
    throw new AppError('季度内无已发放提成', 400, 73606);
  }

  const employeeIds = new Set(paid.map((r) => r.employeeId));
  const productIds = new Set(paid.map((r) => r.productId));
  const totalAmount = paid.reduce((s, r) => s + toNum(r.finalAmount), 0);

  const created = await prisma.$transaction(async (tx) => tx.commissionSettlement.create({
    data: {
      year: input.year,
      quarter: input.quarter,
      status: initialStatus,
      totalAmount,
      recordCount: paid.length,
      employeeCount: employeeIds.size,
      productCount: productIds.size,
      periodStart,
      periodEnd,
      createdBy: actorId,
    },
  }));

  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'COMMISSION_SETTLEMENT_CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: created.id,
    description: '创建销售提成季度结算单',
    newValue: {
      settlementId: created.id,
      year: input.year,
      quarter: input.quarter,
      totalAmount,
      recordCount: paid.length,
      employeeCount: employeeIds.size,
    },
  });
  return created;
}

/**
 * 季度结算单列表查询
 * @param actorId 操作人 ID
 * @param filter { year?, status?, periodStart?, periodEnd?, page?, pageSize? }
 * @returns { items, total, page, pageSize }
 * @throws AppError(400) 分页参数不合法
 * 校验链：page≥1 / pageSize∈[1,100] → 过滤 → createdAt desc → audit
 */
export async function listSettlements(
  actorId: string,
  filter: ListSettlementFilter,
): Promise<PaginatedSettlements> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  const pageOk = Number.isInteger(page) && page >= 1;
  const sizeOk = Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100;
  if (!pageOk || !sizeOk) {
    throw new AppError('分页参数不合法', 400);
  }
  const where: Prisma.CommissionSettlementWhereInput = {};
  if (filter.year != null) where.year = filter.year;
  const statuses: CommissionSettlementStatus[] = [
    'draft', 'pending_confirm', 'confirmed', 'cancelled',
  ];
  if (filter.status) {
    const matched = statuses.find((s) => s === filter.status);
    if (!matched) {
      throw new AppError('status 非法', 400, 73604);
    }
    where.status = matched;
  }
  if (filter.periodStart || filter.periodEnd) {
    where.periodStart = {};
    if (filter.periodStart) where.periodStart.gte = new Date(filter.periodStart);
    if (filter.periodEnd) where.periodEnd = { lte: new Date(filter.periodEnd) };
  }
  const [items, total] = await Promise.all([
    prisma.commissionSettlement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.commissionSettlement.count({ where }),
  ]);
  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'COMMISSION_SUMMARY_QUERY',
    resourceType: RESOURCE_TYPE,
    description: '季度结算单列表',
    newValue: { year: filter.year, status: filter.status, total },
  });
  return {
    items,
    total,
    page,
    pageSize,
  };
}

/**
 * 季度结算单详情（含关联 paid commissions 数量，不返回明细）
 * @param actorId 操作人 ID
 * @param id settlement ID
 * @returns CommissionSettlementDetail
 * @throws AppError(404, 73602) settlement 不存在
 * 校验链：查 settlement → 按 periodStart/End 聚合 D5 paid 数量 → audit
 */
export async function getSettlement(
  actorId: string,
  id: string,
): Promise<CommissionSettlementDetail> {
  const rec = await prisma.commissionSettlement.findUnique({
    where: { id },
    include: {
      confirmedByUser: { select: { id: true, username: true } },
      cancelledByUser: { select: { id: true, username: true } },
      createdByUser: { select: { id: true, username: true } },
    },
  });
  if (!rec) {
    throw new AppError('结算单不存在', 404, 73602);
  }
  const fiscal = await getFiscalQuarterStart();
  const periods = getQuarterPeriodKeys(
    rec.year,
    rec.quarter as 1 | 2 | 3 | 4,
    fiscal,
  );
  const commissionCount = await prisma.performanceSalesCommission.count({
    where: { status: 'paid', period: { in: periods } },
  });
  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'COMMISSION_SUMMARY_QUERY',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '季度结算单详情',
    newValue: { settlementId: id, commissionCount },
  });
  return { ...rec, commissionCount };
}

/**
 * 财务确认季度结算单（pending_confirm → confirmed，hr 兼任，无 finance）
 * @param actorId 操作人 ID（hr/admin/executive）
 * @param id settlement ID
 * @param input { remark? }
 * @returns 更新后的 CommissionSettlement
 * @throws AppError(404, 73602) 不存在
 * @throws AppError(400, 73603) 已 confirmed
 * @throws AppError(400, 73604) 状态非法（cancelled/draft 不能 confirm）
 * @throws AppError(400, 73609) 确认窗口已过
 * @throws AppError(400, 73610) D5 paid commissions 缺失
 * 校验链：查单 → 状态 pending_confirm → confirm_window → mock_mode=true → 重查 D5 → update
 * 注：不调用 M0.5-1 approval；不写 payslip_items；不联动 C4
 */
export async function confirmSettlement(
  actorId: string,
  id: string,
  input?: { remark?: string },
): Promise<CommissionSettlement> {
  const rec = await prisma.commissionSettlement.findUnique({ where: { id } });
  if (!rec) {
    throw new AppError('结算单不存在', 404, 73602);
  }
  if (rec.status === 'confirmed') {
    throw new AppError('结算单已确认', 400, 73603);
  }
  if (rec.status !== 'pending_confirm') {
    throw new AppError('结算单状态非法，仅 pending_confirm 可确认', 400, 73604);
  }
  const windowDays = await getConfirmWindowDays();
  const elapsedMs = Date.now() - rec.createdAt.getTime();
  if (elapsedMs > windowDays * 24 * 60 * 60 * 1000) {
    throw new AppError('确认窗口已过', 400, 73609);
  }
  await assertMockMode();
  const paid = await loadPaidForQuarter(rec.year, rec.quarter as 1 | 2 | 3 | 4);
  if (paid.length === 0) {
    throw new AppError('D5 提成数据缺失', 400, 73610);
  }

  const updated = await prisma.$transaction(async (tx) => tx.commissionSettlement.update({
    where: { id },
    data: {
      status: 'confirmed',
      confirmedBy: actorId,
      confirmedAt: new Date(),
      remark: input?.remark ?? rec.remark,
    },
  }));

  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'COMMISSION_SETTLEMENT_CONFIRM',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '财务确认销售提成季度结算单',
    newValue: {
      settlementId: id,
      totalAmount: toNum(updated.totalAmount),
      recordCount: updated.recordCount,
      mockMode: true,
    },
  });
  return updated;
}

/**
 * 取消季度结算单（draft / pending_confirm → cancelled）
 * @param actorId 操作人 ID（hr/admin）
 * @param id settlement ID
 * @param input { reason } 必填
 * @returns 更新后的 CommissionSettlement
 * @throws AppError(404, 73602) 不存在
 * @throws AppError(400, 73608) 已 confirmed 不能 cancel
 * @throws AppError(400, 73604) reason 为空
 * 校验链：查单 → status ∈ draft|pending_confirm → reason 非空 → update；不修改 D5 commissions
 */
export async function cancelSettlement(
  actorId: string,
  id: string,
  input: { reason: string },
): Promise<CommissionSettlement> {
  if (!input.reason || input.reason.trim() === '') {
    throw new AppError('取消原因必填', 400, 73604);
  }
  const rec = await prisma.commissionSettlement.findUnique({ where: { id } });
  if (!rec) {
    throw new AppError('结算单不存在', 404, 73602);
  }
  if (rec.status === 'confirmed') {
    throw new AppError('已确认的结算单不能取消', 400, 73608);
  }
  if (!(OPEN_STATUSES as readonly string[]).includes(rec.status)) {
    throw new AppError('已确认的结算单不能取消', 400, 73608);
  }

  const updated = await prisma.$transaction(async (tx) => tx.commissionSettlement.update({
    where: { id },
    data: {
      status: 'cancelled',
      cancelledBy: actorId,
      cancelledAt: new Date(),
      cancelReason: input.reason.trim(),
    },
  }));

  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'COMMISSION_SETTLEMENT_CANCEL',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '取消销售提成季度结算单',
    newValue: { settlementId: id, reason: input.reason.trim() },
  });
  return updated;
}
