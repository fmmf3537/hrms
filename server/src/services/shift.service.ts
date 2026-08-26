// M2-B1: 班次定义与排班 service | HRMS
// 状态机：draft → active → archived
// 仅 import audit/config/notification + prisma；员工/部门/公司走 prisma 直接查询

import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';
import * as configService from './config.service';
import * as notificationService from './notification.service';

const RESOURCE_TYPE = 'ShiftTemplate';
const ASSIGN_RESOURCE = 'ShiftAssignment';

const NOTIFY_ASSIGNED = 'shift_assigned:in_app';

const DEFAULT_SHIFT_TYPES = ['standard', 'comprehensive', 'flexible'];

export interface CreateShiftInput {
  code: string;
  name: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  breakStart?: string;
  breakEnd?: string;
  workHours: number;
  flexMinutes?: number;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string;
  companyId: string;
  description?: string;
}

export interface UpdateShiftInput {
  code?: string;
  name?: string;
  shiftType?: string;
  startTime?: string;
  endTime?: string;
  breakStart?: string | null;
  breakEnd?: string | null;
  workHours?: number;
  flexMinutes?: number;
  effectiveFrom?: Date | string;
  effectiveTo?: Date | string | null;
  companyId?: string;
  description?: string | null;
  status?: string;
}

