// M4-C6: 销售提成 4 维度汇总（只读 D5 commissions，不 import D5/C4 service）| HRMS

import type { Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'commission_summary';
const GROUP_BY_WHITELIST = ['employee', 'department', 'product', 'report'] as const;
const FALLBACK_GROUP_BY = 'employee';
const FALLBACK_FISCAL_START = 1;

export type CommissionGroupBy = (typeof GROUP_BY_WHITELIST)[number];

export interface CommissionSummaryFilter {
  groupBy?: string;
  period?: string;
  quarter?: string;
}

export interface CommissionSummaryItem {
  key: string;
  employeeId?: string;
  employeeName?: string;
  departmentId?: string;
  departmentName?: string;
  employeeCount?: number;
  productId?: string;
  productCode?: string;
  productName?: string;
  category?: string;
  totalAmount: number;
  totalBaseAmount?: number;
  productCount?: number;
  recordCount: number;
  periods: string[];
}

export interface CommissionSummaryResult {
  groupBy: CommissionGroupBy;
  period?: string;
  quarter?: string;
  totalAmount: number;
  items: CommissionSummaryItem[];
}

export interface CommissionEmployeeSummary {
  employeeId: string;
  employeeName: string;
  departmentId: string | null;
  departmentName: string | null;
  totalAmount: number;
  recordCount: number;
  items: Array<{
    commissionId: string;
    period: string;
    productName: string;
    baseAmount: number;
    commissionRate: number;
    finalAmount: number;
  }>;
}

export interface CommissionDepartmentSummary {
  departmentId: string;
  departmentName: string;
  employeeCount: number;
  totalAmount: number;
  recordCount: number;
  items: Array<{
    employeeId: string;
    employeeName: string;
    totalAmount: number;
    recordCount: number;
  }>;
}

interface ActorScope {
  unrestricted: boolean;
  deptId?: string;
  selfEmployeeId?: string;
}

interface PaidCommissionRow {
  id: string;
  employeeId: string;
  productId: string;
  baseAmount: { toString(): string } | number;
  commissionRate: { toString(): string } | number;
  finalAmount: { toString(): string } | number;
  period: string;
  employee: {
    id: string;
    name: string;
    departmentId: string | null;
    department: { id: string; name: string } | null;
  };
  product: {
    id: string;
    code: string;
    name: string;
    category: string;
  };
}

export function toNum(v: { toString(): string } | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v);
}

export function parsePeriodYm(period: string): void {
  if (!/^(\d{4})-(0[1-9]|1[0-2])$/.test(period)) {
    throw new AppError('period 格式错误，应为 YYYY-MM', 400, 73601);
  }
}

export function parseQuarterLabel(quarter: string): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const m = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!m) {
    throw new AppError('quarter 格式错误，应为 YYYY-Q1/Q2/Q3/Q4', 400, 73605);
  }
  return { year: Number(m[1]), quarter: Number(m[2]) as 1 | 2 | 3 | 4 };
}

export async function getFiscalQuarterStart(): Promise<number> {
  try {
    const v = await configService.getValue('salary', 'commission.settlement.fiscal_quarter_start');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : FALLBACK_FISCAL_START;
  } catch {
    // TODO: configs.salary.commission.settlement.fiscal_quarter_start 未配置时 fallback
    return FALLBACK_FISCAL_START;
  }
}

/** 自然年/财年季度 → YYYY-MM 列表（默认 fiscalStart=1） */
export function getQuarterPeriodKeys(
  year: number,
  quarter: 1 | 2 | 3 | 4,
  fiscalStart: number,
): string[] {
  const startMonth = ((fiscalStart - 1 + (quarter - 1) * 3) % 12) + 1;
  const keys: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const raw = startMonth + i;
    const month = ((raw - 1) % 12) + 1;
    const y = raw > 12 ? year + 1 : year;
    keys.push(`${y}-${String(month).padStart(2, '0')}`);
  }
  return keys;
}

export function getQuarterDateRange(
  year: number,
  quarter: 1 | 2 | 3 | 4,
  fiscalStart: number,
): { periodStart: Date; periodEnd: Date } {
  const keys = getQuarterPeriodKeys(year, quarter, fiscalStart);
  const [startY, startM] = keys[0].split('-').map(Number);
  const [endY, endM] = keys[2].split('-').map(Number);
  return {
    periodStart: new Date(Date.UTC(startY, startM - 1, 1)),
    periodEnd: new Date(Date.UTC(endY, endM, 0)),
  };
}

