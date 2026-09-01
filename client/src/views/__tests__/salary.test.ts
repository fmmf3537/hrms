/**
 * 薪酬视图 + 状态映射单测（M5-2-C1）内联断言
 */
import salaryRoutes, {
  SALARY_MENU,
  filterSalaryMenu,
  resolveSalaryActiveKey,
} from '@/router/salary';
import { SALARY_STATUS_LABELS } from '@/api/types/salary';
import type { UserInfo } from '@/api/types';

interface Case {
  name: string;
  fn: () => void | Promise<void>;
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

function mockUser(roles: string[], permissions: string[]): UserInfo {
  return {
    id: 'u1',
    username: 'tester',
    email: null,
    phone: null,
    status: 'active',
    mustChangePassword: false,
    roles,
    permissions,
    companyId: null,
    departmentId: null,
  };
}

describe('views/__tests__/salary.test.ts', () => {
  it('8 个薪酬页面组件可导入', async () => {
    const GradeList = (await import('@/views/salary/grade/GradeList.vue')).default;
    const GradeDetail = (await import('@/views/salary/grade/GradeDetail.vue')).default;
    const SalaryPlanList = (await import('@/views/salary/plan/SalaryPlanList.vue')).default;
    const SocialSchemeList = (await import('@/views/salary/insurance/SocialSchemeList.vue')).default;
    const HousingFundList = (await import('@/views/salary/insurance/HousingFundList.vue')).default;
    const EmployeeInsuranceList = (await import('@/views/salary/insurance/EmployeeInsuranceList.vue'))
      .default;
    const TaxCalculator = (await import('@/views/salary/tax/TaxCalculator.vue')).default;
    const TaxHistory = (await import('@/views/salary/tax/TaxHistory.vue')).default;
    expectEqual(typeof GradeList, 'object', 'GradeList');
    expectEqual(typeof GradeDetail, 'object', 'GradeDetail');
    expectEqual(typeof SalaryPlanList, 'object', 'SalaryPlanList');
    expectEqual(typeof SocialSchemeList, 'object', 'SocialSchemeList');
    expectEqual(typeof HousingFundList, 'object', 'HousingFundList');
    expectEqual(typeof EmployeeInsuranceList, 'object', 'EmployeeInsuranceList');
    expectEqual(typeof TaxCalculator, 'object', 'TaxCalculator');
    expectEqual(typeof TaxHistory, 'object', 'TaxHistory');
  });

  it('状态映射 grade/plan/registration', () => {
    expectEqual(SALARY_STATUS_LABELS.active, '生效', 'active');
    expectEqual(SALARY_STATUS_LABELS.archived, '已归档', 'grade archived');
    expectEqual(SALARY_STATUS_LABELS.inactive, '已停用', 'plan/reg inactive');
    expectEqual(SALARY_STATUS_LABELS.superseded, '已替代', 'plan superseded');
  });

  it('grades/:id 在 grades 列表之后；菜单 7 项无 finance', () => {
    const children = salaryRoutes[0].children ?? [];
    const listIdx = children.findIndex((c) => c.path === 'grades');
    const detailIdx = children.findIndex((c) => c.path === 'grades/:id');
    expectEqual(listIdx >= 0 && listIdx < detailIdx, true, 'list before :id');
    expectEqual(SALARY_MENU.length, 7, '7 menus');
    expectEqual(
      SALARY_MENU.map((m) => m.permission).join(',').includes('finance'),
      false,
      'no finance',
    );
  });

  it('employee 仅 3 菜单；dept_head 无个税工具', () => {
    const employee = filterSalaryMenu(
      mockUser(['employee'], ['salary:plan:read', 'salary:insurance:read', 'salary:tax:read']),
    );
    expectEqual(employee.length, 3, 'employee 3');
    expectEqual(employee.map((m) => m.key).join(','), 'plan,registration,tax-history', 'employee keys');
    expectEqual(employee.some((m) => m.key === 'tax-calc'), false, 'employee no calc');
    expectEqual(employee.some((m) => m.key === 'social'), false, 'employee no social scheme');
    expectEqual(employee.some((m) => m.label === '我的薪酬方案'), true, 'my plan label');
    const head = filterSalaryMenu(
      mockUser(
        ['dept_head'],
        [
          'salary:grade:read',
          'salary:plan:read',
          'salary:insurance:read',
          'salary:housing-fund:read',
          'salary:tax:read',
        ],
      ),
    );
    expectEqual(head.some((m) => m.key === 'tax-calc'), false, 'head no calc');
    expectEqual(head.some((m) => m.key === 'tax-history'), true, 'head history');
    expectEqual(resolveSalaryActiveKey('/salary/tax/calculator'), 'tax-calc', 'active calc');
  });
});

export async function runSalaryViewTests(): Promise<number> {
  await Promise.all(cases.map((item) => Promise.resolve(item.fn())));
  return cases.length;
}

export const salaryViewTestCount = cases.length;