export interface ListShiftsQuery {
  companyId?: string;
  shiftType?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface AssignShiftsInput {
  shiftId: string;
  assigneeType: 'employee' | 'department';
  employeeIds?: string[];
  departmentIds?: string[];
  effectiveFrom: Date | string;
  effectiveTo?: Date | string;
  remark?: string;
}

export interface ConflictDetail {
  employeeId?: string;
  departmentId?: string;
  reason: string;
  code: number;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * HH:mm 字符串转分钟数
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * HH:mm 字符串比较
 */
function timeBefore(a: string, b: string): boolean {
  return timeToMinutes(a) < timeToMinutes(b);
}

/**
 * 检查 breakStart/breakEnd 是否在 startTime ~ endTime 范围内
 */
function isBreakInWorkTime(
  breakStart: string,
  breakEnd: string,
  startTime: string,
  endTime: string,
): boolean {
  return timeBefore(startTime, breakStart)
    && timeBefore(breakStart, breakEnd)
    && timeBefore(breakEnd, endTime);
}

function daysInclusive(from: Date, to: Date): number {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

function rangesOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null,
): boolean {
  const aEnd = aTo ? startOfDay(aTo) : new Date('9999-12-31');
  const bEnd = bTo ? startOfDay(bTo) : new Date('9999-12-31');
  return startOfDay(aFrom) <= bEnd && startOfDay(bFrom) <= aEnd;
}

async function getShiftTypes(): Promise<string[]> {
  try {
    const v = await configService.getValue('shift', 'types');
    if (Array.isArray(v)) return v.map(String);
    return [...DEFAULT_SHIFT_TYPES];
  } catch {
    // TODO: configs.shift.types fallback
    return [...DEFAULT_SHIFT_TYPES];
  }
}

async function getMaxConsecutiveDays(): Promise<number> {
  try {
    const v = await configService.getValue('shift', 'max_consecutive_days');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 6;
  } catch {
    // TODO: configs.shift.max_consecutive_days fallback
    return 6;
  }
}

async function getMinRestHours(): Promise<number> {
  try {
    const v = await configService.getValue('shift', 'min_rest_hours');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 12;
  } catch {
    // TODO: configs.shift.min_rest_hours fallback
    return 12;
  }
}

async function getDefaultBreakDuration(): Promise<number> {
  try {
    const v = await configService.getValue('shift', 'break_duration');
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 90;
  } catch {
    // TODO: configs.shift.break_duration fallback
    return 90;
  }
}

function validateTimeRange(startTime: string, endTime: string): void {
  if (!timeBefore(startTime, endTime)) {
    throw new AppError('上下班时间范围不合法', 400, 71803);
  }
}

function validateEffectiveDates(from: Date, to?: Date | null): void {
  if (to && startOfDay(from) > startOfDay(to)) {
    throw new AppError('生效日期不合法', 400, 71806);
  }
}

async function validateShiftType(shiftType: string): Promise<void> {
  const types = await getShiftTypes();
  if (!types.includes(shiftType)) {
    throw new AppError('班次类型不合法', 400, 71810);
  }
}

async function validateFlexMinutes(flexMinutes: number): Promise<void> {
  if (flexMinutes > 60) {
    throw new AppError('弹性时间超限（≤60分钟）', 400, 71805);
  }
  await Promise.resolve();
}

async function validateCompany(companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    throw new AppError('法人不存在', 404, 71001);
  }
}

async function validateCreateFields(input: {
  code: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  breakStart?: string;
  breakEnd?: string;
  flexMinutes: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  companyId: string;
  excludeId?: string;
}): Promise<void> {
  const existing = await prisma.shiftTemplate.findFirst({
    where: {
      code: input.code,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
  });
  if (existing) {
    throw new AppError('班次编码已存在', 409, 71802);
  }

  await validateShiftType(input.shiftType);
  validateTimeRange(input.startTime, input.endTime);

  if (input.breakStart && input.breakEnd) {
    if (!isBreakInWorkTime(
      input.breakStart,
      input.breakEnd,
      input.startTime,
      input.endTime,
    )) {
      throw new AppError('午休时间必须包含在工作时间内', 400, 71804);
    }
  }

  await validateFlexMinutes(input.flexMinutes);
  validateEffectiveDates(input.effectiveFrom, input.effectiveTo);
  await validateCompany(input.companyId);
}

async function enrichShift(record: {
  id: string;
  companyId: string;
  [key: string]: unknown;
}) {
  const [company, assignmentCount] = await Promise.all([
    prisma.company.findUnique({
      where: { id: record.companyId },
      select: { id: true, code: true, name: true },
    }),
    prisma.shiftAssignment.count({ where: { shiftId: record.id } }),
  ]);
  return { ...record, company, assignmentCount };
}

/**
 * HR 创建班次模板（draft）
 */
export async function createShift(
  input: CreateShiftInput,
  createdBy: string,
) {
  const effectiveFrom = toDate(input.effectiveFrom);
  const effectiveTo = input.effectiveTo ? toDate(input.effectiveTo) : undefined;
  const flexMinutes = input.flexMinutes ?? 30;

  await validateCreateFields({
    code: input.code,
    shiftType: input.shiftType,
    startTime: input.startTime,
    endTime: input.endTime,
    breakStart: input.breakStart,
    breakEnd: input.breakEnd,
    flexMinutes,
    effectiveFrom,
    effectiveTo,
    companyId: input.companyId,
  });

  let breakDuration: number | undefined;
  if (input.breakStart && input.breakEnd) {
    breakDuration = timeToMinutes(input.breakEnd) - timeToMinutes(input.breakStart);
  } else {
    breakDuration = await getDefaultBreakDuration();
  }

  const record = await prisma.shiftTemplate.create({
    data: {
      code: input.code,
      name: input.name,
      shiftType: input.shiftType,
      startTime: input.startTime,
      endTime: input.endTime,
      breakStart: input.breakStart,
      breakEnd: input.breakEnd,
      breakDuration,
      workHours: new Decimal(input.workHours),
      flexMinutes,
      effectiveFrom,
      effectiveTo,
      companyId: input.companyId,
      description: input.description,
      status: 'draft',
      createdBy,
    },
  });

  await auditService.auditLog({
    userId: createdBy,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.CREATE,
    resourceType: RESOURCE_TYPE,
    resourceId: record.id,
    description: `创建班次模板 ${input.code}`,
    newValue: { code: input.code, shiftType: input.shiftType },
  });

  return record;
}

/**
 * 单查（含 company 关联 + assignmentCount）
 */
export async function getShiftById(id: string) {
  const record = await prisma.shiftTemplate.findUnique({ where: { id } });
  if (!record) {
    throw new AppError('班次不存在', 404, 71801);
  }
  return enrichShift(record);
}

/**
 * 列表（分页 + 过滤）
 */
export async function listShifts(query: ListShiftsQuery = {}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where: Prisma.ShiftTemplateWhereInput = {
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.shiftType ? { shiftType: query.shiftType } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.shiftTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.shiftTemplate.count({ where }),
  ]);

  const enriched = await Promise.all(data.map((r) => enrichShift(r)));

  return {
    data: enriched,
    total,
    page,
    pageSize,
  };
}

/**
 * 归档（draft / active → archived）
 */
export async function archiveShift(id: string, operatorId: string) {
  const existing = await prisma.shiftTemplate.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('班次不存在', 404, 71801);
  }
  if (existing.status === 'archived') {
    return existing;
  }

