// M1-A1: 部门 service | HRMS
import type { Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

/** 部门树最大深度：0=根，最多到 3（共 4 级） */
const MAX_DEPT_DEPTH = 3;

export interface CreateDepartmentInput {
  companyId: string;
  parentId?: string | null;
  code: string;
  name: string;
  leaderId?: string;
  headcount?: number;
  order?: number;
  status?: string;
  createdBy?: string;
}

export interface UpdateDepartmentInput {
  name?: string;
  leaderId?: string | null;
  headcount?: number;
  order?: number;
  status?: string;
  parentId?: string | null;
}

export interface ListDepartmentsQuery {
  companyId?: string;
  parentId?: string | null;
  status?: string;
}

export interface DepartmentTreeNode {
  id: string;
  companyId: string;
  parentId: string | null;
  code: string;
  name: string;
  leaderId: string | null;
  headcount: number;
  order: number;
  status: string;
  children: DepartmentTreeNode[];
}

/**
 * 计算部门深度（根=0）
 */
async function getDepartmentDepth(departmentId: string | null | undefined): Promise<number> {
  if (!departmentId) return -1;
  let depth = 0;
  let currentId: string | null = departmentId;
  const visited = new Set<string>();
  while (currentId) {
    if (visited.has(currentId)) {
      throw new AppError('部门存在循环引用', 400, 71106);
    }
    visited.add(currentId);
    // 沿 parent 链逐级上溯，无法批量
    // eslint-disable-next-line no-await-in-loop
    const parent: { parentId: string | null } | null = await prisma.department.findFirst({
      where: { id: currentId, deletedAt: null },
      select: { parentId: true },
    });
    if (!parent) break;
    if (parent.parentId) {
      depth += 1;
      currentId = parent.parentId;
    } else {
      break;
    }
  }
  return depth;
}

/**
 * 检查 newParentId 是否是 deptId 的子孙（防循环）
 */
async function wouldCreateCycle(deptId: string, newParentId: string): Promise<boolean> {
  let currentId: string | null = newParentId;
  const visited = new Set<string>();
  while (currentId) {
    if (currentId === deptId) return true;
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    // eslint-disable-next-line no-await-in-loop
    const row: { parentId: string | null } | null = await prisma.department.findFirst({
      where: { id: currentId, deletedAt: null },
      select: { parentId: true },
    });
    currentId = row?.parentId ?? null;
  }
  return false;
}

/**
 * 读取编制预警阈值，fallback 1.1
 */
async function getWarningRatio(): Promise<number> {
  try {
    const v = await configService.getValue('headcount', 'warning_ratio');
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0) return 1.1;
    return n;
  } catch {
    // TODO: configs.headcount.warning_ratio 未 seed 时 fallback
    return 1.1;
  }
}

/**
 * 新增部门（4 级层级检查）
 */
export async function createDepartment(input: CreateDepartmentInput) {
  const company = await prisma.company.findFirst({
    where: { id: input.companyId, deletedAt: null },
  });
  if (!company) {
    throw new AppError('法人不存在', 404, 71001);
  }

  if (input.parentId) {
    const parent = await prisma.department.findFirst({
      where: { id: input.parentId, companyId: input.companyId, deletedAt: null },
    });
    if (!parent) {
      throw new AppError('上级部门不存在', 404, 71101);
    }
    const parentDepth = await getDepartmentDepth(input.parentId);
    if (parentDepth >= MAX_DEPT_DEPTH) {
      throw new AppError('部门层级超过 4 级上限', 400, 71105);
    }
  }

  const dup = await prisma.department.findFirst({
    where: {
      companyId: input.companyId,
      code: input.code,
      deletedAt: null,
    },
  });
  if (dup) {
    throw new AppError(`部门编码已存在: ${input.code}`, 409, 71102);
  }

  const dept = await prisma.department.create({
    data: {
      companyId: input.companyId,
      parentId: input.parentId ?? null,
      code: input.code,
      name: input.name,
      leaderId: input.leaderId,
      headcount: input.headcount ?? 0,
      order: input.order ?? 0,
      status: input.status ?? 'active',
      createdBy: input.createdBy,
    },
  });

  await auditService.auditLog({
    userId: input.createdBy,
    action: auditService.AUDIT_ACTIONS.CREATE,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.DEPARTMENT,
    resourceId: dept.id,
    description: `创建部门 ${dept.code}`,
    newValue: { code: dept.code, name: dept.name, companyId: dept.companyId },
  });

  return dept;
}

