// M4-C3: tax_year_end_bonus.service 单元测试
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

import * as bonusService from './tax_year_end_bonus.service';

const ACTOR = 'hr-1';
const EMP = 'emp-1';
const BRACKETS = [
  {
    minIncome: 0, maxIncome: 3000, rate: 0.03, quickDeduction: 0,
  },
  {
    minIncome: 3000, maxIncome: 12000, rate: 0.10, quickDeduction: 210,
  },
  {
    minIncome: 12000, maxIncome: 25000, rate: 0.20, quickDeduction: 1410,
  },
  {
    minIncome: 25000, maxIncome: 35000, rate: 0.25, quickDeduction: 2660,
  },
  {
    minIncome: 35000, maxIncome: 55000, rate: 0.30, quickDeduction: 4410,
  },
  {
    minIncome: 55000, maxIncome: 80000, rate: 0.35, quickDeduction: 7160,
  },
  {
    minIncome: 80000, maxIncome: null, rate: 0.45, quickDeduction: 15160,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date(2026, 7, 27) });
  mocks.employeeFindFirst.mockResolvedValue({ id: EMP });
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    if (key === 'tax.year_end_bonus_brackets') return BRACKETS;
    throw new Error(`missing ${key}`);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('tax_year_end_bonus.service', () => {
  it('bonusAmount=36000 月等价=3000 税率 3% → taxAmount = 1080', async () => {
    const result = await bonusService.calculateYearEndBonus(ACTOR, {
      employeeId: EMP,
      bonusAmount: 36000,
      isAnnual: true,
    });
    expect(result.monthlyEquivalent).toBe(3000);
    expect(result.bracket.rate).toBe(0.03);
    expect(result.taxAmount).toBe(1080);
    expect(result.taxType).toBe('year_end_bonus');
  });

  it('bonusAmount=60000 月等价=5000 税率 10% → taxAmount = 5790', async () => {
    const result = await bonusService.calculateYearEndBonus(ACTOR, {
      employeeId: EMP,
      bonusAmount: 60000,
      isAnnual: true,
    });
    expect(result.monthlyEquivalent).toBe(5000);
    expect(result.bracket.rate).toBe(0.10);
    expect(result.taxAmount).toBe(5790);
  });

  it('bonusAmount=300000 月等价=25000 税率 20% → taxAmount = 58590', async () => {
    const result = await bonusService.calculateYearEndBonus(ACTOR, {
      employeeId: EMP,
      bonusAmount: 300000,
      isAnnual: true,
    });
    expect(result.monthlyEquivalent).toBe(25000);
    expect(result.bracket.rate).toBe(0.20);
    expect(result.taxAmount).toBe(58590);
  });

  it('bonusAmount=600000 月等价=50000 税率 30% → taxAmount = 175590', async () => {
    const result = await bonusService.calculateYearEndBonus(ACTOR, {
      employeeId: EMP,
      bonusAmount: 600000,
      isAnnual: true,
    });
    expect(result.bracket.rate).toBe(0.30);
    expect(result.taxAmount).toBe(175590);
  });

  it('bonusAmount=960000 月等价=80000 税率 35% → taxAmount = 328840', async () => {
    const result = await bonusService.calculateYearEndBonus(ACTOR, {
      employeeId: EMP,
      bonusAmount: 960000,
      isAnnual: true,
    });
    expect(result.bracket.rate).toBe(0.35);
    expect(result.taxAmount).toBe(328840);
  });

  it('bonusAmount=0 抛 73202', async () => {
    await expect(bonusService.calculateYearEndBonus(ACTOR, {
      employeeId: EMP,
      bonusAmount: 0,
      isAnnual: true,
    })).rejects.toMatchObject({ code: 73202 });
  });

  it('isAnnual=false 抛 400（C3 仅年终奖）', async () => {
    await expect(bonusService.calculateYearEndBonus(ACTOR, {
      employeeId: EMP,
      bonusAmount: 36000,
      isAnnual: false,
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('bonusAmount 超过限额抛 73205', async () => {
    mocks.getValue.mockImplementation(async (_c: string, key: string) => {
      if (key === 'tax.year_end_bonus_brackets') return BRACKETS;
      if (key === 'tax.year_end_bonus.max') return 100000;
      throw new Error(`missing ${key}`);
    });
    await expect(bonusService.calculateYearEndBonus(ACTOR, {
      employeeId: EMP,
      bonusAmount: 200000,
      isAnnual: true,
    })).rejects.toMatchObject({ code: 73205 });
  });
});