  const activeAssignment = await prisma.shiftAssignment.findFirst({
    where: {
      shiftId: id,
      effectiveTo: null,
    },
  });
  if (activeAssignment) {
    throw new AppError('班次已被分配，请先取消分配', 409, 71807);
  }

  const updated = await prisma.shiftTemplate.update({
    where: { id },
    data: {
      status: 'archived',
      archivedAt: new Date(),
      archivedBy: operatorId,
    },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'ARCHIVE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: `归档班次 ${existing.code}`,
    oldValue: { status: existing.status },
    newValue: { status: 'archived' },
  });

  return updated;
}

/**
 * 更新（仅 draft / active 可改；status='archived' 触发归档）
 */
export async function updateShift(
  id: string,
  input: UpdateShiftInput,
  operatorId: string,
) {
  if (input.status === 'archived') {
    return archiveShift(id, operatorId);
  }

  const existing = await prisma.shiftTemplate.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('班次不存在', 404, 71801);
  }
  if (existing.status === 'archived') {
    throw new AppError('已归档班次不可修改', 409, 71803);
  }

  const startTime = input.startTime ?? existing.startTime;
  const endTime = input.endTime ?? existing.endTime;
  const breakStart = input.breakStart !== undefined
    ? (input.breakStart ?? undefined)
    : (existing.breakStart ?? undefined);
  const breakEnd = input.breakEnd !== undefined
    ? (input.breakEnd ?? undefined)
    : (existing.breakEnd ?? undefined);
  const effectiveFrom = input.effectiveFrom !== undefined
    ? toDate(input.effectiveFrom)
    : existing.effectiveFrom;
  const { effectiveTo: existingEffectiveTo } = existing;
  let effectiveTo = existingEffectiveTo;
  if (input.effectiveTo !== undefined) {
    effectiveTo = input.effectiveTo === null ? null : toDate(input.effectiveTo);
  }

  await validateCreateFields({
    code: input.code ?? existing.code,
    shiftType: input.shiftType ?? existing.shiftType,
    startTime,
    endTime,
    breakStart,
    breakEnd,
    flexMinutes: input.flexMinutes ?? existing.flexMinutes,
    effectiveFrom,
    effectiveTo,
    companyId: input.companyId ?? existing.companyId,
    excludeId: id,
  });

  const { breakDuration: existingBreakDuration } = existing;
  let breakDuration = existingBreakDuration;
  if (breakStart && breakEnd) {
    breakDuration = timeToMinutes(breakEnd) - timeToMinutes(breakStart);
  }

  const nextStatus = input.status ?? existing.status;
  if (nextStatus !== 'draft' && nextStatus !== 'active') {
    throw new AppError('非法状态转换', 409, 71803);
  }

  const updated = await prisma.shiftTemplate.update({
    where: { id },
    data: {
      code: input.code,
      name: input.name,
      shiftType: input.shiftType,
      startTime: input.startTime,
      endTime: input.endTime,
      breakStart: input.breakStart,
      breakEnd: input.breakEnd,
      breakDuration,
      workHours: input.workHours !== undefined ? new Decimal(input.workHours) : undefined,
      flexMinutes: input.flexMinutes,
      effectiveFrom: input.effectiveFrom !== undefined ? effectiveFrom : undefined,
      effectiveTo: input.effectiveTo !== undefined ? effectiveTo : undefined,
      companyId: input.companyId,
      description: input.description,
      status: nextStatus,
    },
  });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: auditService.AUDIT_ACTIONS.UPDATE,
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '更新班次模板',
    oldValue: { status: existing.status },
    newValue: { status: updated.status, name: updated.name },
  });

  return updated;
}

/**
 * 内部：排班冲突检测
 */