/**
 * 按 ID 查询部门
 */
export async function getDepartmentById(id: string) {
  const dept = await prisma.department.findFirst({
    where: { id, deletedAt: null },
  });
  if (!dept) {
    throw new AppError('部门不存在', 404, 71101);
  }
  return dept;
}

/**
 * 构建部门树
 */
export async function getDepartmentTree(companyId: string, rootId?: string): Promise<DepartmentTreeNode[]> {
  const rows = await prisma.department.findMany({
    where: { companyId, deletedAt: null, status: { not: 'merged' } },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });

  const map = new Map<string, DepartmentTreeNode>();
  rows.forEach((r) => {
    map.set(r.id, {
      id: r.id,
      companyId: r.companyId,
      parentId: r.parentId,
      code: r.code,
      name: r.name,
      leaderId: r.leaderId,
      headcount: r.headcount,
      order: r.order,
      status: r.status,
      children: [],
    });
  });

  const roots: DepartmentTreeNode[] = [];
  map.forEach((node) => {
    if (rootId) {
      if (node.id === rootId) {
        roots.push(node);
      } else if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children.push(node);
      }
    } else if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  if (rootId && roots.length === 0) {
    throw new AppError('部门不存在', 404, 71101);
  }

  return roots;
}

/**
 * 部门列表
 */
export async function listDepartments(query: ListDepartmentsQuery = {}) {
  const where: Prisma.DepartmentWhereInput = {
    deletedAt: null,
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  if (query.parentId === null) {
    where.parentId = null;
  } else if (query.parentId) {
    where.parentId = query.parentId;
  }

  return prisma.department.findMany({
    where,
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });
}

/**
 * 更新部门（防循环引用）
 */
export async function updateDepartment(
  id: string,
  input: UpdateDepartmentInput,
  operatorId?: string,
) {
  const existing = await getDepartmentById(id);

  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === id) {
      throw new AppError('不能将部门设为自己的上级', 400, 71106);
    }
    if (await wouldCreateCycle(id, input.parentId)) {
      throw new AppError('部门存在循环引用', 400, 71106);
    }
    const parentDepth = await getDepartmentDepth(input.parentId);
    if (parentDepth >= MAX_DEPT_DEPTH) {
      throw new AppError('部门层级超过 4 级上限', 400, 71105);
    }
  }

  const dept = await prisma.department.update({
    where: { id },
    data: {
      name: input.name,
      leaderId: input.leaderId,
      headcount: input.headcount,
      order: input.order,
      status: input.status,
      parentId: input.parentId,
    },
  });

  await auditService.auditLog({
    userId: operatorId,
    action: auditService.AUDIT_ACTIONS.UPDATE,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.DEPARTMENT,
    resourceId: id,
    description: `更新部门 ${dept.code}`,
    oldValue: { name: existing.name, status: existing.status },
    newValue: { name: dept.name, status: dept.status },
  });

  return dept;
}

/**
 * 软删除部门（无子部门、无在职员工）
 */
export async function deleteDepartment(id: string, operatorId?: string) {
  const dept = await getDepartmentById(id);

  const [childCount, empCount] = await Promise.all([
    prisma.department.count({ where: { parentId: id, deletedAt: null } }),
    prisma.employee.count({
      where: {
        departmentId: id,
        deletedAt: null,
        status: { not: 'resigned' },
      },
    }),
  ]);

  if (childCount > 0) {
    throw new AppError('部门下仍有子部门，无法删除', 400, 71103);
  }
  if (empCount > 0) {
    throw new AppError('部门下仍有在职员工，无法删除', 400, 71104);
  }

  const deleted = await prisma.department.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'suspended' },
  });

  await auditService.auditLog({
    userId: operatorId,
    action: auditService.AUDIT_ACTIONS.DELETE,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.DEPARTMENT,
    resourceId: id,
    description: `软删除部门 ${dept.code}`,
  });

  return deleted;
}

