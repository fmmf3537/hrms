// M1-A1: department.service 单元测试 | HRMS
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
  deptCreate: vi.fn(),
  deptFindMany: vi.fn(),
  deptUpdate: vi.fn(),
  deptCount: vi.fn(),
  empCount: vi.fn(),
  empGroupBy: vi.fn(),
  auditLog: vi.fn(),
  getValue: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  default: {
    company: { findFirst: mocks.companyFindFirst },
    department: {
      findFirst: mocks.deptFindFirst,
      create: mocks.deptCreate,
      findMany: mocks.deptFindMany,
      update: mocks.deptUpdate,
      count: mocks.deptCount,
    },
    employee: { count: mocks.empCount, groupBy: mocks.empGroupBy },
  },
}));

vi.mock('./audit.service', () => ({
  AUDIT_ACTIONS: {
    CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE',
  },
  AUDIT_RESOURCE_TYPES: { DEPARTMENT: 'Department', COMPANY: 'Company' },
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

vi.mock('./config.service', () => ({
  getValue: mocks.getValue,
}));

import * as departmentService from './department.service';

const company = {
  id: 'c-1', code: 'XACH', deletedAt: null, status: 'active',
};

const makeDept = (overrides: Record<string, unknown> = {}) => ({
  id: 'd-1',
  companyId: 'c-1',
  parentId: null,
  code: 'HR',
  name: '人力资源',
  leaderId: null,
  headcount: 10,
  order: 0,
  status: 'active',
  createdBy: 'u-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getValue.mockRejectedValue(new Error('not found'));
});

describe('department.service', () => {
  it('createDepartment 根部门成功', async () => {
    mocks.companyFindFirst.mockResolvedValue(company);
    mocks.deptFindFirst.mockResolvedValue(null);
    mocks.deptCreate.mockResolvedValue(makeDept());
    const result = await departmentService.createDepartment({
      companyId: 'c-1', code: 'HR', name: '人力资源', createdBy: 'u-1',
    });
    expect(result.code).toBe('HR');
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('createDepartment 编码重复 → 71102', async () => {
    mocks.companyFindFirst.mockResolvedValue(company);
    mocks.deptFindFirst.mockResolvedValue(makeDept());
    await expect(
      departmentService.createDepartment({
        companyId: 'c-1', code: 'HR', name: '人力资源',
      }),
    ).rejects.toMatchObject({ code: 71102 });
  });

  it('createDepartment 超过 4 级 → 71105', async () => {
    mocks.companyFindFirst.mockResolvedValue(company);
    // parent exists; depth walk: p3→p2→p1→root = depth 3
    mocks.deptFindFirst
      .mockResolvedValueOnce(makeDept({ id: 'p3', parentId: 'p2' })) // parent check
      .mockResolvedValueOnce({ parentId: 'p2' }) // depth of p3
      .mockResolvedValueOnce({ parentId: 'p1' })
      .mockResolvedValueOnce({ parentId: 'root' })
      .mockResolvedValueOnce({ parentId: null });
    await expect(
      departmentService.createDepartment({
        companyId: 'c-1', parentId: 'p3', code: 'X', name: '超限',
      }),
    ).rejects.toMatchObject({ code: 71105 });
  });

  it('getDepartmentById 不存在 → 71101', async () => {
    mocks.deptFindFirst.mockResolvedValue(null);
    await expect(departmentService.getDepartmentById('x')).rejects.toMatchObject({ code: 71101 });
  });

  it('getDepartmentTree 构建树', async () => {
    mocks.deptFindMany.mockResolvedValue([
      makeDept({
        id: 'root', parentId: null, code: 'R', name: '根',
      }),
      makeDept({
        id: 'child', parentId: 'root', code: 'C', name: '子',
      }),
    ]);
    const tree = await departmentService.getDepartmentTree('c-1');
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].code).toBe('C');
  });

  it('updateDepartment 循环引用 → 71106', async () => {
    mocks.deptFindFirst
      .mockResolvedValueOnce(makeDept({ id: 'd-1', parentId: null })) // getById
      .mockResolvedValueOnce({ parentId: 'd-1' }); // wouldCreateCycle: parent chain hits d-1
    await expect(
      departmentService.updateDepartment('d-1', { parentId: 'child' }),
    ).rejects.toMatchObject({ code: 71106 });
  });

  it('deleteDepartment 有子部门 → 71103', async () => {
    mocks.deptFindFirst.mockResolvedValue(makeDept());
    mocks.deptCount.mockResolvedValue(1);
    mocks.empCount.mockResolvedValue(0);
    await expect(departmentService.deleteDepartment('d-1')).rejects.toMatchObject({ code: 71103 });
  });

  it('deleteDepartment 有在职员工 → 71104', async () => {
    mocks.deptFindFirst.mockResolvedValue(makeDept());
    mocks.deptCount.mockResolvedValue(0);
    mocks.empCount.mockResolvedValue(2);
    await expect(departmentService.deleteDepartment('d-1')).rejects.toMatchObject({ code: 71104 });
  });

  it('moveDepartment 成功', async () => {
    mocks.deptFindFirst
      .mockResolvedValueOnce(makeDept({ id: 'd-1', parentId: null }))
      .mockResolvedValueOnce(makeDept({ id: 'new-parent', parentId: null }))
      .mockResolvedValueOnce({ parentId: null }); // depth of new-parent = 0
    mocks.deptUpdate.mockResolvedValue(makeDept({ id: 'd-1', parentId: 'new-parent', order: 2 }));
    const result = await departmentService.moveDepartment('d-1', 'new-parent', 2, 'u-1');
    expect(result.parentId).toBe('new-parent');
  });

  it('checkHeadcountWarning 超阈值返回列表', async () => {
    mocks.getValue.mockResolvedValue(1.1);
    mocks.deptFindMany.mockResolvedValue([
      makeDept({ id: 'd-1', headcount: 10, name: 'HR' }),
    ]);
    mocks.empGroupBy.mockResolvedValue([
      { departmentId: 'd-1', _count: { _all: 12 } },
    ]);
    const warnings = await departmentService.checkHeadcountWarning('c-1');
    expect(warnings.length).toBe(1);
    expect(warnings[0].code).toBe(71107);
  });
});
