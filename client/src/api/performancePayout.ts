/**
 * 绩效奖金（Payout）API（M5-2-D3）
 * @module api/performancePayout
 * @description 消费 /api/performance/payouts* 8 端点
 *  - GET    /payouts/config         performance:payout:read
 *  - PATCH  /payouts/config         performance:payout:write
 *  - POST   /payouts/calculate      performance:payout:calculate（direct/pool 分流在后端）
 *  - POST   /payouts/calculate-pool performance:payout:calculate（单部门）
 *  - POST   /payouts/prepay         performance:payout:settle（**月度** month: YYYY-MM）
 *  - POST   /payouts/settle         performance:payout:settle（**季度** quarter: 1-4）
 *  - GET    /payouts                performance:payout:read（分页 + 权限过滤）
 *  - GET    /payouts/:id            performance:payout:read
 *
 * calculate 函数内部不做 mode 分支，body 原样 POST（direct/pool 由后端路由）
 *
 * 后端 service: performance_payout_config.service.ts + performance_payout.service.ts
 *
 * @permission 5 角色无 finance
 */
import http from './http';
import { unwrapData } from './types/organization';
import {
  type CalculateDeptPoolRequest,
  type CalculatePayoutRequest,
  type Payout,
  type PayoutConfig,
  type PayoutListQuery,
  type PrepayPayoutRequest,
  type SettlePayoutRequest,
  type SettleResult,
  type SwitchPayoutConfigRequest,
  unwrapPayoutList,
} from './types/performancePayout';

export const PAYOUT_PATHS = {
  config: '/performance/payouts/config',
  calculate: '/performance/payouts/calculate',
  calculatePool: '/performance/payouts/calculate-pool',
  prepay: '/performance/payouts/prepay',
  settle: '/performance/payouts/settle',
  list: '/performance/payouts',
  detail: (id: string) => `/performance/payouts/${id}`,
} as const;

// ============ 兑现配置 ============

/** GET /api/performance/payouts/config 路 performance:payout:read */
export async function getPayoutConfig(): Promise<PayoutConfig> {
  const raw = await http.get(PAYOUT_PATHS.config);
  return unwrapData<PayoutConfig>(raw);
}

/** PATCH /api/performance/payouts/config 路 performance:payout:write
 *  切换兑现模式（直乘/部门池）+ 生效时间 + 备注 */
export async function switchPayoutConfig(
  body: SwitchPayoutConfigRequest,
): Promise<PayoutConfig> {
  const raw = await http.patch(PAYOUT_PATHS.config, body);
  return unwrapData<PayoutConfig>(raw);
}

// ============ 奖金计算 ============

/** POST /api/performance/payouts/calculate 路 performance:payout:calculate
 *  奖金计算：mode 分流在后端（direct 必传 employeeId，pool 走 deptIds）
 *  返回结构因 mode 而异：direct → 单条 Payout；pool → Payout[]（前端按 mode 自行处理） */
export async function calculatePayout(
  body: CalculatePayoutRequest,
): Promise<Payout | Payout[]> {
  const raw = await http.post(PAYOUT_PATHS.calculate, body);
  const data = unwrapData<Payout | Payout[]>(raw);
  return data;
}

/** POST /api/performance/payouts/calculate-pool 路 performance:payout:calculate
 *  按部门池计算：deptId + cycleId + month → Payout[] */
export async function calculateDeptPool(
  body: CalculateDeptPoolRequest,
): Promise<Payout[]> {
  const raw = await http.post(PAYOUT_PATHS.calculatePool, body);
  const data = unwrapData<Payout | Payout[]>(raw);
  return Array.isArray(data) ? data : [data];
}

// ============ 预发 / 季度结算 ============

/** POST /api/performance/payouts/prepay 路 performance:payout:settle
 *  预发（**月度** month: YYYY-MM）→ Payout[] */
export async function prepayPayout(body: PrepayPayoutRequest): Promise<Payout[]> {
  const raw = await http.post(PAYOUT_PATHS.prepay, body);
  const data = unwrapData<Payout | Payout[]>(raw);
  return Array.isArray(data) ? data : [data];
}

/** POST /api/performance/payouts/settle 路 performance:payout:settle
 *  季度结算（**quarter: 1-4**）→ SettleResult */
export async function settlePayout(body: SettlePayoutRequest): Promise<SettleResult> {
  const raw = await http.post(PAYOUT_PATHS.settle, body);
  return unwrapData<SettleResult>(raw);
}

// ============ 奖金单列表 / 详情 ============

/** GET /api/performance/payouts 路 performance:payout:read
 *  分页列表：query 含 cycleId/employeeId/mode/status/period/page/pageSize
 *  后端按 RBAC 自动过滤（dept_head 看本部门，employee 看本人） */
export async function listPayouts(
  query: PayoutListQuery = {},
): Promise<Awaited<ReturnType<typeof unwrapPayoutList>>> {
  const raw = await http.get(PAYOUT_PATHS.list, { params: query });
  return unwrapPayoutList(raw);
}

/** GET /api/performance/payouts/:id 路 performance:payout:read
 *  详情（含 employee + cycle） */
export async function getPayout(id: string): Promise<Payout> {
  const raw = await http.get(PAYOUT_PATHS.detail(id));
  return unwrapData<Payout>(raw);
}