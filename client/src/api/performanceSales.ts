/**
 * 销售提成 API（M5-2-D4）
 * @module api/performanceSales
 * @description 消费 /api/performance/sales/* 8 端点
 *  - GET    /sales/products              performance:sales:product:read
 *  - POST   /sales/products              performance:sales:product:write
 *  - PATCH  /sales/products/:id          performance:sales:product:write
 *  - GET    /sales/payments              performance:sales:payment:read
 *  - POST   /sales/payments              performance:sales:payment:write
 *  - PATCH  /sales/payments/:id/confirm  performance:sales:payment:confirm
 *  - GET    /sales/commissions           performance:sales:commission:read
 *  - POST   /sales/commissions/calculate performance:sales:commission:write
 *
 * 后端 service：
 *  - performance_sales_product.service.ts
 *  - performance_sales_payment.service.ts
 *  - performance_sales_commission.service.ts
 *
 * 比例字段：前端 baseRatePercent（百分比数字）/ 后端 baseRate（Decimal(5,4) 小数），封装层做转换。
 *
 * @permission 5 角色无 finance（财务确认 hr/admin 代行）
 */
import http from './http';
import { unwrapData } from './types/organization';
import {
  type CalculateCommissionRequest,
  type ConfirmPaymentRequest,
  type CreatePaymentRequest,
  type CreateProductRequest,
  type ListCommissionFilter,
  type ListPaymentFilter,
  type ListProductFilter,
  type SalesCommission,
  type SalesPayment,
  type SalesProduct,
  type UpdateProductRequest,
  percentToRate,
  unwrapSalesList,
} from './types/performanceSales';

export const SALES_PATHS = {
  products: '/performance/sales/products',
  product: (id: string) => `/performance/sales/products/${id}`,
  payments: '/performance/sales/payments',
  confirmPayment: (id: string) => `/performance/sales/payments/${id}/confirm`,
  commissions: '/performance/sales/commissions',
  calculateCommission: '/performance/sales/commissions/calculate',
} as const;

// ============ 产品字典 ============

/** POST /api/performance/sales/products 路 performance:sales:product:write
 *  入参百分比数字 → 转换为 baseRate 小数 */
export async function createProduct(body: CreateProductRequest): Promise<SalesProduct> {
  const wireBody: Record<string, unknown> = {
    code: body.code,
    name: body.name,
    category: body.category,
    description: body.description,
  };
  if (body.baseRatePercent != null) {
    const r = percentToRate(body.baseRatePercent);
    if (r != null) wireBody.baseRate = r;
  }
  const raw = await http.post(SALES_PATHS.products, wireBody);
  return unwrapData<SalesProduct>(raw);
}

/** GET /api/performance/sales/products 路 performance:sales:product:read
 *  分页列表；后端 list 不 include 关联，名称展示靠前端联查（D3 同构模式） */
export async function listProducts(
  filter: ListProductFilter = {},
): Promise<Awaited<ReturnType<typeof unwrapSalesList<SalesProduct>>>> {
  const raw = await http.get(SALES_PATHS.products, { params: filter });
  return unwrapSalesList<SalesProduct>(raw);
}

/** PATCH /api/performance/sales/products/:id 路 performance:sales:product:write
 *  含归档（status='archived'），沿用同一端点；百分比字段按需转换 */
export async function updateProduct(
  id: string,
  body: UpdateProductRequest,
): Promise<SalesProduct> {
  const wireBody: Record<string, unknown> = { ...body };
  if (body.baseRatePercent != null) {
    const r = percentToRate(body.baseRatePercent);
    if (r != null) {
      wireBody.baseRate = r;
      delete wireBody.baseRatePercent;
    }
  }
  const raw = await http.patch(SALES_PATHS.product(id), wireBody);
  return unwrapData<SalesProduct>(raw);
}

// ============ 回款登记 ============

/** POST /api/performance/sales/payments 路 performance:sales:payment:write */
export async function createPayment(body: CreatePaymentRequest): Promise<SalesPayment> {
  const raw = await http.post(SALES_PATHS.payments, body);
  return unwrapData<SalesPayment>(raw);
}

/** GET /api/performance/sales/payments 路 performance:sales:payment:read
 *  列表场景下回款页可调此接口并叠加 status=confirmed 过滤，得到「可触发计算」候选集 */
export async function listPayments(
  filter: ListPaymentFilter = {},
): Promise<Awaited<ReturnType<typeof unwrapSalesList<SalesPayment>>>> {
  const raw = await http.get(SALES_PATHS.payments, { params: filter });
  return unwrapSalesList<SalesPayment>(raw);
}

/** PATCH /api/performance/sales/payments/:id/confirm 路 performance:sales:payment:confirm
 *  后端 confirm 内部根据 configs.performance.sales.commission.calculation_strategy
 *  决定是否自动调 calculateCommission（auto_on_confirm 触发；其他策略仅标记状态）。
 *  本函数不假设策略，提示用户「可在提成页查看计算结果」。 */
export async function confirmPayment(
  id: string,
  body: ConfirmPaymentRequest = {},
): Promise<SalesPayment> {
  const raw = await http.patch(SALES_PATHS.confirmPayment(id), body);
  return unwrapData<SalesPayment>(raw);
}

// ============ 提成 ============

/** GET /api/performance/sales/commissions 路 performance:sales:commission:read */
export async function listCommissions(
  filter: ListCommissionFilter = {},
): Promise<Awaited<ReturnType<typeof unwrapSalesList<SalesCommission>>>> {
  const raw = await http.get(SALES_PATHS.commissions, { params: filter });
  return unwrapSalesList<SalesCommission>(raw);
}

/** POST /api/performance/sales/commissions/calculate 路 performance:sales:commission:write
 *  按 paymentId 触发提成计算（admin/hr/executive 可调）。
 *  后端要求 payment.status === 'confirmed'，否则后端 72805 拒收；前端 Dialog
 *  候选列表强制使用 status=confirmed 过滤，避免无意义请求。 */
export async function calculateCommission(
  body: CalculateCommissionRequest,
): Promise<SalesCommission> {
  const raw = await http.post(SALES_PATHS.calculateCommission, body);
  return unwrapData<SalesCommission>(raw);
}
