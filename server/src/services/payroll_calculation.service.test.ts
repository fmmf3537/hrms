// M4-C4: payroll_calculation.service 单元测试
/* eslint-disable import/first, import/order */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-call */

import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  employeeFindFirst: vi.fn(),
  employeeFindMany: vi.fn(),
  planFindFirst: vi.fn(),
  regFindFirst: vi.fn(),
  perfFindFirst: vi.fn(),
  coeffFindFirst: vi.fn(),
  otFindMany: vi.fn(),
  leaveFindMany: vi.fn(),
  attFindMany: vi.fn(),
  tripFindMany: vi.fn(),
  socialFindMany: vi.fn(),
  fundFindFirst: vi.fn(),
  payslipFindFirst: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
  calculateMonthlyTax: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: { findFirst: mocks.employeeFindFirst, findMany: mocks.employeeFindMany },
    employeeSalaryPlan: { findFirst: mocks.planFindFirst },
    employeeInsuranceRegistration: { findFirst: mocks.regFindFirst },
    performanceRecord: { findFirst: mocks.perfFindFirst },
    performanceCoefficient: { findFirst: mocks.coeffFindFirst },
    overtimeRequest: { findMany: mocks.otFindMany },
    leaveRequest: { findMany: mocks.leaveFindMany },
    attendanceRecord: { findMany: mocks.attFindMany },
    businessTrip: { findMany: mocks.tripFindMany },
    socialInsuranceScheme: { findMany: mocks.socialFindMany },
    housingFundScheme: { findFirst: mocks.fundFindFirst },
    payslip: { findFirst: mocks.payslipFindFirst },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

vi.mock('./tax_calculation.service', () => ({
  calculateMonthlyTax: mocks.calculateMonthlyTax,
}));

import * as calc from './payroll_calculation.service';

const ACTOR = 'hr-1';
const EMP = 'emp-1';

function defaultPlan() {
  return {
    baseSalary: 10000, performanceBase: 0, allowance: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date(2026, 8, 5) });
  mocks.getValue.mockResolvedValue({ absolute_diff: 1000, percentage_diff: 0.1 });
  mocks.employeeFindFirst.mockResolvedValue({ id: EMP });
  mocks.planFindFirst.mockResolvedValue(defaultPlan());
  mocks.regFindFirst.mockResolvedValue({
    city: 'xi_an',
    baseSalary: 10000,
    housingFundScheme: {
      personalRate: 0.03, baseMin: 4500, baseMax: 24000,
    },
  });
  mocks.perfFindFirst.mockResolvedValue({ finalGrade: 'B' });
  mocks.coeffFindFirst.mockResolvedValue({ coefficient: 1 });
  mocks.otFindMany.mockResolvedValue([]);
  mocks.leaveFindMany.mockResolvedValue([]);
  mocks.attFindMany.mockResolvedValue([]);
  mocks.tripFindMany.mockResolvedValue([]);
  mocks.socialFindMany.mockResolvedValue([
    {
      personalRate: 0.08, baseMin: 4500, baseMax: 24000,
    },
  ]);
  mocks.fundFindFirst.mockResolvedValue({
    personalRate: 0.03, baseMin: 4500, baseMax: 24000,
  });
  mocks.payslipFindFirst.mockResolvedValue(null);
  mocks.calculateMonthlyTax.mockResolvedValue({ taxAmount: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('payroll_calculation.service calculateSinglePayroll', () => {
  it('正常算薪：base 10000 → 应发 10000 + 应扣 1100 + 实发 8900', async () => {
    const r = await calc.calculateSinglePayroll(ACTOR, { employeeId: EMP, period: '2026-09' });
    expect(r.grossAmount).toBe(10000);
    expect(r.socialInsuranceAmount).toBe(800);
    expect(r.housingFundAmount).toBe(300);
    expect(r.deductionAmount).toBe(1100);
    expect(r.netAmount).toBe(8900);
  });

  it('D 档绩效系数 0 → performanceAmount = 0', async () => {
    mocks.perfFindFirst.mockResolvedValue({ finalGrade: 'D' });
    mocks.coeffFindFirst.mockResolvedValue({ coefficient: 0 });
    mocks.planFindFirst.mockResolvedValue({
      baseSalary: 10000, performanceBase: 5000, allowance: 0,
    });
    const r = await calc.calculateSinglePayroll(ACTOR, { employeeId: EMP, period: '2026-09' });
    expect(r.performanceAmount).toBe(0);
  });

  it('S 档系数 1.5 → 应发 15000', async () => {
    mocks.perfFindFirst.mockResolvedValue({ finalGrade: 'S' });
    mocks.coeffFindFirst.mockResolvedValue({ coefficient: 1.5 });
    mocks.planFindFirst.mockResolvedValue({
      baseSalary: 10000, performanceBase: 10000 / 3, allowance: 0,
    });
    const r = await calc.calculateSinglePayroll(ACTOR, { employeeId: EMP, period: '2026-09' });
    expect(r.performanceAmount).toBe(5000);
    expect(r.grossAmount).toBe(15000);
  });

  it('加班 10h → overtimeAmount = base × 10 / 21.75 / 8 × 1.5', async () => {
    mocks.otFindMany.mockResolvedValue([{ totalHours: 10 }]);
    const r = await calc.calculateSinglePayroll(ACTOR, { employeeId: EMP, period: '2026-09' });
    expect(r.overtimeAmount).toBeCloseTo(((10000 * 10) / 21.75 / 8) * 1.5, 1);
  });

  it('事假 2 天 → absenceAmount = base × 2 / 21.75', async () => {
    mocks.leaveFindMany.mockResolvedValue([{ leaveType: 'personal', totalDays: 2 }]);
    const r = await calc.calculateSinglePayroll(ACTOR, { employeeId: EMP, period: '2026-09' });
    expect(r.absenceAmount).toBeCloseTo((10000 * 2) / 21.75, 1);
  });

  it('社保个人部分按 city 比例计算', async () => {
    const r = await calc.calculateSinglePayroll(ACTOR, { employeeId: EMP, period: '2026-09' });
    expect(r.socialInsuranceAmount).toBe(800);
  });

  it('公积金个人部分按 city 比例计算', async () => {
    const r = await calc.calculateSinglePayroll(ACTOR, { employeeId: EMP, period: '2026-09' });
    expect(r.housingFundAmount).toBe(300);
  });

  it('个税按 C3 算法（实际调 C3 service）', async () => {
    mocks.calculateMonthlyTax.mockResolvedValue({ taxAmount: 150 });
    const r = await calc.calculateSinglePayroll(ACTOR, { employeeId: EMP, period: '2026-09' });
    expect(mocks.calculateMonthlyTax).toHaveBeenCalled();
    expect(r.taxAmount).toBe(150);
  });

  it('employee 无 active plan 抛 73408', async () => {
    mocks.planFindFirst.mockResolvedValue(null);
    await expect(calc.calculateSinglePayroll(ACTOR, {
      employeeId: EMP, period: '2026-09',
    })).rejects.toMatchObject({ code: 73408 });
  });

  it('employee 无 active insurance 抛 73408', async () => {
    mocks.regFindFirst.mockResolvedValue(null);
    await expect(calc.calculateSinglePayroll(ACTOR, {
      employeeId: EMP, period: '2026-09',
    })).rejects.toMatchObject({ code: 73408 });
  });
});
