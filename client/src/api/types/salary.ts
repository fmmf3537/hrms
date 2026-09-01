/**
 * 薪酬核算 API 类型（M5-2-C1）
 * @module api/types/salary
 * @description 对齐 Prisma SalaryGrade / EmployeeSalaryPlan / 社保公积金 / 个税计算结果
 * 列表分页在 data 内层 { items, total, page, pageSize }，与 unwrapPage 不同
 * 金额为 Decimal JSON（string | number）；员工档案无 baseSalary 字段
 */

import type { ApiResponse, PaginatedResponse } from '@/api/types';

export type SalaryTagType = 'success' | 'warning' | 'info' | 'danger';

/** V1.2 §二.4.1 序列：高管 M / 技术 T / 生产 P / 销售 S / 职能 A */
export type SalarySequence = 'M' | 'T' | 'P' | 'S' | 'A';

export type GradeStatus = 'active' | 'archived';

export type PlanStatus = 'active' | 'inactive' | 'superseded';

export type CityCode = 'xi_an' | 'bei_jing' | 'si_chuan';

export type InsuranceType =
  | 'pension'
  | 'medical'
  | 'unemployment'
  | 'work_injury'
  | 'maternity';

export type RegistrationStatus = 'active' | 'inactive';

export const SALARY_STATUS_LABELS: Record<string, string> = {
  active: '生效',
  archived: '已归档',
  inactive: '已停用',
  superseded: '已替代',
};

export const SEQUENCE_LABELS: Record<SalarySequence, string> = {
  M: '管理序列',
  T: '技术序列',
  P: '生产序列',
  S: '销售序列',
  A: '职能序列',
};

export const CITY_LABELS: Record<CityCode, string> = {
  xi_an: '西安',
  bei_jing: '北京',
  si_chuan: '四川',
};

export const INSURANCE_TYPE_LABELS: Record<InsuranceType, string> = {
  pension: '养老',
  medical: '医疗',
  unemployment: '失业',
  work_injury: '工伤',
  maternity: '生育',
};

export function salaryStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '—';
  }
  return SALARY_STATUS_LABELS[status] ?? status;
}

export function salaryTagType(status: string | null | undefined): SalaryTagType {
  if (status === 'active') {
    return 'success';
  }
  if (status === 'archived' || status === 'inactive') {
    return 'danger';
  }
  if (status === 'superseded') {
    return 'warning';
  }
  return 'info';
}

/** 后端 0-1 小数 → 百分比数值 */
export function rateToPercent(rate: number | string | null | undefined): number {
  const n = typeof rate === 'number' ? rate : Number(rate);
  if (Number.isNaN(n)) {
    return 0;
  }
  return Math.round(n * 10000) / 100;
}

/** 百分比数值 → 后端 0-1 小数 */
export function percentToRate(percent: number): number {
  return Math.round(percent * 100) / 10000;
}

export function formatRatePercent(rate: number | string | null | undefined): string {
  return `${rateToPercent(rate)}%`;
}

/**
 * C1-C3 list 返回 { success, data: { items, total, page, pageSize } }
 * 与 organization.unwrapPage（data 为数组、total 与信封同级）不一致，本地解包
 */
export function unwrapSalaryPage<T>(raw: unknown): PaginatedResponse<T> {
  if (!raw || typeof raw !== 'object') {
    throw new Error('接口响应格式异常');
  }
  const envelope = raw as ApiResponse<unknown> & {
    items?: T[];
    total?: number;
    page?: number;
    pageSize?: number;
  };
  const inner = envelope.data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner) && 'items' in inner) {
    const page = inner as {
      items?: T[];
      total?: number;
      page?: number;
      pageSize?: number;
    };
    const items = Array.isArray(page.items) ? page.items : [];
    return {
      items,
      total: typeof page.total === 'number' ? page.total : items.length,
      page: typeof page.page === 'number' ? page.page : 1,
      pageSize: typeof page.pageSize === 'number' ? page.pageSize : items.length,
    };
  }
  if (Array.isArray(inner)) {
    return {
      items: inner as T[],
      total: typeof envelope.total === 'number' ? envelope.total : inner.length,
      page: typeof envelope.page === 'number' ? envelope.page : 1,
      pageSize: typeof envelope.pageSize === 'number' ? envelope.pageSize : inner.length,
    };
  }
  return {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  };
}

