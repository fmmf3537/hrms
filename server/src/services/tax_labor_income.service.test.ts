// M4-C3: tax_labor_income.service 单元测试
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
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: {
      findFirst: mocks.employeeFindFirst,
    },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as laborService from './tax_labor_income.service';

const ACTOR = 'hr-1';
const EMP = 'emp-1';
const BRACKETS = [
  {
    minIncome: 0, maxIncome: 20000, rate: 0.20, quickDeduction: 0,
  },
  {
    minIncome: 20000, maxIncome: 50000, rate: 0.30, quickDeduction: 2000,
  },
  {
    minIncome: 50000, maxIncome: null, rate: 0.40, quickDeduction: 7000,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date(2026, 7, 27) });
  mocks.employeeFindFirst.mockResolvedValue({ id: EMP });
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map: Record<string, unknown> = {
      'tax.labor_income_brackets': BRACKETS,
      'tax.labor_income.threshold_low': 4000,
      'tax.labor_income.deduction_low': 800,
      'tax.labor_income.deduction_high_rate': 0.2,
    };
    if (!(key in map)) throw new Error(`missing ${key}`);
    return map[key];
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('tax_labor_income.service', () => {
  it('incomeAmount=3000 ≤ 4000 → deduction=800 → taxAmount=440', async () => {
    const result = await laborService.calculateLaborIncomeTax(ACTOR, {
      employeeId: EMP,
      incomeAmount: 3000,
    });
    expect(result.deduction).toBe(800);
    expect(result.taxableIncome).toBe(2200);
    expect(result.bracket.rate).toBe(0.20);
    expect(result.taxAmount).toBe(440);
  });

  it('incomeAmount=4000 ≤ 4000 → deduction=800 → taxAmount=640', async () => {
    const result = await laborService.calculateLaborIncomeTax(ACTOR, {
      employeeId: EMP,
      incomeAmount: 4000,
    });
    expect(result.taxableIncome).toBe(3200);
    expect(result.taxAmount).toBe(640);
  });

  it('incomeAmount=5000 > 4000 → deduction=1000 → taxAmount=800', async () => {
    const result = await laborService.calculateLaborIncomeTax(ACTOR, {
      employeeId: EMP,
      incomeAmount: 5000,
    });
    expect(result.deduction).toBe(1000);
    expect(result.taxableIncome).toBe(4000);
    expect(result.taxAmount).toBe(800);
  });

  it('incomeAmount=20000 > 4000 → taxableIncome=16000 → taxAmount=3200', async () => {
    const result = await laborService.calculateLaborIncomeTax(ACTOR, {
      employeeId: EMP,
      incomeAmount: 20000,
    });
    expect(result.taxableIncome).toBe(16000);
    expect(result.bracket.rate).toBe(0.20);
    expect(result.taxAmount).toBe(3200);
  });

  it('incomeAmount=30000 → taxableIncome=24000 税率 30% → taxAmount=5200', async () => {
    const result = await laborService.calculateLaborIncomeTax(ACTOR, {
      employeeId: EMP,
      incomeAmount: 30000,
    });
    expect(result.taxableIncome).toBe(24000);
    expect(result.bracket.rate).toBe(0.30);
    expect(result.taxAmount).toBe(5200);
  });

  it('incomeAmount=80000 → taxableIncome=64000 税率 40% → taxAmount=18600', async () => {
    const result = await laborService.calculateLaborIncomeTax(ACTOR, {
      employeeId: EMP,
      incomeAmount: 80000,
    });
    expect(result.taxableIncome).toBe(64000);
    expect(result.bracket.rate).toBe(0.40);
    expect(result.taxAmount).toBe(18600);
    expect(result.taxType).toBe('labor_income');
  });

  it('incomeAmount=0 抛 73206', async () => {
    await expect(laborService.calculateLaborIncomeTax(ACTOR, {
      employeeId: EMP,
      incomeAmount: 0,
    })).rejects.toMatchObject({ code: 73206 });
  });

  it('incomeAmount=-1000 抛 73206', async () => {
    await expect(laborService.calculateLaborIncomeTax(ACTOR, {
      employeeId: EMP,
      incomeAmount: -1000,
    })).rejects.toMatchObject({ code: 73206 });
  });
});