async function getDefaultGroupBy(): Promise<CommissionGroupBy> {
  try {
    const v = await configService.getValue('salary', 'commission.summary.default_group_by');
    if (typeof v === 'string' && (GROUP_BY_WHITELIST as readonly string[]).includes(v)) {
      return v as CommissionGroupBy;
    }
  } catch {
    // TODO: configs.salary.commission.summary.default_group_by 未配置时 fallback
  }
  return FALLBACK_GROUP_BY;
}

async function resolveActorScope(actorId: string): Promise<ActorScope> {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!user) return { unrestricted: true };
  const roleCodes = user.userRoles.map((r) => r.role.code);
  if (roleCodes.includes('admin') || roleCodes.includes('hr') || roleCodes.includes('executive')) {
    return { unrestricted: true };
  }
  const emp = await prisma.employee.findFirst({
    where: { userId: actorId, deletedAt: null },
    select: { id: true, departmentId: true },
  });
  if (roleCodes.includes('dept_head') && emp?.departmentId) {
    return { deptId: emp.departmentId, unrestricted: false };
  }
  if (roleCodes.includes('employee') && emp) {
    return { selfEmployeeId: emp.id, unrestricted: false };
  }
  return { unrestricted: true };
}

function assertGroupBy(groupBy: string): CommissionGroupBy {
  if (!(GROUP_BY_WHITELIST as readonly string[]).includes(groupBy)) {
    throw new AppError('groupBy 非法', 400, 73601);
  }
  return groupBy as CommissionGroupBy;
}

export async function buildPaidWhere(
  filter: { period?: string; quarter?: string },
  extra?: Prisma.PerformanceSalesCommissionWhereInput,
): Promise<Prisma.PerformanceSalesCommissionWhereInput> {
  if (filter.period && filter.quarter) {
    throw new AppError('period 与 quarter 互斥，仅能传一个', 400, 73601);
  }
  const where: Prisma.PerformanceSalesCommissionWhereInput = {
    status: 'paid',
    ...extra,
  };
  if (filter.period) {
    parsePeriodYm(filter.period);
    where.period = filter.period;
  }
  if (filter.quarter) {
    const q = parseQuarterLabel(filter.quarter);
    const fiscal = await getFiscalQuarterStart();
    where.period = { in: getQuarterPeriodKeys(q.year, q.quarter, fiscal) };
  }
  return where;
}

async function loadPaidCommissions(
  where: Prisma.PerformanceSalesCommissionWhereInput,
): Promise<PaidCommissionRow[]> {
  const rows = await prisma.performanceSalesCommission.findMany({
    where,
    include: {
      employee: { include: { department: true } },
      product: true,
    },
  });
  return rows as unknown as PaidCommissionRow[];
}

function applyScopeWhere(
  scope: ActorScope,
  extra?: Prisma.PerformanceSalesCommissionWhereInput,
): Prisma.PerformanceSalesCommissionWhereInput {
  const where: Prisma.PerformanceSalesCommissionWhereInput = { ...extra };
  if (scope.selfEmployeeId) {
    where.employeeId = scope.selfEmployeeId;
  }
  if (scope.deptId) {
    where.employee = { departmentId: scope.deptId };
  }
  return where;
}

function distinctSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function aggregateByEmployee(rows: PaidCommissionRow[]): CommissionSummaryItem[] {
  const map = rows.reduce((acc, row) => {
    const cur = acc.get(row.employeeId) ?? {
      key: row.employeeId,
      employeeId: row.employeeId,
      employeeName: row.employee.name,
      departmentId: row.employee.departmentId ?? undefined,
      departmentName: row.employee.department?.name,
      totalAmount: 0,
      recordCount: 0,
      periods: [],
    };
    cur.totalAmount += toNum(row.finalAmount);
    cur.recordCount += 1;
    cur.periods.push(row.period);
    acc.set(row.employeeId, cur);
    return acc;
  }, new Map<string, CommissionSummaryItem>());
  return [...map.values()].map((item) => ({
    ...item,
    periods: distinctSorted(item.periods),
  }));
}

function aggregateByDepartment(rows: PaidCommissionRow[]): CommissionSummaryItem[] {
  type DeptAgg = CommissionSummaryItem & { employeeIds: Set<string> };
  const map = rows.reduce((acc, row) => {
    const deptId = row.employee.departmentId ?? 'unassigned';
    const cur = acc.get(deptId) ?? {
      key: deptId,
      departmentId: row.employee.departmentId ?? undefined,
      departmentName: row.employee.department?.name ?? '未分配',
      employeeCount: 0,
      totalAmount: 0,
      recordCount: 0,
      periods: [],
      employeeIds: new Set<string>(),
    };
    cur.totalAmount += toNum(row.finalAmount);
    cur.recordCount += 1;
    cur.periods.push(row.period);
    cur.employeeIds.add(row.employeeId);
    acc.set(deptId, cur);
    return acc;
  }, new Map<string, DeptAgg>());
  return [...map.values()].map((item) => ({
    key: item.key,
    departmentId: item.departmentId,
    departmentName: item.departmentName,
    employeeCount: item.employeeIds.size,
    totalAmount: item.totalAmount,
    recordCount: item.recordCount,
    periods: distinctSorted(item.periods),
  }));
}

