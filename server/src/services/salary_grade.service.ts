// M4-C1: 薪级定义 service | HRMS
// 仅 import audit/config + prisma；不写 employee_salary_history

import type { Prisma, SalaryGrade, SalaryGradeSequence } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'salary_grade';
const FALLBACK_SEQUENCES = ['M', 'T', 'P', 'S', 'A'];
const FALLBACK_RATIO: Record<string, number> = {
  M: 0.6, T: 0.8, P: 0.75, S: 0, A: 0.85,
};

export interface CreateGradeInput {
  sequence: string;
  gradeCode: string;
  name: string;
  minBaseSalary: number;
  maxBaseSalary: number;
  minPerformanceBase: number;
  maxPerformanceBase: number;
}

export interface UpdateGradeInput {
  name?: string;
  minBaseSalary?: number;
  maxBaseSalary?: number;
  minPerformanceBase?: number;
  maxPerformanceBase?: number;
}

export interface ListGradeFilter {
  sequence?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedGrades {
  items: SalaryGrade[];
  total: number;
  page: number;
  pageSize: number;
}

async function getSalarySequences(): Promise<string[]> {
  try {
    const v = await configService.getValue('salary', 'grade.sequences');
    if (Array.isArray(v) && v.every((x): x is string => typeof x === 'string')) {
      return v;
    }
    return FALLBACK_SEQUENCES;
  } catch {
    // TODO: configs.salary.grade.sequences 未配置时 fallback
    return FALLBACK_SEQUENCES;
  }
}

async function getFixedFloatingRatio(): Promise<Record<string, number>> {
  try {
    const v = await configService.getValue('salary', 'grade.fixed_floating_ratio');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, number>;
    }
    return FALLBACK_RATIO;
  } catch {
    // TODO: configs.salary.grade.fixed_floating_ratio 未配置时 fallback
    return FALLBACK_RATIO;
  }
}

function toNumber(v: Decimal | number): number {
  return typeof v === 'number' ? v : Number(v);
}

function assertRange(min: number, max: number, label: string): void {
  if (!(min < max)) {
    throw new AppError(`${label} 范围不合法：最小值须小于最大值`, 400, 73003);
  }
}

/**
 * 创建薪级（V1.2 §二.3.1 薪级薪档）
 * @param actorId 操作人 ID（hr/admin）
 * @param input { sequence, gradeCode, name, minBaseSalary, maxBaseSalary, minPerformanceBase, maxPerformanceBase }
 * @returns 新创建的 salary_grades 记录
 * @throws AppError(400, 73004) sequence 不在 M/T/P/S/A
 * @throws AppError(400, 73002) sequence + gradeCode 重复
 * @throws AppError(400, 73003) min ≥ max（基本工资或绩效工资）
 * 校验链：
 *  1. 校验 sequence ∈ configs.salary.grade.sequences → 否则抛 73004
 *  2. 校验 gradeCode 唯一（@@unique([sequence, gradeCode])）→ 重复抛 73002
 *  3. 校验 minBaseSalary < maxBaseSalary → 否则抛 73003
 *  4. 校验 minPerformanceBase < maxPerformanceBase → 否则抛 73003
 *  5. 读取固浮比 configs.salary.grade.fixed_floating_ratio（C1 仅读取，不落库）
 *  6. 创建记录（status = active）
 *  7. 写 audit（SALARY_GRADE_CREATE）
 */