/**
 * 移动部门到新父节点
 */
export async function moveDepartment(
  id: string,
  newParentId: string | null,
  newOrder?: number,
  operatorId?: string,
) {
  const dept = await getDepartmentById(id);

  if (newParentId) {
    if (newParentId === id) {
      throw new AppError('不能将部门设为自己的上级', 400, 71106);
    }
    const parent = await prisma.department.findFirst({
      where: { id: newParentId, companyId: dept.companyId, deletedAt: null },
    });
    if (!parent) {
      throw new AppError('目标上级部门不存在', 404, 71101);
    }
    if (await wouldCreateCycle(id, newParentId)) {
      throw new AppError('部门存在循环引用', 400, 71106);
    }
    const parentDepth = await getDepartmentDepth(newParentId);
    if (parentDepth >= MAX_DEPT_DEPTH) {
      throw new AppError('部门层级超过 4 级上限', 400, 71105);
    }
  }

  const updated = await prisma.department.update({
    where: { id },
    data: {
      parentId: newParentId,
      ...(newOrder !== undefined ? { order: newOrder } : {}),
    },
  });

  await auditService.auditLog({
    userId: operatorId,
    action: auditService.AUDIT_ACTIONS.UPDATE,
    resourceType: auditService.AUDIT_RESOURCE_TYPES.DEPARTMENT,
    resourceId: id,
    description: `移动部门 ${dept.code}`,
    oldValue: { parentId: dept.parentId },
    newValue: { parentId: newParentId, order: newOrder },
  });

  return updated;
}

/**
 * 编制统计：各部门编制 vs 当前人数
 */
export async function getHeadcountStatistics(companyId: string) {
  const depts = await prisma.department.findMany({
    where: { companyId, deletedAt: null },
    select: {
      id: true, code: true, name: true, headcount: true,
    },
  });

  const warningRatio = await getWarningRatio();
  const grouped = await prisma.employee.groupBy({
    by: ['departmentId'],
    where: {
      companyId,
      deletedAt: null,
      status: { not: 'resigned' },
    },
    _count: { _all: true },
  });
  const countByDept = new Map(grouped.map((g) => [g.departmentId, g._count._all]));

  const result: Record<string, {
    departmentId: string;
    code: string;
    name: string;
    headcount: number;
    currentCount: number;
    warningLevel: 'ok' | 'warning' | 'critical';
  }> = {};

  depts.forEach((d) => {
    const currentCount = countByDept.get(d.id) ?? 0;
    let warningLevel: 'ok' | 'warning' | 'critical' = 'ok';
    if (d.headcount > 0) {
      const ratio = currentCount / d.headcount;
      if (ratio > warningRatio * 1.1) warningLevel = 'critical';
      else if (ratio > warningRatio) warningLevel = 'warning';
    } else if (currentCount > 0) {
      warningLevel = 'warning';
    }
    result[d.id] = {
      departmentId: d.id,
      code: d.code,
      name: d.name,
      headcount: d.headcount,
      currentCount,
      warningLevel,
    };
  });

  return result;
}

/**
 * 编制预警列表（定时任务可调用）
 */
export async function checkHeadcountWarning(companyId: string) {
  const stats = await getHeadcountStatistics(companyId);
  const warningRatio = await getWarningRatio();
  return Object.values(stats)
    .filter((s) => s.headcount > 0 && s.currentCount > s.headcount * warningRatio)
    .map((s) => ({
      ...s,
      // 71107 DEPARTMENT_HEADCOUNT_WARNING（日志用，不抛错）
      code: 71107,
      message: `部门 ${s.name} 在职 ${s.currentCount} > 编制 ${s.headcount} × ${warningRatio}`,
    }));
}