export async function validateShiftAssignmentConflict(
  employeeId: string,
  newShiftId: string,
  effectiveFrom: Date,
  effectiveTo?: Date,
): Promise<ConflictDetail[]> {
  const conflicts: ConflictDetail[] = [];
  const newShift = await prisma.shiftTemplate.findUnique({ where: { id: newShiftId } });
  if (!newShift) return conflicts;

  const newFrom = startOfDay(effectiveFrom);
  const newTo = effectiveTo ? startOfDay(effectiveTo) : null;

  const existingAssignments = await prisma.shiftAssignment.findMany({
    where: {
      employeeId,
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: newFrom } },
      ],
    },
    include: { shift: true },
  });

  const maxDays = await getMaxConsecutiveDays();
  const minRestHours = await getMinRestHours();

  existingAssignments.forEach((asg) => {
    const exFrom = startOfDay(asg.effectiveFrom);
    const exTo = asg.effectiveTo ? startOfDay(asg.effectiveTo) : null;

    if (rangesOverlap(exFrom, exTo, newFrom, newTo ?? newFrom)) {
      conflicts.push({
        employeeId,
        reason: '同员工同日期范围已有班次分配',
        code: 71808,
      });
      return;
    }

    const gapDays = exTo
      ? daysInclusive(exTo, newFrom) - 1
      : daysInclusive(exFrom, newFrom) - 1;

    if (exTo && gapDays === 0) {
      const prevEndMin = timeToMinutes(asg.shift.endTime);
      const newStartMin = timeToMinutes(newShift.startTime);
      const restHours = (24 * 60 - prevEndMin + newStartMin) / 60;
      if (restHours < minRestHours) {
        conflicts.push({
          employeeId,
          reason: `相邻班次休息间隔 ${restHours.toFixed(1)} 小时，低于 ${minRestHours} 小时`,
          code: 71809,
        });
      }
    }

    const consecutiveBefore = exTo
      ? daysInclusive(exFrom, exTo)
      : daysInclusive(exFrom, newFrom);
    const consecutiveAfter = newTo
      ? daysInclusive(newFrom, newTo)
      : 1;
    const adjacent = exTo
      && (startOfDay(exTo).getTime() + 86400000 === newFrom.getTime()
        || startOfDay(newTo ?? newFrom).getTime() === exFrom.getTime());

    if (adjacent && consecutiveBefore + consecutiveAfter > maxDays) {
      conflicts.push({
        employeeId,
        reason: `连续工作超过 ${maxDays} 天`,
        code: 71809,
      });
    }
  });

  const newSpan = newTo ? daysInclusive(newFrom, newTo) : 1;
  if (newSpan > maxDays) {
    conflicts.push({
      employeeId,
      reason: `单次排班跨度 ${newSpan} 天，超过 ${maxDays} 天`,
      code: 71809,
    });
  }

  return conflicts;
}

/**
 * 内部：取消排班（不暴露端点，供 B6 或独立任务）
 */
export async function cancelAssignment(
  assignmentId: string,
  operatorId: string,
  reason: string,
) {
  const existing = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
  });
  if (!existing) {
    throw new AppError('排班记录不存在', 404, 71801);
  }

  await prisma.shiftAssignment.delete({ where: { id: assignmentId } });

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'CANCEL',
    resourceType: ASSIGN_RESOURCE,
    resourceId: assignmentId,
    description: '取消排班',
    newValue: { reason, shiftId: existing.shiftId },
  });

  return existing;
}

/**
 * 批量排班
 */
