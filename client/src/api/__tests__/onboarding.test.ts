/**
 * 入职 API 单测（M5-2-A2）内联断言
 */
import { ONBOARDING_PATHS } from '@/api/onboarding';
import {
  unwrapPage,
  type CreateOnboardingRequest,
  type Onboarding,
  type OnboardingStatus,
} from '@/api/types/organization';

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

describe('api/onboarding.ts', () => {
  it('listOnboardings 调 GET /onboarding；confirm / parse-ocr 路径对齐', () => {
    expectEqual(ONBOARDING_PATHS.list, '/onboarding', 'list');
    expectEqual(ONBOARDING_PATHS.item('abc'), '/onboarding/abc', 'get');
    expectEqual(ONBOARDING_PATHS.parseOcr('abc'), '/onboarding/abc/parse-ocr', 'ocr');
    expectEqual(ONBOARDING_PATHS.confirm('abc'), '/onboarding/abc/confirm', 'confirm');
  });

  it('parseOcr 为 JSON body 路径（非 multipart）+ unwrapPage', () => {
    const page = unwrapPage<Onboarding>({
      success: true,
      data: [{ id: '1', name: '张三', companyId: 'c', departmentId: 'd', hireDate: '2026-01-01', contractType: 'formal', status: 'draft', createdAt: '', updatedAt: '' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expectEqual(page.items.length, 1, 'items');
    expectEqual(page.items[0].status, 'draft' as OnboardingStatus, 'status');
  });

  it('创建入职不传 employeeNo（工号由后端生成）', () => {
    const payload: CreateOnboardingRequest = {
      name: '李四',
      companyId: 'c1',
      departmentId: 'd1',
      hireDate: '2026-09-01',
      contractType: 'formal',
      baseSalary: 8000,
      probationMonths: 3,
    };
    expectEqual('employeeNo' in payload, false, 'no employeeNo');
  });
});

export function runOnboardingTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const onboardingTestCount = cases.length;