function aggregateByProduct(rows: PaidCommissionRow[]): CommissionSummaryItem[] {
  const map = rows.reduce((acc, row) => {
    const cur = acc.get(row.productId) ?? {
      key: row.productId,
      productId: row.productId,
      productCode: row.product.code,
      productName: row.product.name,
      category: row.product.category,
      totalAmount: 0,
      recordCount: 0,
      periods: [],
    };
    cur.totalAmount += toNum(row.finalAmount);
    cur.recordCount += 1;
    cur.periods.push(row.period);
    acc.set(row.productId, cur);
    return acc;
  }, new Map<string, CommissionSummaryItem>());
  return [...map.values()].map((item) => ({
    ...item,
    periods: distinctSorted(item.periods),
  }));
}

function aggregateReport(rows: PaidCommissionRow[]): CommissionSummaryItem[] {
  const employeeIds = new Set(rows.map((r) => r.employeeId));
  const productIds = new Set(rows.map((r) => r.productId));
  const totalAmount = rows.reduce((s, r) => s + toNum(r.finalAmount), 0);
  const totalBaseAmount = rows.reduce((s, r) => s + toNum(r.baseAmount), 0);
  return [{
    key: 'report',
    totalAmount,
    totalBaseAmount,
    recordCount: rows.length,
    employeeCount: employeeIds.size,
    productCount: productIds.size,
    periods: distinctSorted(rows.map((r) => r.period)),
  }];
}

/**
 * 4 维度汇总查询（员工 / 部门 / 产品 / 报表）
 * @param actorId 操作人 ID（hr/admin/executive/dept_head/employee）
 * @param filter { groupBy, period?, quarter? } period 与 quarter 互斥
 * @returns { groupBy, period, quarter, totalAmount, items }
 * @throws AppError(400, 73601) groupBy 非法 / period 与 quarter 同时传入 / 查询失败
 * @throws AppError(400, 73605) quarter 格式错（不是 YYYY-Q1/Q2/Q3/Q4）
 * 校验链：
 *  1. groupBy ∈ whitelist，默认走 configs.salary.commission.summary.default_group_by
 *  2. period（YYYY-MM）与 quarter（YYYY-Qn）互斥
 *  3. 只读 D5 performance_sales_commissions（status=paid），沿用 D5 finalAmount，不重算
 *  4. employee 仅看自己；dept_head 仅看本部门
 *  5. 按 groupBy 聚合后写 audit（report 维度写 COMMISSION_REPORT_QUERY）
 * D5 联动：仅 prisma 读表，不 import D5 service，不改 status/paidAt
 */
export async function getSummary(
  actorId: string,
  filter: CommissionSummaryFilter,
): Promise<CommissionSummaryResult> {
  try {
    const groupBy = assertGroupBy(filter.groupBy ?? await getDefaultGroupBy());
    const scope = await resolveActorScope(actorId);
    const where = applyScopeWhere(
      scope,
      await buildPaidWhere({ period: filter.period, quarter: filter.quarter }),
    );
    const rows = await loadPaidCommissions(where);
    let items: CommissionSummaryItem[];
    if (groupBy === 'employee') items = aggregateByEmployee(rows);
    else if (groupBy === 'department') items = aggregateByDepartment(rows);
    else if (groupBy === 'product') items = aggregateByProduct(rows);
    else items = aggregateReport(rows);

    const totalAmount = rows.reduce((s, r) => s + toNum(r.finalAmount), 0);
    const result: CommissionSummaryResult = {
      groupBy,
      period: filter.period,
      quarter: filter.quarter,
      totalAmount,
      items,
    };
    const action = groupBy === 'report' ? 'COMMISSION_REPORT_QUERY' : 'COMMISSION_SUMMARY_QUERY';
    const resourceType = groupBy === 'report' ? 'commission_report' : RESOURCE_TYPE;
    auditService.auditLog({
      userId: actorId,
      actorType: 'USER',
      action,
      resourceType,
      description: '销售提成汇总查询',
      newValue: {
        groupBy, period: filter.period, quarter: filter.quarter, recordCount: rows.length,
      },
    });
    return result;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('提成汇总查询失败', 400, 73601);
  }
}

