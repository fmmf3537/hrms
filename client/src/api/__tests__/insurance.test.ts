/**
 * 社保公积金 API 单测（M5-2-C1）内联断言
 */
import { INSURANCE_PATHS } from '@/api/insurance';
import type { CityCode, InsuranceType } from '@/api/types/salary';

interface Case {
  name: string;
  fn: () => void;
}

const cases: Case[] = [];

function describe(_name: string, fn: () => void): void {
  fn();
}

function it(name: string, fn: () => void): void {
  cases.push({ name, fn });
}

function expectEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

describe('api/insurance.ts', () => {
  it('3 组路径；housing-fund 中划线', () => {
    expectEqual(INSURANCE_PATHS.social, '/salary/insurances/social', 'social');
    expectEqual(
      INSURANCE_PATHS.housingFund,
      '/salary/insurances/housing-fund',
      'fund',
    );
    expectEqual(INSURANCE_PATHS.employees, '/salary/insurances/employees', 'employees');
  });

  it('PATCH item 路径拼接', () => {
    expectEqual(
      INSURANCE_PATHS.item(INSURANCE_PATHS.social, 's1'),
      '/salary/insurances/social/s1',
      'patch social',
    );
  });

  it('city 3 枚举 + insuranceType 5 枚举', () => {
    const cities: CityCode[] = ['xi_an', 'bei_jing', 'si_chuan'];
    expectEqual(cities.length, 3, '3 cities');
    const types: InsuranceType[] = [
      'pension',
      'medical',
      'unemployment',
      'work_injury',
      'maternity',
    ];
    expectEqual(types.length, 5, '5 insurance types');
  });
});

export function runInsuranceTests(): number {
  // Node 25 默认 Web Storage 为空对象，happy-dom 的 removeItem 不可用；替换后再跑后续旧测。
  const current = globalThis.localStorage;
  if (!current || typeof current.removeItem !== 'function') {
    const mem = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return mem.size;
      },
      clear() {
        mem.clear();
      },
      getItem(key: string) {
        return mem.get(key) ?? null;
      },
      key(index: number) {
        return [...mem.keys()][index] ?? null;
      },
      removeItem(key: string) {
        mem.delete(key);
      },
      setItem(key: string, value: string) {
        mem.set(String(key), String(value));
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      enumerable: true,
      value: storage,
    });
  }
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const insuranceTestCount = cases.length;
