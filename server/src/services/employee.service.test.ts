// M1-A2: employee.service 单元测试 | HRMS
/* eslint-disable import/first */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  companyFindFirst: vi.fn(),
  deptFindFirst: vi.fn(),
  empFindFirst: vi.fn(),
  empCreate: vi.fn(),
  empFindMany: vi.fn(),
  empCount: vi.fn(),
  empUpdate: vi.fn(),
  empGroupBy: vi.fn(),
  posCreate: vi.fn(),
  salCreate: vi.fn(),
  auditLog: vi.fn(),
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => (v.startsWith('enc:') ? v.slice(4) : v)),
  getValue: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    company: { findFirst: mocks.companyFindFirst },
    department: { findFirst: mocks.deptFindFirst },
    employee: {
      findFirst: mocks.empFindFirst,
      create: mocks.empCreate,
      findMany: mocks.empFindMany,
      count: mocks.empCount,
      update: mocks.empUpdate,
      groupBy: mocks.empGroupBy,
    },
    employeePositionHistory: { create: mocks.posCreate },
    employeeSalaryHistory: { create: mocks.salCreate },
  },
}));

vi.mock('./audit.service', () => ({
  AUDIT_ACTIONS: {
    CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE', EXPORT: 'EXPORT',
  },
  AUDIT_RESOURCE_TYPES: { EMPLOYEE: 'Employee' },
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./crypto.service', () => ({
  encrypt: mocks.encrypt,
  decrypt: mocks.decrypt,
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

vi.mock('./notification.service', () => ({
  sendNotification: mocks.sendNotification.mockResolvedValue({ logId: 'l1' }),
}));

import * as employeeService from './employee.service';

const company = { id: 'c-1', code: 'XACH', deletedAt: null };
const dept = {
  id: 'd-1', companyId: 'c-1', deletedAt: null, code: 'HR', name: 'HR',
};

const makeEmp = (overrides: Record<string, unknown> = {}) => ({
  id: 'e-1',
  userId: 'u-1',
  employeeNo: 'XACH20260001',
  name: '张三',
  gender: 'male',
  birthDate: null,
  idCard: 'enc:110101199001011234',
  nativePlace: null,
  ethnicity: null,
  politicalStatus: null,
  phone: 'enc:13800138000',
  email: 'zhang@test.com',
  emergencyContactName: null,
  emergencyContactPhone: null,
  address: null,
  educationLevel: null,
  degree: null,
  school: null,
  major: null,
  graduationDate: null,
  workHistory: null,
  contractType: 'formal',
  contractStart: new Date('2026-01-01'),
  contractEnd: new Date('2027-01-01'),
  certificates: null,
  bankName: null,
  bankCard: null,
  socialInsured: false,
  socialCity: null,
  socialBase: null,
  housingFundCity: null,
  housingFundRate: null,
  housingFundBase: null,
  companyId: 'c-1',
  departmentId: 'd-1',
  status: 'probation',
  hireDate: new Date('2026-01-01'),
  resignationDate: null,
  remark: null,
  createdBy: 'admin',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockImplementation(async (cat: string, key: string) => {
    if (cat === 'employee_no' && key === 'format') return '{company_code}{year}{seq:4}';
    if (cat === 'contract' && key === 'warning_days') return [30, 15, 7];
    if (cat === 'certificate' && key === 'warning_days') return 60;
    throw new Error('missing');
  });
  mocks.sendNotification.mockResolvedValue({ logId: 'l1' });
});

describe('employee.service', () => {
  it('createEmployee 生成工号并加密敏感字段', async () => {
    mocks.companyFindFirst.mockResolvedValue(company);
    mocks.deptFindFirst.mockResolvedValue(dept);
    mocks.empFindFirst
      .mockResolvedValueOnce(null) // latest for seq
      .mockResolvedValueOnce(null); // dup check
    mocks.empCreate.mockResolvedValue(makeEmp());
    mocks.posCreate.mockResolvedValue({});

    const result = await employeeService.createEmployee({
      companyId: 'c-1',
      departmentId: 'd-1',
      name: '张三',
      hireDate: '2026-01-01',
      idCard: '110101199001011234',
      phone: '13800138000',
      createdBy: 'admin',
    });

    expect(mocks.encrypt).toHaveBeenCalledWith('110101199001011234', 1);
    expect(mocks.encrypt).toHaveBeenCalledWith('13800138000', 1);
    expect(mocks.posCreate).toHaveBeenCalled();
    expect(mocks.auditLog).toHaveBeenCalled();
    expect(result.idCard).toMatch(/\*\*\*\*/);
    expect(result.phone).toBe('***');
  });

  it('createEmployee 缺部门 → 校验失败路径（71205）', async () => {
    await expect(
      employeeService.createEmployee({
        companyId: 'c-1',
        departmentId: '',
        name: '张三',
        hireDate: '2026-01-01',
      }),
    ).rejects.toMatchObject({ code: 71205 });
  });

  it('createEmployee 写入薪资历史', async () => {
    mocks.companyFindFirst.mockResolvedValue(company);
    mocks.deptFindFirst.mockResolvedValue(dept);
    mocks.empFindFirst.mockResolvedValue(null);
    mocks.empCreate.mockResolvedValue(makeEmp());
    mocks.posCreate.mockResolvedValue({});
    mocks.salCreate.mockResolvedValue({});

    await employeeService.createEmployee({
      companyId: 'c-1',
      departmentId: 'd-1',
      name: '张三',
      hireDate: '2026-01-01',
      baseSalary: 10000,
      performanceSalary: 2000,
    });

    expect(mocks.salCreate).toHaveBeenCalled();
  });

  it('createEmployee 通知失败不阻断', async () => {
    mocks.companyFindFirst.mockResolvedValue(company);
    mocks.deptFindFirst.mockResolvedValue(dept);
    mocks.empFindFirst.mockResolvedValue(null);
    mocks.empCreate.mockResolvedValue(makeEmp({
      contractEnd: new Date(Date.now() + 40 * 86400000),
    }));
    mocks.posCreate.mockResolvedValue({});
    mocks.sendNotification.mockRejectedValue(new Error('queue down'));

    await expect(
      employeeService.createEmployee({
        companyId: 'c-1',
        departmentId: 'd-1',
        name: '张三',
        hireDate: '2026-01-01',
        userId: 'u-1',
        contractEnd: new Date(Date.now() + 40 * 86400000).toISOString(),
      }),
    ).resolves.toBeTruthy();
  });

  it('getEmployeeById 不存在 → 71201', async () => {
    mocks.empFindFirst.mockResolvedValue(null);
    await expect(employeeService.getEmployeeById('x')).rejects.toMatchObject({ code: 71201 });
  });

  it('getEmployeeByEmployeeNo 成功脱敏', async () => {
    mocks.empFindFirst.mockResolvedValue(makeEmp());
    const emp = await employeeService.getEmployeeByEmployeeNo('XACH20260001');
    expect(emp.phone).toBe('***');
  });

  it('listEmployees 分页过滤', async () => {
    mocks.empFindMany.mockResolvedValue([makeEmp()]);
    mocks.empCount.mockResolvedValue(1);
    const result = await employeeService.listEmployees({
      companyId: 'c-1', keyword: '张', page: 1, pageSize: 10,
    });
    expect(result.total).toBe(1);
    expect(result.data[0].name).toBe('张三');
  });

  it('updateEmployee 重新加密敏感字段', async () => {
    mocks.empFindFirst.mockResolvedValue(makeEmp());
    mocks.empUpdate.mockResolvedValue(makeEmp({ phone: 'enc:13900139000' }));
    await employeeService.updateEmployee('e-1', { phone: '13900139000' }, 'admin');
    expect(mocks.encrypt).toHaveBeenCalledWith('13900139000', 1);
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('updateEmployee 已离职恢复 → 71204', async () => {
    mocks.empFindFirst.mockResolvedValue(makeEmp({ status: 'resigned' }));
    await expect(
      employeeService.updateEmployee('e-1', { status: 'active' }),
    ).rejects.toMatchObject({ code: 71204 });
  });

  it('updateEmployee 非法状态 → 71206', async () => {
    mocks.empFindFirst.mockResolvedValue(makeEmp());
    await expect(
      employeeService.updateEmployee('e-1', { status: 'unknown' }),
    ).rejects.toMatchObject({ code: 71206 });
  });

  it('deleteEmployee 软删除', async () => {
    mocks.empFindFirst.mockResolvedValue(makeEmp());
    mocks.empUpdate.mockResolvedValue(makeEmp({ deletedAt: new Date() }));
    const result = await employeeService.deleteEmployee('e-1', 'admin');
    expect(result.deletedAt).toBeTruthy();
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('getEmployeeStatistics 汇总', async () => {
    mocks.empCount
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);
    mocks.empGroupBy
      .mockResolvedValueOnce([{ departmentId: 'd-1', _count: { _all: 9 } }])
      .mockResolvedValueOnce([{ companyId: 'c-1', _count: { _all: 9 } }]);
    const stats = await employeeService.getEmployeeStatistics('c-1');
    expect(stats.total).toBe(10);
    expect(stats.active).toBe(6);
    expect(stats.perDepartment['d-1']).toBe(9);
  });

  it('getContractExpiringEmployees 返回列表并写 EXPORT 审计', async () => {
    mocks.empFindMany.mockResolvedValue([makeEmp()]);
    const rows = await employeeService.getContractExpiringEmployees('c-1', 30);
    expect(rows).toHaveLength(1);
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXPORT' }),
    );
  });

  it('工号序号递增', async () => {
    mocks.companyFindFirst.mockResolvedValue(company);
    mocks.deptFindFirst.mockResolvedValue(dept);
    mocks.empFindFirst
      .mockResolvedValueOnce({ employeeNo: 'XACH20260007' })
      .mockResolvedValueOnce(null);
    mocks.empCreate.mockImplementation(async ({ data }: any) => makeEmp({
      employeeNo: data.employeeNo,
    }));
    mocks.posCreate.mockResolvedValue({});

    const result = await employeeService.createEmployee({
      companyId: 'c-1',
      departmentId: 'd-1',
      name: '李四',
      hireDate: '2026-02-01',
    });

    expect(result.employeeNo).toBe('XACH20260008');
  });
});