/**
 * 员工维度汇总（含姓名 + 部门 + 提成明细）
 * @param actorId 操作人 ID
 * @param employeeId 员工 ID
 * @param filter { period?, quarter? }
 * @returns 员工汇总 + items 明细（沿用 D5 finalAmount）
 * @throws AppError(404) 员工不存在
 * @throws AppError(403) employee 仅看自己 / dept_head 仅看本部门
 * @throws AppError(400, 73601) 查询失败
 * @throws AppError(400, 73605) quarter 格式错
 * 校验链：查 employee → 权限 → 只读 D5 paid commissions → 汇总 → audit
 */
export async function getEmployeeSummary(
  actorId: string,
  employeeId: string,
  filter?: { period?: string; quarter?: string },
): Promise<CommissionEmployeeSummary> {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      include: { department: true },
    });
    if (!employee) {
      throw new AppError('员工不存在', 404);
    }
    const scope = await resolveActorScope(actorId);
    if (scope.selfEmployeeId && scope.selfEmployeeId !== employeeId) {
      throw new AppError('无权查看他人提成', 403);
    }
    if (scope.deptId && employee.departmentId !== scope.deptId) {
      throw new AppError('无权查看其他部门提成', 403);
    }
    const where = await buildPaidWhere(filter ?? {}, { employeeId });
    const rows = await loadPaidCommissions(where);
    const totalAmount = rows.reduce((s, r) => s + toNum(r.finalAmount), 0);
    const result: CommissionEmployeeSummary = {
      employeeId: employee.id,
      employeeName: employee.name,
      departmentId: employee.departmentId,
      departmentName: employee.department?.name ?? null,
      totalAmount,
      recordCount: rows.length,
      items: rows.map((r) => ({
        commissionId: r.id,
        period: r.period,
        productName: r.product.name,
        baseAmount: toNum(r.baseAmount),
        commissionRate: toNum(r.commissionRate),
        finalAmount: toNum(r.finalAmount),
      })),
    };
    auditService.auditLog({
      userId: actorId,
      actorType: 'USER',
      action: 'COMMISSION_SUMMARY_QUERY',
      resourceType: RESOURCE_TYPE,
      resourceId: employeeId,
      description: '员工提成汇总查询',
      newValue: {
        employeeId,
        recordCount: rows.length,
        period: filter?.period,
        quarter: filter?.quarter,
      },
    });
    return result;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('提成汇总查询失败', 400, 73601);
  }
}

/**
 * 部门维度汇总（含部门名称 + 员工数 + 按员工聚合）
 * @param actorId 操作人 ID
 * @param departmentId 部门 ID
 * @param filter { period?, quarter? }
 * @returns 部门汇总 + 按员工 items
 * @throws AppError(404) 部门不存在
 * @throws AppError(403) dept_head 仅看本部门
 * @throws AppError(400, 73601) 查询失败
 * @throws AppError(400, 73605) quarter 格式错
 * 校验链：查 department → 权限 → 只读 D5 paid commissions（employee.departmentId）→ 聚合 → audit
 */
export async function getDepartmentSummary(
  actorId: string,
  departmentId: string,
  filter?: { period?: string; quarter?: string },
): Promise<CommissionDepartmentSummary> {
  try {
    const department = await prisma.department.findFirst({
      where: { id: departmentId, deletedAt: null },
    });
    if (!department) {
      throw new AppError('部门不存在', 404);
    }
    const scope = await resolveActorScope(actorId);
    if (scope.deptId && scope.deptId !== departmentId) {
      throw new AppError('无权查看其他部门提成', 403);
    }
    if (scope.selfEmployeeId) {
      throw new AppError('无权查看部门提成汇总', 403);
    }
    const where = applyScopeWhere(
      scope,
      await buildPaidWhere(filter ?? {}, { employee: { departmentId } }),
    );
    const rows = await loadPaidCommissions(where);
    const byEmp = aggregateByEmployee(rows);
    const result: CommissionDepartmentSummary = {
      departmentId: department.id,
      departmentName: department.name,
      employeeCount: byEmp.length,
      totalAmount: rows.reduce((s, r) => s + toNum(r.finalAmount), 0),
      recordCount: rows.length,
      items: byEmp.map((i) => ({
        employeeId: i.employeeId ?? i.key,
        employeeName: i.employeeName ?? '',
        totalAmount: i.totalAmount,
        recordCount: i.recordCount,
      })),
    };
    auditService.auditLog({
      userId: actorId,
      actorType: 'USER',
      action: 'COMMISSION_SUMMARY_QUERY',
      resourceType: RESOURCE_TYPE,
      resourceId: departmentId,
      description: '部门提成汇总查询',
      newValue: {
        departmentId,
        recordCount: rows.length,
        period: filter?.period,
        quarter: filter?.quarter,
      },
    });
    return result;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('提成汇总查询失败', 400, 73601);
  }
}
