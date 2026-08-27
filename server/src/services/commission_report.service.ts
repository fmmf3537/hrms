// M4-C6: 销售提成报表（复用 D5 paid commissions 聚合；不调 AI / 不发邮件 / mock 模式）| HRMS

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import {
  buildPaidWhere,
  toNum,
} from './commission_summary.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'commission_report';
const GROUP_BY_WHITELIST = ['employee', 'department', 'product', 'overall'] as const;
const FALLBACK_FIELDS = ['totalAmount', 'recordCount', 'employeeCount'];

export type ReportGroupBy = (typeof GROUP_BY_WHITELIST)[number];

export interface CommissionReportFilter {
  groupBy?: string;
  period?: string;
  quarter?: string;
  summaryFields?: string[];
}

export interface CommissionReportItem {
  key: string;
  label: string;
  totalAmount: number;
  recordCount: number;
  employeeCount?: number;
}

export interface CommissionReport {
  filter: { period?: string; quarter?: string };
  groupBy: ReportGroupBy;
  totalAmount: number;
  summary: Record<string, number | string[]>;
  items: CommissionReportItem[];
  mockMode: true;
}

interface PaidRow {
  id: string;
  employeeId: string;
  productId: string;
  baseAmount: { toString(): string } | number;
  finalAmount: { toString(): string } | number;
  period: string;
  employee: {
    id: string;
    name: string;
    departmentId: string | null;
    department: { id: string; name: string } | null;
  };
  product: { id: string; code: string; name: string; category: string };
}

async function getSummaryFields(override?: string[]): Promise<string[]> {
  if (override && override.length > 0) return override;
  try {
    const v = await configService.getValue('salary', 'commission.report.summary_fields');
    if (Array.isArray(v)) {
      const fields = v.filter((x): x is string => typeof x === 'string');
      if (fields.length > 0) return fields;
    }
  } catch {
    // TODO: configs.salary.commission.report.summary_fields 未配置时 fallback
  }
  return FALLBACK_FIELDS;
}

async function assertMockMode(): Promise<void> {
  try {
    const v = await configService.getValue('salary', 'commission.settlement.mock_mode');
    if (v === false) {
      throw new AppError('C6 强制 mock 模式', 400, 73601);
    }
  } catch (err) {
    if (err instanceof AppError && err.code === 73601 && err.message === 'C6 强制 mock 模式') throw err;
    // TODO: configs.salary.commission.settlement.mock_mode 未配置时视为 true
  }
}

function assertGroupBy(groupBy: string): ReportGroupBy {
  if (!(GROUP_BY_WHITELIST as readonly string[]).includes(groupBy)) {
    throw new AppError('groupBy 非法', 400, 73601);
  }
  return groupBy as ReportGroupBy;
}

function distinctCount(values: string[]): number {
  return new Set(values).size;
}

function buildItems(groupBy: ReportGroupBy, rows: PaidRow[]): CommissionReportItem[] {
  if (groupBy === 'overall') {
    return [{
      key: 'overall',
      label: '全部',
      totalAmount: rows.reduce((s, r) => s + toNum(r.finalAmount), 0),
      recordCount: rows.length,
      employeeCount: distinctCount(rows.map((r) => r.employeeId)),
    }];
  }
  const map = rows.reduce((acc, row) => {
    let key = row.employeeId;
    let label = row.employee.name;
    if (groupBy === 'department') {
      key = row.employee.departmentId ?? 'unassigned';
      label = row.employee.department?.name ?? '未分配';
    } else if (groupBy === 'product') {
      key = row.productId;
      label = `${row.product.code} ${row.product.name}`;
    }
    const cur = acc.get(key) ?? {
      key,
      label,
      totalAmount: 0,
      recordCount: 0,
      emp: new Set<string>(),
    };
    cur.totalAmount += toNum(row.finalAmount);
    cur.recordCount += 1;
    cur.emp.add(row.employeeId);
    acc.set(key, cur);
    return acc;
  }, new Map<string, CommissionReportItem & { emp: Set<string> }>());
  return [...map.values()].map((item) => ({
    key: item.key,
    label: item.label,
    totalAmount: item.totalAmount,
    recordCount: item.recordCount,
    employeeCount: item.emp.size,
  }));
}

/**
 * 销售提成报表（按维度 / 期间 / 汇总字段）
 * @param actorId 操作人 ID
 * @param filter { period?, quarter?, groupBy?: employee|department|product|overall, summaryFields? }
 * @returns { filter, groupBy, totalAmount, summary, items, mockMode: true }
 * @throws AppError(400, 73601) groupBy 非法 / 查询失败
 * @throws AppError(400, 73605) quarter 格式错
 * 校验链：
 *  1. groupBy 默认 overall；period 与 quarter 互斥（复用 buildPaidWhere）
 *  2. summaryFields 走 configs.salary.commission.report.summary_fields
 *  3. 只读 D5 paid commissions，沿用 D5 公式结果，不重算
 *  4. mockMode: true，不联动 C4，不调 M0.5-5 AI，不发邮件
 *  5. audit COMMISSION_REPORT_QUERY
 */
export async function getReport(
  actorId: string,
  filter: CommissionReportFilter,
): Promise<CommissionReport> {
  try {
    await assertMockMode();
    const groupBy = assertGroupBy(filter.groupBy ?? 'overall');
    const summaryFields = await getSummaryFields(filter.summaryFields);
    const where = await buildPaidWhere({ period: filter.period, quarter: filter.quarter });
    const rows = await prisma.performanceSalesCommission.findMany({
      where,
      include: {
        employee: { include: { department: true } },
        product: true,
      },
    }) as unknown as PaidRow[];

    const totalAmount = rows.reduce((s, r) => s + toNum(r.finalAmount), 0);
    const totalBaseAmount = rows.reduce((s, r) => s + toNum(r.baseAmount), 0);
    const recordCount = rows.length;
    const employeeCount = distinctCount(rows.map((r) => r.employeeId));
    const productCount = distinctCount(rows.map((r) => r.productId));
    const periods = [...new Set(rows.map((r) => r.period))].sort();

    const allSummary: Record<string, number | string[]> = {
      totalAmount,
      totalBaseAmount,
      recordCount,
      employeeCount,
      productCount,
      periods,
    };
    const summary = Object.fromEntries(
      summaryFields
        .filter((field) => field in allSummary)
        .map((field) => [field, allSummary[field]]),
    );

    const result: CommissionReport = {
      filter: { period: filter.period, quarter: filter.quarter },
      groupBy,
      totalAmount,
      summary,
      items: buildItems(groupBy, rows),
      mockMode: true,
    };
    auditService.auditLog({
      userId: actorId,
      actorType: 'USER',
      action: 'COMMISSION_REPORT_QUERY',
      resourceType: RESOURCE_TYPE,
      description: '销售提成报表查询',
      newValue: {
        groupBy,
        period: filter.period,
        quarter: filter.quarter,
        summaryFields,
        totalAmount,
        recordCount,
        mockMode: true,
      },
    });
    return result;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('提成报表查询失败', 400, 73601);
  }
}
