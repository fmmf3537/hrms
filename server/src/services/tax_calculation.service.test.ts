// M4-C3: tax_calculation.service 单元测试
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
  insuranceFindFirst: vi.fn(),
  auditFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    employee: {
      findFirst: mocks.employeeFindFirst,
      findMany: mocks.employeeFindMany,
    },
    employeeSalaryPlan: {
      findFirst: mocks.planFindFirst,
    },
    employeeInsuranceRegistration: {
      findFirst: mocks.insuranceFindFirst,
    },
    auditLog: {
      findMany: mocks.auditFindMany,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock('./audit.service', () => ({
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as taxService from './tax_calculation.service';

const ACTOR = 'hr-1';
const EMP = 'emp-1';
const MONTHLY_BRACKETS = [
  {
    minIncome: 0, maxIncome: 36000, rate: 0.03, quickDeduction: 0,
  },
  {
    minIncome: 36000, maxIncome: 144000, rate: 0.10, quickDeduction: 2520,
  },
  {
    minIncome: 144000, maxIncome: 300000, rate: 0.20, quickDeduction: 16920,
  },
  {
    minIncome: 300000, maxIncome: 420000, rate: 0.25, quickDeduction: 31920,
  },
  {
    minIncome: 420000, maxIncome: 660000, rate: 0.30, quickDeduction: 52920,
  },
  {
    minIncome: 660000, maxIncome: 960000, rate: 0.35, quickDeduction: 85920,
  },
  {
    minIncome: 960000, maxIncome: null, rate: 0.45, quickDeduction: 181920,
  },
];

function configMap(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    'tax.cumulative_method': 'cumulative_withholding',
    'tax.basic_deduction': 5000,
    'tax.monthly_brackets': MONTHLY_BRACKETS,
    'tax.batch_size': 200,
    'tax.annual_settlement_period': ['03-01', '06-30'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date(2026, 7, 27) });
  mocks.getValue.mockImplementation(async (_c: string, key: string) => {
    const map = configMap();
    if (!(key in map)) {
      throw new Error(`missing ${key}`);
    }
    return map[key];
  });
  mocks.employeeFindFirst.mockResolvedValue({ id: EMP, departmentId: 'dept-1' });
  mocks.employeeFindMany.mockResolvedValue([]);
  mocks.planFindFirst.mockResolvedValue({ baseSalary: 10000 });
  mocks.insuranceFindFirst.mockResolvedValue(null);
  mocks.auditFindMany.mockResolvedValue([]);
  mocks.userFindUnique.mockResolvedValue({
    id: ACTOR,
    userRoles: [{ role: { code: 'hr' } }],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('tax_calculation.service calculateMonthlyTax', () => {
  it('baseAmount=10000 税率 3% 速算扣除 0 → taxAmount = 150', async () => {
    const result = await taxService.calculateMonthlyTax(ACTOR, {
      employeeId: EMP,
      period: '2026-08',
      baseAmount: 10000,
    });
    expect(result.taxableIncome).toBe(5000);
    expect(result.bracket.rate).toBe(0.03);
    expect(result.taxAmount).toBe(150);
    expect(result.taxType).toBe('monthly');
  });

  it('baseAmount=50000 税率 10% 速算扣除 2520 → taxAmount = 1980', async () => {
    const result = await taxService.calculateMonthlyTax(ACTOR, {
      employeeId: EMP,
      period: '2026-08',
      baseAmount: 50000,
    });
    expect(result.taxableIncome).toBe(45000);
    expect(result.bracket.rate).toBe(0.10);
    expect(result.taxAmount).toBe(1980);
  });

  it('baseAmount=200000 税率 20% 速算扣除 16920 → taxAmount = 22080', async () => {
    const result = await taxService.calculateMonthlyTax(ACTOR, {
      employeeId: EMP,
      period: '2026-08',
      baseAmount: 200000,
    });
    expect(result.bracket.rate).toBe(0.20);
    expect(result.taxAmount).toBe(22080);
  });

  it('baseAmount=350000 税率 25% 速算扣除 31920 → taxAmount = 54330', async () => {
    const result = await taxService.calculateMonthlyTax(ACTOR, {
      employeeId: EMP,
      period: '2026-08',
      baseAmount: 350000,
    });
    expect(result.bracket.rate).toBe(0.25);
    expect(result.taxAmount).toBe(54330);
  });

  it('baseAmount=500000 税率 30% 速算扣除 52920 → taxAmount = 95580', async () => {
    const result = await taxService.calculateMonthlyTax(ACTOR, {
      employeeId: EMP,
      period: '2026-08',
      baseAmount: 500000,
    });
    expect(result.bracket.rate).toBe(0.30);
    expect(result.taxAmount).toBe(95580);
  });

  it('baseAmount=800000 税率 35% 速算扣除 85920 → taxAmount = 192330', async () => {
    const result = await taxService.calculateMonthlyTax(ACTOR, {
      employeeId: EMP,
      period: '2026-08',
      baseAmount: 800000,
    });
    expect(result.bracket.rate).toBe(0.35);
    expect(result.taxAmount).toBe(192330);
  });

  it('baseAmount=1500000 税率 45% 速算扣除 181920 → taxAmount = 490830', async () => {
    const result = await taxService.calculateMonthlyTax(ACTOR, {
      employeeId: EMP,
      period: '2026-08',
      baseAmount: 1500000,
    });
    expect(result.bracket.rate).toBe(0.45);
    expect(result.taxAmount).toBe(490830);
  });

  it('baseAmount=0 抛 73202', async () => {
    await expect(taxService.calculateMonthlyTax(ACTOR, {
      employeeId: EMP,
      period: '2026-08',
      baseAmount: 0,
    })).rejects.toMatchObject({ statusCode: 400, code: 73202 });
  });

  it('baseAmount=-1000 抛 73202', async () => {
    await expect(taxService.calculateMonthlyTax(ACTOR, {
      employeeId: EMP,
      period: '2026-08',
      baseAmount: -1000,
    })).rejects.toMatchObject({ code: 73202 });
  });

  it('period="2026-13" 抛 73201', async () => {
    await expect(taxService.calculateMonthlyTax(ACTOR, {
      employeeId: EMP,
      period: '2026-13',
      baseAmount: 10000,
    })).rejects.toMatchObject({ code: 73201 });
  });

  it('period="invalid" 抛 73201', async () => {
    await expect(taxService.calculateMonthlyTax(ACTOR, {
      employeeId: EMP,
      period: 'invalid',
      baseAmount: 10000,
    })).rejects.toMatchObject({ code: 73201 });
  });

  it('employeeId 不存在抛 400', async () => {
    mocks.employeeFindFirst.mockResolvedValue(null);
    await expect(taxService.calculateMonthlyTax(ACTOR, {
      employeeId: 'missing',
      period: '2026-08',
      baseAmount: 10000,
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('cumulativePrepaid < 0 抛 73204', async () => {
    await expect(taxService.calculateMonthlyTax(ACTOR, {
      employeeId: EMP,
      period: '2026-08',
      baseAmount: 10000,
      cumulativePrepaid: -1,
    })).rejects.toMatchObject({ code: 73204 });
  });

  it('税率表缺档抛 73210', async () => {
    const gapped = [
      {
        minIncome: 0, maxIncome: 100, rate: 0.03, quickDeduction: 0,
      },
      {
        minIncome: 10000000, maxIncome: 10000001, rate: 0.1, quickDeduction: 0,
      },
      {
        minIncome: 10000001, maxIncome: 10000002, rate: 0.2, quickDeduction: 0,
      },
      {
        minIncome: 10000002, maxIncome: 10000003, rate: 0.25, quickDeduction: 0,
      },
      {
        minIncome: 10000003, maxIncome: 10000004, rate: 0.3, quickDeduction: 0,
      },
      {
        minIncome: 10000004, maxIncome: 10000005, rate: 0.35, quickDeduction: 0,
      },
      {
        minIncome: 10000005, maxIncome: null, rate: 0.45, quickDeduction: 0,
      },
    ];
    mocks.getValue.mockImplementation(async (_c: string, key: string) => {
      const map = configMap({ 'tax.monthly_brackets': gapped });
      return map[key];
    });
    await expect(taxService.calculateMonthlyTax(ACTOR, {
      employeeId: EMP,
      period: '2026-08',
      baseAmount: 10000,
    })).rejects.toMatchObject({ code: 73210 });
  });

  it('税率表不足 7 档抛 73203', async () => {
    mocks.getValue.mockImplementation(async (_c: string, key: string) => {
      const map = configMap({ 'tax.monthly_brackets': MONTHLY_BRACKETS.slice(0, 3) });
      return map[key];
    });
    await expect(taxService.calculateMonthlyTax(ACTOR, {
      employeeId: EMP,
      period: '2026-08',
      baseAmount: 10000,
    })).rejects.toMatchObject({ code: 73203 });
  });

  it('审计日志 actorType=USER 且 details 含 bracket', async () => {
    await taxService.calculateMonthlyTax(ACTOR, {
      employeeId: EMP,
      period: '2026-08',
      baseAmount: 10000,
    });
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorType: 'USER',
      action: 'TAX_CALCULATE',
      resourceType: 'tax_calculation',
      newValue: expect.objectContaining({
        bracket: expect.objectContaining({ rate: 0.03 }),
        taxAmount: 150,
      }),
    }));
  });
});

describe('tax_calculation.service calculateBatchTax', () => {
  it('批量多名员工全部成功', async () => {
    mocks.employeeFindMany.mockResolvedValue([
      { id: 'e1' }, { id: 'e2' }, { id: 'e3' },
    ]);
    mocks.planFindFirst.mockResolvedValue({ baseSalary: 10000 });
    const result = await taxService.calculateBatchTax(ACTOR, { period: '2026-08' });
    expect(result.succeeded).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
    expect(result.succeeded[0].taxAmount).toBe(150);
  });

  it('部门下无员工抛 73207', async () => {
    mocks.employeeFindMany.mockResolvedValue([]);
    await expect(taxService.calculateBatchTax(ACTOR, {
      period: '2026-08',
      deptIds: ['dept-empty'],
    })).rejects.toMatchObject({ code: 73207 });
  });

  it('>200 抛 73208', async () => {
    mocks.employeeFindMany.mockResolvedValue(
      Array.from({ length: 201 }, (_, i) => ({ id: `e${i}` })),
    );
    await expect(taxService.calculateBatchTax(ACTOR, { period: '2026-08' }))
      .rejects.toMatchObject({ code: 73208 });
  });

  it('单条失败不影响其他条', async () => {
    mocks.employeeFindMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    mocks.planFindFirst.mockImplementation(async ({ where }: { where: { employeeId: string } }) => {
      if (where.employeeId === 'e1') return null;
      return { baseSalary: 10000 };
    });
    const result = await taxService.calculateBatchTax(ACTOR, { period: '2026-08' });
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].employeeId).toBe('e1');
    expect(result.succeeded).toHaveLength(1);
    expect(result.succeeded[0].employeeId).toBe('e2');
  });
});

describe('tax_calculation.service calculateCumulativeTax', () => {
  it('累计 3 月 + cumulativePrepaid=300 → currentTax = 累计应预扣 - 300', async () => {
    mocks.auditFindMany.mockResolvedValue([
      { newValue: { taxType: 'monthly', period: '2026-01', baseAmount: 10000 } },
      { newValue: { taxType: 'monthly', period: '2026-02', baseAmount: 10000 } },
    ]);
    const result = await taxService.calculateCumulativeTax(ACTOR, {
      employeeId: EMP,
      year: 2026,
      month: 3,
      currentIncome: 10000,
      cumulativePrepaid: 300,
    });
    expect(result.cumulativeIncome).toBe(30000);
    expect(result.cumulativeTaxableIncome).toBe(15000);
    expect(result.cumulativeTax).toBe(450);
    expect(result.currentTax).toBe(150);
    expect(result.taxType).toBe('cumulative');
  });

  it('累计数据不完整抛 73204', async () => {
    mocks.auditFindMany.mockResolvedValue([
      { newValue: { taxType: 'monthly', period: '2026-01', baseAmount: 10000 } },
    ]);
    await expect(taxService.calculateCumulativeTax(ACTOR, {
      employeeId: EMP,
      year: 2026,
      month: 3,
      currentIncome: 10000,
      cumulativePrepaid: 0,
    })).rejects.toMatchObject({ code: 73204 });
  });
});

describe('tax_calculation.service getTaxHistory / annual-summary', () => {
  it('getTaxHistory 返回当年 TAX_CALCULATE 记录并写 TAX_HISTORY_READ', async () => {
    mocks.auditFindMany.mockResolvedValue([
      {
        action: 'TAX_CALCULATE',
        createdAt: new Date(2026, 7, 1),
        newValue: { period: '2026-08', taxAmount: 150 },
      },
    ]);
    const items = await taxService.getTaxHistory(ACTOR, EMP, 2026);
    expect(items).toHaveLength(1);
    expect(items[0].details.taxAmount).toBe(150);
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'TAX_HISTORY_READ',
      actorType: 'USER',
    }));
  });

  it('getTaxAnnualSummary settle=true 且不在 3-6 月抛 73209', async () => {
    vi.useFakeTimers({ now: new Date(2026, 0, 15) });
    await expect(taxService.getTaxAnnualSummary(ACTOR, EMP, 2026, { settle: true }))
      .rejects.toMatchObject({ code: 73209 });
  });
});