export async function assignShifts(
  input: AssignShiftsInput,
  operatorId: string,
): Promise<{ created: number; conflicts: ConflictDetail[] }> {
  const shift = await prisma.shiftTemplate.findUnique({ where: { id: input.shiftId } });
  if (!shift) {
    throw new AppError('班次不存在', 404, 71801);
  }
  if (shift.status !== 'active') {
    throw new AppError('仅 active 班次可分配', 409, 71803);
  }

  const hasEmployees = Boolean(input.employeeIds?.length);
  const hasDepartments = Boolean(input.departmentIds?.length);

  if (hasEmployees && hasDepartments) {
    throw new AppError('员工与部门分配互斥', 400, 71810);
  }
  if (!hasEmployees && !hasDepartments) {
    throw new AppError('必须指定员工或部门', 400, 71810);
  }
  if (input.assigneeType === 'employee' && !hasEmployees) {
    throw new AppError('员工分配类型需提供 employeeIds', 400, 71810);
  }
  if (input.assigneeType === 'department' && !hasDepartments) {
    throw new AppError('部门分配类型需提供 departmentIds', 400, 71810);
  }

  const effectiveFrom = toDate(input.effectiveFrom);
  const effectiveTo = input.effectiveTo ? toDate(input.effectiveTo) : undefined;
  validateEffectiveDates(effectiveFrom, effectiveTo);

  const allConflicts: ConflictDetail[] = [];
  const toCreate: Prisma.ShiftAssignmentCreateManyInput[] = [];

  /* eslint-disable no-await-in-loop -- 需逐员工/部门校验存在与冲突 */
  if (input.assigneeType === 'employee' && input.employeeIds) {
    // eslint-disable-next-line no-restricted-syntax -- 需逐员工校验冲突
    for (const employeeId of input.employeeIds) {
      const employee = await prisma.employee.findFirst({
        where: { id: employeeId, deletedAt: null },
      });
      if (!employee) {
        throw new AppError('员工不存在', 404, 71201);
      }

      const duplicate = await prisma.shiftAssignment.findFirst({
        where: {
          employeeId,
          effectiveFrom: { lte: effectiveTo ?? effectiveFrom },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: effectiveFrom } },
          ],
        },
      });
      if (duplicate) {
        throw new AppError('该员工在此期间已有班次', 409, 71808);
      }

      const conflicts = await validateShiftAssignmentConflict(
        employeeId,
        input.shiftId,
        effectiveFrom,
        effectiveTo,
      );
      if (conflicts.length > 0) {
        allConflicts.push(...conflicts);
      } else {
        toCreate.push({
          shiftId: input.shiftId,
          assigneeType: 'employee',
          employeeId,
          effectiveFrom,
          effectiveTo,
          remark: input.remark,
          createdBy: operatorId,
        });
      }
    }
  }

  if (input.assigneeType === 'department' && input.departmentIds) {
    // eslint-disable-next-line no-restricted-syntax -- 需逐部门校验存在
    for (const departmentId of input.departmentIds) {
      const dept = await prisma.department.findUnique({ where: { id: departmentId } });
      if (!dept) {
        throw new AppError('部门不存在', 404, 71101);
      }

      const duplicate = await prisma.shiftAssignment.findFirst({
        where: {
          departmentId,
          effectiveFrom: { lte: effectiveTo ?? effectiveFrom },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: effectiveFrom } },
          ],
        },
      });
      if (duplicate) {
        throw new AppError('该部门在此期间已有班次', 409, 71808);
      }

      toCreate.push({
        shiftId: input.shiftId,
        assigneeType: 'department',
        departmentId,
        effectiveFrom,
        effectiveTo,
        remark: input.remark,
        createdBy: operatorId,
      });
    }
  }
  /* eslint-enable no-await-in-loop */

  const totalTargets = (input.employeeIds?.length ?? 0) + (input.departmentIds?.length ?? 0);
  if (totalTargets > 0 && toCreate.length === 0) {
    throw new AppError('全部目标存在排班冲突', 409, 71809);
  }

  if (toCreate.length > 0) {
    await prisma.shiftAssignment.createMany({ data: toCreate });
  }

  if (input.assigneeType === 'employee' && input.employeeIds) {
    await Promise.all(
      input.employeeIds.map(async (employeeId) => {
        const employee = await prisma.employee.findFirst({
          where: { id: employeeId, deletedAt: null },
          select: { userId: true, name: true },
        });
        if (!employee?.userId) return;
        // TODO: 模板 shift_assigned 入库后去掉 bypassTemplate
        await notificationService.sendNotification({
          templateKey: NOTIFY_ASSIGNED,
          userId: employee.userId,
          data: {
            shift_name: shift.name,
            employee_name: employee.name,
            effective_from: effectiveFrom.toISOString().slice(0, 10),
          },
          bypassTemplate: {
            channel: 'in_app',
            subject: '排班通知',
            content: `${employee.name}，您已被分配班次「${shift.name}」，生效日 ${effectiveFrom.toISOString().slice(0, 10)}。`,
          },
        }).catch(() => undefined);
      }),
    );
  }

  await auditService.auditLog({
    userId: operatorId,
    actorType: 'USER',
    action: 'ASSIGN',
    resourceType: RESOURCE_TYPE,
    resourceId: input.shiftId,
    description: `批量排班 ${toCreate.length} 条`,
    newValue: {
      created: toCreate.length,
      conflicts: allConflicts.length,
    },
  });

  return {
    created: toCreate.length,
    conflicts: allConflicts,
  };
}
