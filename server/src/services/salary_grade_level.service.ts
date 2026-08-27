// M4-C1: 薪档定义 service | HRMS
// 仅 import audit/config + prisma；不写 employee_salary_history

import type { Prisma, SalaryGradeLevel } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'salary_grade_level';
const FALLBACK_LEVELS_PER_GRADE = 6;

export interface CreateLevelInput {
  gradeId: string;
  level: number;
  baseSalary: number;
  performanceBase: number;
}

export interface UpdateLevelInput {
  baseSalary?: number;
  performanceBase?: number;
}

export interface ListLevelFilter {
  gradeId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedLevels {
  items: SalaryGradeLevel[];
  total: number;
  page: number;
  pageSize: number;
}

async function getLevelsPerGrade(): Promise<number> {
  try {
    const v = await configService.getValue('salary', 'grade.levels_per_grade');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n >= 5 && n <= 7 ? n : FALLBACK_LEVELS_PER_GRADE;
  } catch {
    // TODO: configs.salary.grade.levels_per_grade 未配置时 fallback
    return FALLBACK_LEVELS_PER_GRADE;
  }
}

function toNumber(v: Decimal | number): number {
  return typeof v === 'number' ? v : Number(v);
}

function assertInGradeRange(
  value: number,
  min: Decimal | number,
  max: Decimal | number,
  label: string,
): void {
  const lo = toNumber(min);
  const hi = toNumber(max);
  if (value < lo || value > hi) {
    throw new AppError(`${label} 不在薪级范围内`, 400, 73007);
  }
}

async function assertIncreasing(
  gradeId: string,
  level: number,
  baseSalary: number,
  excludeId?: string,
): Promise<void> {
  const siblings = await prisma.salaryGradeLevel.findMany({
    where: {
      gradeId,
      status: 'active',
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { level: 'asc' },
  });
  const prev = [...siblings].reverse().find((s) => s.level < level);
  if (prev && baseSalary <= toNumber(prev.baseSalary)) {
    throw new AppError('同薪级下档位基本工资须递增', 400, 73008);
  }
  const next = siblings.find((s) => s.level > level);
  if (next && baseSalary >= toNumber(next.baseSalary)) {
    throw new AppError('同薪级下档位基本工资须递增', 400, 73008);
  }
}

/**
 * 创建薪档（V1.2 §二.3.1 每级 5-7 档）
 * @param actorId 操作人 ID
 * @param input { gradeId, level, baseSalary, performanceBase }
 * @returns 新创建的 salary_grade_levels 记录
 * @throws AppError(400, 73001) gradeId 不存在
 * @throws AppError(400, 73006) 同 gradeId 同一 level 重复
 * @throws AppError(400, 73007) baseSalary / performanceBase 不在 grade 范围
 * @throws AppError(400, 73008) 同 grade 下 level 递增校验失败
 * 校验链：
 *  1. 查 grade → 不存在抛 73001
 *  2. 校验 level ∈ [1, configs.salary.grade.levels_per_grade]
 *  3. 校验同 gradeId 同一 level 唯一 → 重复抛 73006
 *  4. 校验 baseSalary ∈ [grade.minBase, grade.maxBase] → 否则抛 73007
 *  5. 校验 performanceBase ∈ [grade.minPerf, grade.maxPerf] → 否则抛 73007
 *  6. 校验同 grade 下 level 递增（新档 baseSalary > 前一档）→ 否则抛 73008
 *  7. 创建记录（status = active）
 *  8. 写 audit（SALARY_GRADE_LEVEL_CREATE）
 */
export async function createLevel(
  actorId: string,
  input: CreateLevelInput,
): Promise<SalaryGradeLevel> {
  const {
    gradeId, level, baseSalary, performanceBase,
  } = input;

  const grade = await prisma.salaryGrade.findUnique({ where: { id: gradeId } });
  if (!grade) {
    throw new AppError('薪级不存在', 400, 73001);
  }

  const maxLevel = await getLevelsPerGrade();
  if (level < 1 || level > maxLevel) {
    throw new AppError(`档位须在 1-${maxLevel} 之间`, 400);
  }

  const dup = await prisma.salaryGradeLevel.findUnique({
    where: { gradeId_level: { gradeId, level } },
  });
  if (dup) {
    throw new AppError('同薪级下该档位已存在', 400, 73006);
  }

  assertInGradeRange(baseSalary, grade.minBaseSalary, grade.maxBaseSalary, '基本工资');
  assertInGradeRange(
    performanceBase,
    grade.minPerformanceBase,
    grade.maxPerformanceBase,
    '绩效工资基数',
  );
  await assertIncreasing(gradeId, level, baseSalary);

  const created = await prisma.salaryGradeLevel.create({
    data: {
      gradeId,
      level,
      baseSalary: new Decimal(baseSalary),
      performanceBase: new Decimal(performanceBase),
      status: 'active',
      createdById: actorId,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_GRADE_LEVEL_CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: created.id,
    description: `创建薪档 grade=${gradeId} level=${level}`,
    newValue: {
      gradeId, level, baseSalary, performanceBase,
    },
  });

  return created;
}

/**
 * 列出薪档（gradeId / status 过滤 + 分页）
 */
export async function listLevels(
  _actorId: string,
  filter: ListLevelFilter,
): Promise<PaginatedLevels> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  if (page < 1 || pageSize < 1 || pageSize > 100) {
    throw new AppError('分页参数不合法', 400);
  }

  const where: Prisma.SalaryGradeLevelWhereInput = {};
  if (filter.gradeId) where.gradeId = filter.gradeId;
  if (filter.status) {
    where.status = filter.status as Prisma.EnumSalaryGradeLevelStatusFilter['equals'];
  }

  const [items, total] = await Promise.all([
    prisma.salaryGradeLevel.findMany({
      where,
      orderBy: [{ gradeId: 'asc' }, { level: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.salaryGradeLevel.count({ where }),
  ]);

  return {
    items, total, page, pageSize,
  };
}

/**
 * 更新薪档（仅 active 可改 baseSalary + performanceBase；level 不可改）
 * @throws AppError(400, 73005) level 不存在
 * @throws AppError(400, 73007) 越界
 * @throws AppError(400, 73008) 递增校验失败
 */
export async function updateLevel(
  actorId: string,
  id: string,
  input: UpdateLevelInput,
): Promise<SalaryGradeLevel> {
  const record = await prisma.salaryGradeLevel.findUnique({ where: { id } });
  if (!record) {
    throw new AppError('薪档不存在', 400, 73005);
  }
  if (record.status !== 'active') {
    throw new AppError('已归档薪档不可修改', 400);
  }

  const grade = await prisma.salaryGrade.findUnique({ where: { id: record.gradeId } });
  if (!grade) {
    throw new AppError('薪级不存在', 400, 73001);
  }

  const baseSalary = input.baseSalary ?? toNumber(record.baseSalary);
  const performanceBase = input.performanceBase ?? toNumber(record.performanceBase);
  assertInGradeRange(baseSalary, grade.minBaseSalary, grade.maxBaseSalary, '基本工资');
  assertInGradeRange(
    performanceBase,
    grade.minPerformanceBase,
    grade.maxPerformanceBase,
    '绩效工资基数',
  );
  await assertIncreasing(record.gradeId, record.level, baseSalary, id);

  const updated = await prisma.salaryGradeLevel.update({
    where: { id },
    data: {
      baseSalary: new Decimal(baseSalary),
      performanceBase: new Decimal(performanceBase),
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_GRADE_LEVEL_UPDATE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `更新薪档 ${id}`,
    newValue: { baseSalary, performanceBase },
  });

  return updated;
}

/**
 * 归档薪档（active → archived）
 * @throws AppError(400, 73005) level 不存在
 * @throws AppError(400) 已 archived
 */
export async function archiveLevel(actorId: string, id: string): Promise<SalaryGradeLevel> {
  const record = await prisma.salaryGradeLevel.findUnique({ where: { id } });
  if (!record) {
    throw new AppError('薪档不存在', 400, 73005);
  }
  if (record.status !== 'active') {
    throw new AppError('薪档已归档', 400);
  }

  const archived = await prisma.salaryGradeLevel.update({
    where: { id },
    data: { status: 'archived' },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_GRADE_LEVEL_ARCHIVE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `归档薪档 ${id}`,
  });

  return archived;
}
