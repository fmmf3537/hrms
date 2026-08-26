// M3-D2: 考核记录 service | HRMS
// 仅 import audit/config/notification/approval + score/ai service + prisma

import type { PerformanceRecord, Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as approvalService from './approval.service';
import * as auditService from './audit.service';
import * as configService from './config.service';
import * as notificationService from './notification.service';
import type { SaveStageScoreInput } from './performance_score.service';
import {
  assertCurrentScoreExists,
  saveStageScore,
  STAGE_REQUIRED_STATUS,
} from './performance_score.service';

const RESOURCE_TYPE = 'PerformanceRecord';

export const RECORD_STATUS = {
  DRAFT: 'draft',
  SELF_SUBMITTED: 'self_submitted',
  MANAGER_SCORING: 'manager_scoring',
  MANAGER_SCORED: 'manager_scored',
  DEPT_CALIBRATING: 'dept_calibrating',
  DEPT_CALIBRATED: 'dept_calibrated',
  HR_SUMMARIZING: 'hr_summarizing',
  HR_SUMMARIZED: 'hr_summarized',
  CEO_APPROVING: 'ceo_approving',
  CEO_APPROVED: 'ceo_approved',
  ARCHIVED: 'archived',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const;

const REJECTABLE_STATUSES = new Set<string>([
  RECORD_STATUS.SELF_SUBMITTED,
  RECORD_STATUS.MANAGER_SCORING,
  RECORD_STATUS.MANAGER_SCORED,
  RECORD_STATUS.DEPT_CALIBRATING,
  RECORD_STATUS.DEPT_CALIBRATED,
  RECORD_STATUS.HR_SUMMARIZING,
  RECORD_STATUS.HR_SUMMARIZED,
  RECORD_STATUS.CEO_APPROVING,
]);

const FLOW_KEYS = {
  self: 'performance:self_submit',
  manager: 'performance:manager_score',
  calibrate: 'performance:dept_calibrate',
  hr: 'performance:hr_summary',
  ceo: 'performance:ceo_approve',
} as const;

const SUBMIT_NEXT_STATUS: Record<string, string> = {
  [RECORD_STATUS.DRAFT]: RECORD_STATUS.MANAGER_SCORING,
  [RECORD_STATUS.MANAGER_SCORING]: RECORD_STATUS.DEPT_CALIBRATING,
  [RECORD_STATUS.DEPT_CALIBRATING]: RECORD_STATUS.HR_SUMMARIZING,
  [RECORD_STATUS.HR_SUMMARIZING]: RECORD_STATUS.CEO_APPROVING,
};

export interface CreateRecordInput {
  cycleId: string;
  employeeIds: string[];
  schemeId?: string;
}

export interface ListRecordFilter {
  cycleId?: string;
  employeeId?: string;
  status?: string;
  deptId?: string;
  page?: number;
  pageSize?: number;
}

export interface CeoApproveInput {
  finalGrade: 'S' | 'A' | 'B' | 'C' | 'D';
  finalScore: number;
  comment?: string;
}

interface ActorScope {
  selfEmployeeId?: string;
  deptId?: string;
  unrestricted: boolean;
}

async function getPerfConfigBoolean(key: string, fallback: boolean): Promise<boolean> {
  try {
    const v = await configService.getValue('performance', key);
    if (typeof v === 'boolean') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

async function getPerfConfigNumber(key: string, fallback: number): Promise<number> {
  try {
    const v = await configService.getValue('performance', key);
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

async function resolveActorScope(actorId: string): Promise<ActorScope> {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!user) {
    return { unrestricted: true };
  }
  const roleCodes = user.userRoles.map((r) => r.role.code);
  if (roleCodes.includes('admin') || roleCodes.includes('hr') || roleCodes.includes('executive')) {
    return { unrestricted: true };
  }
  const emp = await prisma.employee.findFirst({
    where: { userId: actorId, deletedAt: null },
    select: { id: true, departmentId: true },
  });
  if (roleCodes.includes('dept_head') && emp?.departmentId) {
    return { deptId: emp.departmentId, unrestricted: false };
  }
  if (roleCodes.includes('employee') && emp) {
    return { selfEmployeeId: emp.id, unrestricted: false };
  }
  return { unrestricted: true };
}

async function assertRecordAccess(
  actorId: string,
  record: { employeeId: string; employee?: { departmentId: string | null } },
): Promise<void> {
  const scope = await resolveActorScope(actorId);
  if (scope.unrestricted) return;
  if (scope.selfEmployeeId && record.employeeId !== scope.selfEmployeeId) {
    throw new AppError('无权操作他人考核记录', 403, 72504);
  }
  if (scope.deptId) {
    const deptId = record.employee?.departmentId
      ?? (await prisma.employee.findUnique({
        where: { id: record.employeeId },
        select: { departmentId: true },
      }))?.departmentId;
    if (deptId !== scope.deptId) {
      throw new AppError('无权操作其他部门考核记录', 403, 72504);
    }
  }
}

async function submitApprovalForRecord(
  actorId: string,
  record: PerformanceRecord & { employee?: { name: string } },
  flowKey: string,
  title: string,
): Promise<string> {
  try {
    const instance = await approvalService.submitApproval({
      flowKey,
      businessType: 'performance',
      businessId: record.id,
      title,
      initiatorId: actorId,
      data: {
        recordId: record.id,
        employeeId: record.employeeId,
        cycleId: record.cycleId,
        status: record.status,
      },
    });
    return instance.id;
  } catch (err) {
    if (err instanceof AppError && err.code === 20101) {
      throw new AppError('绩效审批流未配置', 400, 72517);
    }
    throw new AppError('创建审批实例失败', 400, 72518);
  }
}

async function notifyInApp(userId: string, content: string): Promise<void> {
  try {
    await notificationService.sendNotification({
      templateKey: 'performance:notify',
      userId,
      data: { content },
      bypassTemplate: { channel: 'in_app', content },
    });
  } catch {
    // fire-and-forget
  }
}

/**
 * HR 批量创建考核记录
 */
export async function createPerformanceRecord(
  actorId: string,
  input: CreateRecordInput,
): Promise<{ created: PerformanceRecord[]; skipped: Array<{ employeeId: string; reason: string }> }> {
  const cycle = await prisma.performanceCycle.findUnique({ where: { id: input.cycleId } });
  if (!cycle) {
    throw new AppError('考核周期不存在', 404, 72501);
  }
  if (cycle.status !== 'active') {
    throw new AppError('考核周期未激活', 400, 72503);
  }

  const employees = await prisma.employee.findMany({
    where: { id: { in: input.employeeIds }, deletedAt: null },
    select: { id: true, userId: true, name: true },
  });
  const foundIds = new Set(employees.map((e) => e.id));
  const missing = input.employeeIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new AppError(`员工不存在: ${missing.join(',')}`, 400, 72501);
  }

  const created: PerformanceRecord[] = [];
  const skipped: Array<{ employeeId: string; reason: string }> = [];

  await prisma.$transaction(async (tx) => {
    const existing = await tx.performanceRecord.findMany({
      where: {
        cycleId: input.cycleId,
        employeeId: { in: employees.map((e) => e.id) },
      },
      select: { employeeId: true },
    });
    const existingSet = new Set(existing.map((e) => e.employeeId));
    const toCreate = employees.filter((emp) => !existingSet.has(emp.id));
    skipped.push(
      ...employees
        .filter((e) => existingSet.has(e.id))
        .map((emp) => ({ employeeId: emp.id, reason: 'duplicate' })),
    );
    const newRecords = await Promise.all(
      toCreate.map((emp) => tx.performanceRecord.create({
        data: {
          employeeId: emp.id,
          cycleId: input.cycleId,
          schemeId: input.schemeId ?? null,
          status: RECORD_STATUS.DRAFT,
          createdBy: actorId,
        },
      })),
    );
    created.push(...newRecords);
  });

  await Promise.all(created.map((rec) => auditService.auditLog({
    userId: actorId,
    action: 'CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: rec.id,
    description: `创建考核记录 employee=${rec.employeeId}`,
    newValue: { cycleId: input.cycleId, schemeId: input.schemeId },
  })));

  await Promise.all(
    employees
      .filter((e) => e.userId && created.some((c) => c.employeeId === e.id))
      .map((e) => notifyInApp(e.userId!, `您有新的考核记录待自评（周期 ${cycle.name}）`)),
  );

  if (skipped.some((s) => s.reason === 'duplicate')) {
    // 提示性：至少一条重复
  }

  return { created, skipped };
}

/**
 * 列出考核记录（分页 + 权限过滤）
 */
export async function listPerformanceRecords(
  actorId: string,
  filter: ListRecordFilter,
): Promise<{ items: PerformanceRecord[]; total: number; page: number; pageSize: number }> {
  const page = filter.page && filter.page >= 1 ? filter.page : 1;
  const pageSize = filter.pageSize && filter.pageSize >= 1 && filter.pageSize <= 100
    ? filter.pageSize
    : 20;

  const scope = await resolveActorScope(actorId);
  const where: Prisma.PerformanceRecordWhereInput = {
    ...(filter.cycleId ? { cycleId: filter.cycleId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
  };

  if (scope.selfEmployeeId) {
    where.employeeId = scope.selfEmployeeId;
  } else if (scope.deptId || filter.deptId) {
    const deptId = filter.deptId ?? scope.deptId;
    where.employee = { departmentId: deptId };
  }

  const [items, total] = await Promise.all([
    prisma.performanceRecord.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.performanceRecord.count({ where }),
  ]);

  await auditService.auditLog({
    userId: actorId,
    action: 'LIST',
    resourceType: RESOURCE_TYPE,
    resourceId: null,
    description: '列出考核记录',
    newValue: { total, page, pageSize },
  });

  return {
    items, total, page, pageSize,
  };
}

/**
 * 获取考核记录详情
 */
export async function getPerformanceRecord(actorId: string, id: string) {
  const record = await prisma.performanceRecord.findUnique({
    where: { id },
    include: {
      scores: { include: { items: true }, orderBy: [{ stage: 'asc' }, { version: 'desc' }] },
      aiSuggestions: { orderBy: { createdAt: 'desc' }, take: 20 },
      employee: {
        select: {
          id: true, name: true, departmentId: true, userId: true,
        },
      },
      cycle: true,
      scheme: { include: { indicators: true } },
    },
  });
  if (!record) {
    throw new AppError('考核记录不存在', 404, 72501);
  }
  await assertRecordAccess(actorId, record);
  await auditService.auditLog({
    userId: actorId,
    action: 'READ',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '读取考核记录详情',
  });
  return record;
}

async function assertEmployeeSelf(actorId: string, employeeId: string): Promise<void> {
  const emp = await prisma.employee.findFirst({
    where: { userId: actorId, deletedAt: null },
    select: { id: true },
  });
  if (!emp || emp.id !== employeeId) {
    throw new AppError('无权操作他人考核记录', 403, 72504);
  }
}

/**
 * 保存员工自评草稿
 */
export async function saveSelfScore(
  actorId: string,
  recordId: string,
  input: SaveStageScoreInput,
) {
  const record = await prisma.performanceRecord.findUnique({
    where: { id: recordId },
    select: { employeeId: true },
  });
  if (!record) throw new AppError('考核记录不存在', 404, 72501);
  await assertEmployeeSelf(actorId, record.employeeId);
  return saveStageScore(actorId, recordId, 'self', input, 'SELF_EVALUATE');
}

/**
 * 提交员工自评
 */
export async function submitSelf(actorId: string, recordId: string): Promise<PerformanceRecord> {
  const record = await prisma.performanceRecord.findUnique({
    where: { id: recordId },
    include: { employee: { select: { name: true, userId: true } } },
  });
  if (!record) throw new AppError('考核记录不存在', 404, 72501);
  await assertEmployeeSelf(actorId, record.employeeId);
  if (record.status !== RECORD_STATUS.DRAFT) {
    throw new AppError('当前状态不允许提交自评', 400, 72512);
  }
  await assertCurrentScoreExists(recordId, 'self');

  const instanceId = await submitApprovalForRecord(
    actorId,
    record,
    FLOW_KEYS.self,
    `${record.employee.name} 提交绩效自评`,
  );

  const updated = await prisma.performanceRecord.update({
    where: { id: recordId },
    data: {
      status: RECORD_STATUS.MANAGER_SCORING,
      submittedAt: new Date(),
      approvalInstanceId: instanceId,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    action: 'SUBMIT_SELF',
    resourceType: RESOURCE_TYPE,
    resourceId: recordId,
    description: '提交员工自评',
    newValue: { status: updated.status },
  });

  return updated;
}

export async function saveManagerScore(
  actorId: string,
  recordId: string,
  input: SaveStageScoreInput,
) {
  await getPerformanceRecord(actorId, recordId);
  return saveStageScore(actorId, recordId, 'manager', input, 'MANAGER_SCORE');
}

export async function submitManagerScore(
  actorId: string,
  recordId: string,
): Promise<PerformanceRecord> {
  const record = await prisma.performanceRecord.findUnique({
    where: { id: recordId },
    include: { employee: { select: { name: true } } },
  });
  if (!record) throw new AppError('考核记录不存在', 404, 72501);
  if (record.status !== RECORD_STATUS.MANAGER_SCORING) {
    throw new AppError('当前状态不允许提交上级评分', 400, 72512);
  }
  await assertCurrentScoreExists(recordId, 'manager');

  const instanceId = await submitApprovalForRecord(
    actorId,
    record,
    FLOW_KEYS.manager,
    `${record.employee.name} 上级评分提交`,
  );

  const updated = await prisma.performanceRecord.update({
    where: { id: recordId },
    data: {
      status: RECORD_STATUS.DEPT_CALIBRATING,
      approvalInstanceId: instanceId,
    },
  });

  await auditService.auditLog({
    userId: actorId,
    action: 'SUBMIT_MANAGER',
    resourceType: RESOURCE_TYPE,
    resourceId: recordId,
    description: '提交上级评分',
  });

  return updated;
}

export async function saveCalibration(
  actorId: string,
  recordId: string,
  input: SaveStageScoreInput,
) {
  await getPerformanceRecord(actorId, recordId);
  return saveStageScore(actorId, recordId, 'calibrate', input, 'DEPT_CALIBRATE');
}

export async function submitCalibration(
  actorId: string,
  recordId: string,
): Promise<PerformanceRecord> {
  const record = await prisma.performanceRecord.findUnique({
    where: { id: recordId },
    include: { employee: { select: { name: true } } },
  });
  if (!record) throw new AppError('考核记录不存在', 404, 72501);
  if (record.status !== RECORD_STATUS.DEPT_CALIBRATING) {
    throw new AppError('当前状态不允许提交部门校准', 400, 72512);
  }
  await assertCurrentScoreExists(recordId, 'calibrate');

  const instanceId = await submitApprovalForRecord(
    actorId,
    record,
    FLOW_KEYS.calibrate,
    `${record.employee.name} 部门校准提交`,
  );

  const updated = await prisma.performanceRecord.update({
    where: { id: recordId },
    data: { status: RECORD_STATUS.HR_SUMMARIZING, approvalInstanceId: instanceId },
  });

  await auditService.auditLog({
    userId: actorId,
    action: 'SUBMIT_CALIBRATE',
    resourceType: RESOURCE_TYPE,
    resourceId: recordId,
    description: '提交部门校准',
  });

  return updated;
}

export async function saveHrSummary(
  actorId: string,
  recordId: string,
  input: SaveStageScoreInput,
) {
  await getPerformanceRecord(actorId, recordId);
  return saveStageScore(actorId, recordId, 'hr', input, 'HR_SUMMARY');
}

export async function submitHrSummary(
  actorId: string,
  recordId: string,
): Promise<PerformanceRecord> {
  const record = await prisma.performanceRecord.findUnique({
    where: { id: recordId },
    include: { employee: { select: { name: true } } },
  });
  if (!record) throw new AppError('考核记录不存在', 404, 72501);
  if (record.status !== RECORD_STATUS.HR_SUMMARIZING) {
    throw new AppError('当前状态不允许提交 HR 汇总', 400, 72512);
  }
  await assertCurrentScoreExists(recordId, 'hr');

  const instanceId = await submitApprovalForRecord(
    actorId,
    record,
    FLOW_KEYS.hr,
    `${record.employee.name} HR 汇总提交`,
  );

  const updated = await prisma.performanceRecord.update({
    where: { id: recordId },
    data: { status: RECORD_STATUS.CEO_APPROVING, approvalInstanceId: instanceId },
  });

  await auditService.auditLog({
    userId: actorId,
    action: 'SUBMIT_HR',
    resourceType: RESOURCE_TYPE,
    resourceId: recordId,
    description: '提交 HR 汇总',
  });

  return updated;
}

/**
 * 总经理审批（手动填写 finalGrade / finalScore）
 */
export async function ceoApprove(
  actorId: string,
  recordId: string,
  input: CeoApproveInput,
): Promise<PerformanceRecord> {
  const record = await prisma.performanceRecord.findUnique({
    where: { id: recordId },
    include: { employee: { select: { name: true, userId: true } } },
  });
  if (!record) throw new AppError('考核记录不存在', 404, 72501);
  if (record.status === RECORD_STATUS.CEO_APPROVED) {
    throw new AppError('考核记录已审批', 400, 72520);
  }
  if (record.status !== RECORD_STATUS.CEO_APPROVING) {
    throw new AppError('当前状态不允许总经理审批', 400, 72503);
  }

  const grades = ['S', 'A', 'B', 'C', 'D'];
  if (!grades.includes(input.finalGrade)) {
    throw new AppError('finalGrade 不合法', 400, 72503);
  }
  const minScore = await getPerfConfigNumber('score.min', 0);
  const maxScore = await getPerfConfigNumber('score.max', 100);
  if (input.finalScore < minScore || input.finalScore > maxScore) {
    throw new AppError('finalScore 超出范围', 400, 72508);
  }

  const instanceId = await submitApprovalForRecord(
    actorId,
    record,
    FLOW_KEYS.ceo,
    `${record.employee.name} 总经理审批`,
  );

  const updated = await prisma.performanceRecord.update({
    where: { id: recordId },
    data: {
      status: RECORD_STATUS.CEO_APPROVED,
      finalGrade: input.finalGrade,
      finalScore: input.finalScore,
      approvalInstanceId: instanceId,
    },
  });

  if (record.employee.userId) {
    await notifyInApp(record.employee.userId, `您的绩效考核已审批，等级 ${input.finalGrade}`);
  }

  await auditService.auditLog({
    userId: actorId,
    action: 'CEO_APPROVE',
    resourceType: RESOURCE_TYPE,
    resourceId: recordId,
    description: '总经理审批',
    newValue: { finalGrade: input.finalGrade, finalScore: input.finalScore },
  });

  return updated;
}

/**
 * 归档考核记录
 */
export async function archiveRecord(
  actorId: string,
  recordId: string,
): Promise<PerformanceRecord> {
  const record = await prisma.performanceRecord.findUnique({ where: { id: recordId } });
  if (!record) throw new AppError('考核记录不存在', 404, 72501);
  if (record.status === RECORD_STATUS.ARCHIVED) {
    throw new AppError('考核记录已归档', 400, 72505);
  }
  if (record.status !== RECORD_STATUS.CEO_APPROVED) {
    throw new AppError('当前状态不允许归档', 400, 72503);
  }

  const requireGrade = await getPerfConfigBoolean('archive.required_final_grade', true);
  if (requireGrade && !record.finalGrade) {
    throw new AppError('归档前必须填写 finalGrade', 400, 72503);
  }

  const updated = await prisma.performanceRecord.update({
    where: { id: recordId },
    data: { status: RECORD_STATUS.ARCHIVED, archivedAt: new Date() },
  });

  await auditService.auditLog({
    userId: actorId,
    action: 'ARCHIVE',
    resourceType: RESOURCE_TYPE,
    resourceId: recordId,
    description: '归档考核记录',
  });

  return updated;
}

/**
 * 拒绝考核记录
 */
export async function rejectRecord(
  actorId: string,
  recordId: string,
  input: { reason: string },
): Promise<PerformanceRecord> {
  if (!input.reason || input.reason.trim().length < 5) {
    throw new AppError('拒绝原因必填且至少 5 个字符', 400, 72506);
  }

  const record = await prisma.performanceRecord.findUnique({
    where: { id: recordId },
    include: { employee: { select: { userId: true } } },
  });
  if (!record) throw new AppError('考核记录不存在', 404, 72501);
  if (!REJECTABLE_STATUSES.has(record.status)) {
    throw new AppError('当前状态不允许拒绝', 400, 72519);
  }

  const prevStatus = record.status;

  if (record.approvalInstanceId) {
    try {
      await approvalService.withdraw({
        instanceId: record.approvalInstanceId,
        initiatorId: actorId,
      });
    } catch {
      // 审批可能已结束，继续拒绝
    }
  }

  const updated = await prisma.performanceRecord.update({
    where: { id: recordId },
    data: { status: RECORD_STATUS.REJECTED },
  });

  if (record.employee.userId) {
    await notifyInApp(record.employee.userId, `您的绩效考核已被拒绝：${input.reason}`);
  }

  await auditService.auditLog({
    userId: actorId,
    action: 'REJECT',
    resourceType: RESOURCE_TYPE,
    resourceId: recordId,
    description: '拒绝考核记录',
    newValue: { reason: input.reason, prevStatus },
  });

  return updated;
}

/**
 * 取消考核记录（内部使用，不暴露 HTTP）
 */
export async function cancelRecord(
  _actorId: string,
  recordId: string,
): Promise<PerformanceRecord> {
  const record = await prisma.performanceRecord.findUnique({ where: { id: recordId } });
  if (!record) throw new AppError('考核记录不存在', 404, 72501);
  if (record.status !== RECORD_STATUS.DRAFT && record.status !== RECORD_STATUS.SELF_SUBMITTED) {
    throw new AppError('当前状态不允许取消', 400, 72503);
  }
  return prisma.performanceRecord.update({
    where: { id: recordId },
    data: { status: RECORD_STATUS.CANCELLED },
  });
}

export { STAGE_REQUIRED_STATUS, SUBMIT_NEXT_STATUS };
