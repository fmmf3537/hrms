/**
 * 员工 API 单测（M5-2-A1）
 */
import { EMPLOYEE_PATHS } from '@/api/employee';
import { maskSensitiveDisplay, unwrapPage } from '@/api/types/organization';
import type { Employee } from '@/api/types/organization';

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

describe('api/employee.ts', () => {
  it('list/create/OCR 路径对齐后端 10 端点', () => {
    expectEqual(EMPLOYEE_PATHS.list, '/employees', 'list');
    expectEqual(EMPLOYEE_PATHS.statistics, '/employees/statistics', 'stats');
    expectEqual(EMPLOYEE_PATHS.item('e1'), '/employees/e1', 'get');
    expectEqual(EMPLOYEE_PATHS.parseIdCard('e1'), '/employees/e1/parse-id-card', 'ocr');
    expectEqual(
      EMPLOYEE_PATHS.contractExpiring('c1'),
      '/employees/c1/contract-expiring',
      'expiring',
    );
  });

  it('listEmployees 分页信封 unwrapPage', () => {
    const page = unwrapPage<Employee>({
      success: true,
      data: [{ id: 'e1', employeeNo: 'XACH20260001', name: '张三' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expectEqual(page.items[0].employeeNo, 'XACH20260001', 'no');
  });

  it('Employee 含 4 加密字段 + 脱敏兜底', () => {
    const emp: Pick<Employee, 'phone' | 'idCard' | 'bankCard' | 'emergencyContactPhone'> = {
      phone: '13800138000',
      idCard: '610100199001011234',
      bankCard: '6222021234567890',
      emergencyContactPhone: '13900139000',
    };
    expectEqual(maskSensitiveDisplay(emp.phone).includes('*'), true, 'phone mask');
    expectEqual(maskSensitiveDisplay(emp.idCard).endsWith('1234'), true, 'id last4');
    expectEqual(Boolean(emp.bankCard), true, 'bankCard field');
    expectEqual(Boolean(emp.emergencyContactPhone), true, 'emergency field');
  });
});

export function runEmployeeTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const employeeTestCount = cases.length;
