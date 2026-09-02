/**
 * 绩效销售提成 / 产品字典 / 回款登记 API 类型（M5-2-D4）
 * @module api/types/performanceSales
 * @description 对齐 server/src/services/performance_sales_*.service.ts（M3-D5 已就绪）
 * + server/prisma/schema.prisma 1402-1505 行
 *
 * 端点响应结构（§5.1 逐一确认）：
 *  - listProducts/listPayments/listCommissions → { items, total, page, pageSize }
 *    （list 接口均不 include employee / product，name 展示走前端联查）
 *  - createProduct/updateProduct/confirmPayment/calculateCommission → 单条 Prisma 实体
 *
 * 关键决策（§5.2 百分比 ↔ 小数 转换）：
 *  - baseRate / commissionRate / targetBonusRate 是 Decimal(5,4) 小数（0.05 ≡ 5%）
 *  - 前端**存储/传输 = 小数**（Decimal 经 JSON 为 string），**展示/输入 = 百分比数字**
 *  - rateToPercent(0.05) → 5；percentToRate(5) → 0.05；4 位精度（Decimal(5,4)）
 *
 * @permission 5 角色无 finance（D4 切片，后端 hr/admin/executive 兼任财务，D1 教训延续）
 *  - performance:sales:product:read       admin/hr/dept_head/executive/employee
 *  - performance:sales:product:write      admin/hr
 *  - performance:sales:payment:read       admin/hr/dept_head/executive（**employee 不可读**）
 *  - performance:sales:payment:write      admin/hr
 *  - performance:sales:payment:confirm    admin/hr（**财务确认 hr/admin 代行**）
 *  - performance:sales:commission:read    admin/hr/dept_head/executive（**employee 不可读**）
 *  - performance:sales:commission:write   admin/hr/executive（**executive 无 payment 写但可触发计算**）
 */

import type { PaginatedResponse, UserInfo } from '@/api/types';
import { hasPermission } from '@/utils/permission';
import { unwrapPerformancePage } from './performance';

// ============ 枚举字面量类型 ============

export type SalesProductCategory = 'product' | 'service' | 'training';

export type SalesProductStatus = 'active' | 'archived';

export type SalesPaymentStatus = 'draft' | 'confirmed' | 'cancelled';

export type SalesCommissionStatus = 'calculated' | 'paid' | 'cancelled';

// ============ 实体（对照 prisma.schema 1427-1500）============