/** V1.2 §四.8 C1 薪级 */
export interface SalaryGrade {
  id: string;
  sequence: SalarySequence | string;
  gradeCode: string;
  name: string;
  minBaseSalary: string | number;
  maxBaseSalary: string | number;
  minPerformanceBase: string | number;
  maxPerformanceBase: string | number;
  status: GradeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSalaryGradeRequest {
  sequence: SalarySequence;
  gradeCode: string;
  name: string;
  minBaseSalary: number;
  maxBaseSalary: number;
  minPerformanceBase: number;
  maxPerformanceBase: number;
}

export interface ListSalaryGradeFilter {
  sequence?: SalarySequence;
  status?: GradeStatus;
  page?: number;
  pageSize?: number;
}

/** V1.2 §四.8 C1 薪档（档级 1-7） */
export interface SalaryGradeLevel {
  id: string;
  gradeId: string;
  level: number;
  baseSalary: string | number;
  performanceBase: string | number;
  status: GradeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGradeLevelRequest {
  gradeId: string;
  level: number;
  baseSalary: number;
  performanceBase: number;
}

export interface ListGradeLevelFilter {
  gradeId?: string;
  status?: GradeStatus;
  page?: number;
  pageSize?: number;
}

/** V1.2 §四.8 C1 员工薪酬方案（不写 employees.baseSalary） */
export interface SalaryPlan {
  id: string;
  employeeId: string;
  gradeId: string;
  levelId: string;
  baseSalary: string | number;
  performanceBase: string | number;
  allowance?: string | number | null;
  welfare?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSalaryPlanRequest {
  employeeId: string;
  gradeId: string;
  levelId: string;
  baseSalary: number;
  performanceBase: number;
  allowance?: number;
  welfare?: string;
  effectiveFrom?: string;
}

export interface DeactivatePlanRequest {
  effectiveTo: string;
  reason?: string;
}

export interface ListSalaryPlanFilter {
  employeeId?: string;
  status?: PlanStatus;
  effectiveFrom?: string;
  page?: number;
  pageSize?: number;
}

/** V1.2 §四.8 C2 社保方案 */
export interface SocialInsuranceScheme {
  id: string;
  city: CityCode | string;
  insuranceType: InsuranceType | string;
  companyRate: string | number;
  personalRate: string | number;
  baseMin: string | number;
  baseMax: string | number;
  baseAdjustmentMonth: number;
  status: GradeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSocialSchemeRequest {
  city: CityCode;
  insuranceType: InsuranceType;
  companyRate: number;
  personalRate: number;
  baseMin: number;
  baseMax: number;
  baseAdjustmentMonth?: number;
}

export type UpdateSocialSchemeRequest = Partial<
  Omit<CreateSocialSchemeRequest, 'city' | 'insuranceType'>
>;

export interface ListSocialSchemeFilter {
  city?: CityCode;
  insuranceType?: InsuranceType;
  status?: GradeStatus;
  page?: number;
  pageSize?: number;
}

/** V1.2 §四.8 C2 公积金方案 */
export interface HousingFundScheme {
  id: string;
  city: CityCode | string;
  companyRate: string | number;
  personalRate: string | number;
  baseMin: string | number;
  baseMax: string | number;
  status: GradeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHousingFundRequest {
  city: CityCode;
  companyRate: number;
  personalRate: number;
  baseMin: number;
  baseMax: number;
}

export type UpdateHousingFundRequest = Partial<Omit<CreateHousingFundRequest, 'city'>>;

export interface ListHousingFundFilter {
  city?: CityCode;
  status?: GradeStatus;
  page?: number;
  pageSize?: number;
}

/** V1.2 §四.8 C2 员工参保登记（baseSalary 在登记表，不是 employees 字段） */
export interface EmployeeInsuranceRegistration {
  id: string;
  employeeId: string;
  city: CityCode | string;
  socialInsuranceSchemeId?: string | null;
  housingFundSchemeId?: string | null;
  baseSalary: string | number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: RegistrationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmployeeInsuranceRequest {
  employeeId: string;
  city: CityCode;
  socialInsuranceSchemeId?: string;
  housingFundSchemeId?: string;
  baseSalary?: number;
  effectiveFrom?: string;
}

export interface UpdateEmployeeInsuranceRequest {
  effectiveTo?: string;
  baseSalary?: number;
}

export interface ListEmployeeInsuranceFilter {
  employeeId?: string;
  city?: CityCode;
  status?: RegistrationStatus;
  page?: number;
  pageSize?: number;
}

/** V1.2 §四.8 C3 月度累计预扣 */
export interface TaxCalculateRequest {
  employeeId: string;
  period: string;
  baseAmount: number;
  cumulativePrepaid?: number;
}

export interface TaxBatchRequest {
  period: string;
  deptIds?: string[];
}

export interface TaxYearEndBonusRequest {
  employeeId: string;
  bonusAmount: number;
  isAnnual: true;
}

export interface TaxLaborIncomeRequest {
  employeeId: string;
  incomeAmount: number;
}

export interface TaxBracketRef {
  rate: number;
  quickDeduction: number;
}

export interface TaxMonthlyResult {
  employeeId: string;
  period: string;
  baseAmount: number;
  taxableIncome: number;
  bracket: TaxBracketRef;
  taxAmount: number;
  cumulativePrepaid: number;
  taxType: 'monthly';
}

export interface TaxBatchResult {
  succeeded: TaxMonthlyResult[];
  failed: Array<{ employeeId: string; error: string }>;
}

export interface TaxYearEndBonusResult {
  employeeId: string;
  bonusAmount: number;
  monthlyEquivalent: number;
  bracket: TaxBracketRef;
  taxAmount: number;
  taxType: 'year_end_bonus';
  year: number;
}

export interface TaxLaborIncomeResult {
  employeeId: string;
  incomeAmount: number;
  deduction: number;
  taxableIncome: number;
  bracket: TaxBracketRef;
  taxAmount: number;
  taxType: 'labor_income';
  year: number;
}

export interface TaxHistoryItem {
  action: string;
  createdAt: string;
  details: Record<string, unknown>;
}

export interface TaxAnnualSummary {
  employeeId: string;
  year: number;
  monthlyTaxTotal: number;
  yearEndBonusTaxTotal: number;
  laborIncomeTaxTotal: number;
  taxTotal: number;
  items: TaxHistoryItem[];
}

export interface TaxHistoryQuery {
  employeeId: string;
  year: number;
}

export interface TaxAnnualQuery {
  employeeId: string;
  year: number;
  settle?: boolean;
}
