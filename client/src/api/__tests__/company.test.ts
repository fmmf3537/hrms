/**
 * 法人公司 API 单测（M5-2-A1）内联断言
 */
import { COMPANY_PATHS } from '@/api/company';
import { unwrapPage } from '@/api/types/organization';
import type { Company } from '@/api/types/organization';

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

describe('api/company.ts', () => {
  it('list/get/create 路径对齐后端 /companies', () => {
    expectEqual(COMPANY_PATHS.list, '/companies', 'list');
    expectEqual(COMPANY_PATHS.item('abc'), '/companies/abc', 'get');
    expectEqual(COMPANY_PATHS.statistics('abc'), '/companies/abc/statistics', 'stats');
    expectEqual(
      COMPANY_PATHS.headcountWarning('abc'),
      '/companies/abc/headcount-warning',
      'warning',
    );
  });

  it('unwrapPage 消费 { data, total, page, pageSize }', () => {
    const page = unwrapPage<Company>({
      success: true,
      data: [{ id: '1', code: 'XACH', name: '辰航' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expectEqual(page.items.length, 1, 'items');
    expectEqual(page.total, 1, 'total');
    expectEqual(page.items[0].code, 'XACH', 'code');
  });

  it('Company 关键字段存在（无 finance）', () => {
    const row: Company = {
      id: '1',
      code: 'XACH',
      name: '西安辰航',
      shortName: null,
      city: '西安',
      address: null,
      contact: null,
      legalRep: null,
      taxNo: null,
      status: 'active',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    expectEqual(row.status, 'active', 'status');
    expectEqual('finance' in row, false, 'no finance field');
  });
});

export function runCompanyTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const companyTestCount = cases.length;