export async function createGrade(
  actorId: string,
  input: CreateGradeInput,
): Promise<SalaryGrade> {
  const {
    sequence, gradeCode, name,
    minBaseSalary, maxBaseSalary, minPerformanceBase, maxPerformanceBase,
  } = input;

  const sequences = await getSalarySequences();
  if (!sequences.includes(sequence)) {
    throw new AppError('薪级序列不合法，应为 M / T / P / S / A', 400, 73004);
  }

  const existing = await prisma.salaryGrade.findUnique({
    where: { sequence_gradeCode: { sequence: sequence as SalaryGradeSequence, gradeCode } },
  });
  if (existing) {
    throw new AppError('同序列薪级编码已存在', 400, 73002);
  }

  assertRange(minBaseSalary, maxBaseSalary, '基本工资');
  assertRange(minPerformanceBase, maxPerformanceBase, '绩效工资基数');

  const ratio = await getFixedFloatingRatio();

  const created = await prisma.salaryGrade.create({
    data: {
      sequence: sequence as SalaryGradeSequence,
      gradeCode,
      name,
      minBaseSalary: new Decimal(minBaseSalary),
      maxBaseSalary: new Decimal(maxBaseSalary),
      minPerformanceBase: new Decimal(minPerformanceBase),
      maxPerformanceBase: new Decimal(maxPerformanceBase),
      status: 'active',
      createdById: actorId,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_GRADE_CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: created.id,
    description: `创建薪级 ${sequence}${gradeCode} ${name}`,
    newValue: {
      sequence, gradeCode, name, minBaseSalary, maxBaseSalary, ratio: ratio[sequence],
    },
  });

  return created;
}

/**
 * 列出薪级（sequence / status 过滤 + 分页）
 * @param actorId 操作人 ID
 * @param filter { sequence?, status?, page, pageSize }
 */
export async function listGrades(
  _actorId: string,
  filter: ListGradeFilter,
): Promise<PaginatedGrades> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  if (page < 1 || pageSize < 1 || pageSize > 100) {
    throw new AppError('分页参数不合法', 400);
  }

  const where: Prisma.SalaryGradeWhereInput = {};
  if (filter.sequence) where.sequence = filter.sequence as SalaryGradeSequence;
  if (filter.status) where.status = filter.status as Prisma.EnumSalaryGradeStatusFilter['equals'];

  const [items, total] = await Promise.all([
    prisma.salaryGrade.findMany({
      where,
      orderBy: [{ sequence: 'asc' }, { gradeCode: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.salaryGrade.count({ where }),
  ]);

  return {
    items, total, page, pageSize,
  };
}

/**
 * 更新薪级（仅 active 可改 range + name；sequence + gradeCode 不可改）
 * @param actorId 操作人 ID
 * @param id grade ID
 * @param input { name?, minBaseSalary?, maxBaseSalary?, minPerformanceBase?, maxPerformanceBase? }
 * @throws AppError(400, 73001) grade 不存在
 * @throws AppError(400) 状态非 active
 * @throws AppError(400, 73003) min ≥ max
 */
export async function updateGrade(
  actorId: string,
  id: string,
  input: UpdateGradeInput,
): Promise<SalaryGrade> {
  const grade = await prisma.salaryGrade.findUnique({ where: { id } });
  if (!grade) {
    throw new AppError('薪级不存在', 400, 73001);
  }
  if (grade.status !== 'active') {
    throw new AppError('已归档薪级不可修改', 400);
  }

  const minBase = input.minBaseSalary ?? toNumber(grade.minBaseSalary);
  const maxBase = input.maxBaseSalary ?? toNumber(grade.maxBaseSalary);
  const minPerf = input.minPerformanceBase ?? toNumber(grade.minPerformanceBase);
  const maxPerf = input.maxPerformanceBase ?? toNumber(grade.maxPerformanceBase);
  assertRange(minBase, maxBase, '基本工资');
  assertRange(minPerf, maxPerf, '绩效工资基数');

  const updated = await prisma.salaryGrade.update({
    where: { id },
    data: {
      name: input.name ?? grade.name,
      minBaseSalary: new Decimal(minBase),
      maxBaseSalary: new Decimal(maxBase),
      minPerformanceBase: new Decimal(minPerf),
      maxPerformanceBase: new Decimal(maxPerf),
    },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_GRADE_UPDATE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `更新薪级 ${grade.gradeCode}`,
    newValue: { name: updated.name, minBase, maxBase },
  });

  return updated;
}

/**
 * 归档薪级（active → archived，需无 active level 关联）
 * @param actorId 操作人 ID
 * @param id grade ID
 * @returns 更新后的 record
 * @throws AppError(400, 73001) grade 不存在
 * @throws AppError(400) 状态非 active
 * @throws AppError(400) 存在 active level 关联
 * 校验链：
 *  1. 查询 grade → 不存在抛 73001
 *  2. 状态检查：status === 'active' → 否则抛 400
 *  3. 查 levels where gradeId=id AND status='active' → 存在抛 400
 *  4. update grade { status='archived' }
 *  5. 写 audit（SALARY_GRADE_ARCHIVE）
 *  注：不写 employee_salary_history
 */
export async function archiveGrade(actorId: string, id: string): Promise<SalaryGrade> {
  const grade = await prisma.salaryGrade.findUnique({ where: { id } });
  if (!grade) {
    throw new AppError('薪级不存在', 400, 73001);
  }
  if (grade.status !== 'active') {
    throw new AppError('薪级状态非 active，无法归档', 400);
  }

  const activeLevels = await prisma.salaryGradeLevel.count({
    where: { gradeId: id, status: 'active' },
  });
  if (activeLevels > 0) {
    throw new AppError('存在未归档薪档，无法归档薪级', 400);
  }

  const archived = await prisma.salaryGrade.update({
    where: { id },
    data: { status: 'archived' },
  });

  await auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_GRADE_ARCHIVE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `归档薪级 ${grade.gradeCode}`,
  });

  return archived;
}