/** Decimal(5,4) 小数；前端展示用 percentToRate/baseRatePercent，统一 string | number 兼容 */
export interface SalesProduct {
  id: string;
  code: string;
  name: string;
  category: SalesProductCategory | string;
  /** baseRate 字段为 Decimal(5,4)，JSON 序列化为 string */
  baseRate: string | number;
  description: string | null;
  status: SalesProductStatus | string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalesPayment {
  id: string;
  employeeId: string;
  productId: string;
  customerName: string;
  /** Decimal(12,2) */
  amount: string | number;
  /** @db.Date 序列化 YYYY-MM-DD 字符串（无时间） */
  paymentDate: string;
  /** YYYY-MM（VarChar(7)） */
  period: string;
  status: SalesPaymentStatus | string;
  confirmedById: string | null;
  /** Timestamptz(6)；可能为 null（未确认）
   */
  confirmedAt: string | null;
  remark: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalesCommission {
  id: string;
  employeeId: string;
  paymentId: string;
  productId: string;
  /** Decimal(12,2) — 即回款金额 */
  baseAmount: string | number;
  /** Decimal(5,4) — 提成比例 */
  commissionRate: string | number;
  /** Decimal(5,4) — 完成率上浮；D5 默认 0 */
  targetBonusRate: string | number;
  /** Decimal(12,2) — 实发金额 */
  finalAmount: string | number;
  period: string;
  status: SalesCommissionStatus | string;
  /** VarChar(64) — 非 UUID，是 actorId 序列化为字符串 */
  calculatedBy: string;
  calculatedAt: string;
  paidAt: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============ 请求 / 查询类型 ============

export interface CreateProductRequest {
  code: string;
  name: string;
  category: SalesProductCategory;
  /** 百分比数字（如 5 表示 5%）；可选，不传由后端走 rate_tiers 兜底 */
  baseRatePercent?: number;
  description?: string;
}

export interface UpdateProductRequest {
  name?: string;
  category?: SalesProductCategory;
  /** 百分比数字 */
  baseRatePercent?: number;
  description?: string;
  /** 传 'archived' 即为归档；后端 PATCH 同接口处理 */
  status?: SalesProductStatus;
}

export interface ListProductFilter {
  category?: SalesProductCategory;
  status?: SalesProductStatus;
  page?: number;
  pageSize?: number;
}

export interface CreatePaymentRequest {
  employeeId: string;
  productId: string;
  customerName: string;
  amount: number;
  /** YYYY-MM-DD；后端 parsePaymentDate 接受 string|Date */
  paymentDate: string;
  period?: string;
  remark?: string;
}

export interface ConfirmPaymentRequest {
  remark?: string;
}

export interface ListPaymentFilter {
  employeeId?: string;
  productId?: string;
  status?: SalesPaymentStatus;
  period?: string;
  page?: number;
  pageSize?: number;
}

export interface CalculateCommissionRequest {
  paymentId: string;
}

export interface ListCommissionFilter {
  employeeId?: string;
  productId?: string;
  status?: SalesCommissionStatus;
  period?: string;
  page?: number;
  pageSize?: number;
}

// ============ 状态映射（页面 + 测试共用）============

export interface SalesTagInfo {
  label: string;
  type: 'success' | 'warning' | 'info' | 'danger';
}

export const SALES_PRODUCT_STATUS_MAP: Record<SalesProductStatus, SalesTagInfo> = {
  active: { label: '启用', type: 'success' },
  archived: { label: '已归档', type: 'warning' },
};

export const SALES_PAYMENT_STATUS_MAP: Record<SalesPaymentStatus, SalesTagInfo> = {
  draft: { label: '待确认', type: 'info' },
  confirmed: { label: '已确认', type: 'success' },
  cancelled: { label: '已取消', type: 'warning' },
};

export const SALES_COMMISSION_STATUS_MAP: Record<SalesCommissionStatus, SalesTagInfo> = {
  calculated: { label: '已计算', type: 'warning' },
  paid: { label: '已发放', type: 'success' },
  cancelled: { label: '已取消', type: 'info' },
};

export const SALES_PRODUCT_CATEGORY_MAP: Record<SalesProductCategory, string> = {
  product: '产品',
  service: '服务',
  training: '培训',
};

export function salesProductStatusInfo(status: string | null | undefined): SalesTagInfo {
  if (!status) return { label: '—', type: 'info' };
  return SALES_PRODUCT_STATUS_MAP[status as SalesProductStatus] ?? { label: status, type: 'info' };
}

export function salesPaymentStatusInfo(status: string | null | undefined): SalesTagInfo {
  if (!status) return { label: '—', type: 'info' };
  return SALES_PAYMENT_STATUS_MAP[status as SalesPaymentStatus] ?? { label: status, type: 'info' };
}

export function salesCommissionStatusInfo(status: string | null | undefined): SalesTagInfo {
  if (!status) return { label: '—', type: 'info' };
  return SALES_COMMISSION_STATUS_MAP[status as SalesCommissionStatus] ?? { label: status, type: 'info' };
}

// ============ 百分比 ↔ 小数 转换（§5.2）============

/** 小数 → 百分比：0.05 → 5；4 位精度避免浮点 */
export function rateToPercent(rate: string | number | null | undefined): number | null {
  if (rate == null || rate === '') return null;
  const n = typeof rate === 'number' ? rate : Number(rate);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10000) / 100;
}

/** 百分比 → 小数：5 → 0.05；后端 baseRate 上限 0.5，对应百分比 50 */
export function percentToRate(percent: string | number | null | undefined): number | null {
  if (percent == null || percent === '' || Number.isNaN(Number(percent))) return null;
  const n = typeof percent === 'number' ? percent : Number(percent);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 10000;
}

/** 百分比显示（如 '5%'）；rate 为 null 显示 '—' */
export function rateLabel(rate: string | number | null | undefined): string {
  const p = rateToPercent(rate);
  return p == null ? '—' : `${p}%`;
}

// ============ 权限辅助（页面 + 测试共用）============

export type SalesAction =
  | 'product:create'
  | 'product:update'
  | 'payment:create'
  | 'payment:confirm'
  | 'commission:calculate';

const ACTION_PERMISSION: Record<SalesAction, string> = {
  'product:create': 'performance:sales:product:write',
  'product:update': 'performance:sales:product:write',
  'payment:create': 'performance:sales:payment:write',
  'payment:confirm': 'performance:sales:payment:confirm',
  'commission:calculate': 'performance:sales:commission:write',
};

/** 判断当前用户是否可执行销售动作 */
export function canSalesAction(action: SalesAction, user: UserInfo | null): boolean {
  return hasPermission(user, ACTION_PERMISSION[action]);
}

// ============ 分页解包（与 D1 一致）============

/** GET /sales/{products|payments|commissions} → 解包为 PaginatedResponse<T> */
export function unwrapSalesList<T>(raw: unknown): PaginatedResponse<T> {
  return unwrapPerformancePage<T>(raw);
}
