/**
 * 部门 API 单测（M5-2-A1）
 */
import { DEPARTMENT_PATHS } from '@/api/department';
import { unwrapList } from '@/api/types/organization';
import type { Department } from '@/api/types/organization';

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

describe('api/department.ts', () => {
  it('list/tree/move/headcount 路径对齐后端', () => {
    expectEqual(DEPARTMENT_PATHS.list, '/departments', 'list');
    expectEqual(DEPARTMENT_PATHS.tree, '/departments/tree', 'tree');
    expectEqual(DEPARTMENT_PATHS.move('d1'), '/departments/d1/move', 'move');
    expectEqual(DEPARTMENT_PATHS.headcount('d1'), '/departments/d1/headcount', 'headcount');
  });

  it('unwrapList 解析部门树 data[]', () => {
    const tree = unwrapList<Department>({
      success: true,
      data: [
        {
          id: 'd1',
          name: '研发',
          children: [{ id: 'd2', name: '前端' }],
        },
      ],
    });
    expectEqual(tree.length, 1, 'root');
    expectEqual(tree[0].children?.length, 1, 'child');
  });

  it('Department 含 children 可选字段', () => {
    const node: Department = {
      id: 'd1',
      companyId: 'c1',
      parentId: null,
      code: 'RD',
      name: '研发',
      leaderId: null,
      headcount: 10,
      order: 1,
      status: 'active',
      children: [],
      createdAt: '',
      updatedAt: '',
    };
    expectEqual(Array.isArray(node.children), true, 'children');
  });
});

export function runDepartmentTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const departmentTestCount = cases.length;
