// M4-C8: 调薪申请 + 审批（1 新表 salary_adjustments；复用 M0.5-1 approval；不改 D6 / C1）| HRMS

import type { SalaryAdjustment, SalaryAdjustmentType } from '@prisma/client';
import { Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as approvalService from './approval.service';
import * as auditService from './audit.service';
import * as configService from './config.service';

const RESOURCE_TYPE = 'salary_adjustment';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ADJUSTMENT_TYPES = new Set<SalaryAdjustmentType>([
  'promotion', 'annual_adjust', 'performance', 'market_adjustment',
]);
const FALLBACK_MIN_RATIO = 0.05;
const FALLBACK_MAX_RATIO = 0.30;
const FALLBACK_NOTICE_DAYS = 7;
const FALLBACK_CEO_THRESHOLD = 5000;
const FLOW_KEY = 'salary:salary_adjustment';
const OPEN_STATUSES = ['pending', 'approved', 'executed'] as const;

export interface CreateAdjustmentInput {
  employeeId: string;
  adjustmentType: SalaryAdjustmentType;
  toBaseSalary: number;
  toPerformanceSalary?: number;
  effectiveDate: string;
  reason: string;
  remark?: string;
}

export interface ApproveAdjustmentInput {
  action: 'approve' | 'reject';
  comment?: string;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null && 'toString' in v) {
    const n = Number((v as { toString(): string }).toString());
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function utcToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

export function parseYmd(value: string, code = 73805): Date {
  if (!DATE_RE.test(value)) {
    throw new AppError('effective_date 格式错，应为 YYYY-MM-DD', 400, code);
  }
  const [ys, ms, ds] = value.split('-');
  return new Date(Date.UTC(Number(ys), Number(ms) - 1, Number(ds)));
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

async function readNumberConfig(key: string, fallback: number): Promise<number> {
  try {
    const v = await configService.getValue('salary', key);
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    // TODO: configs.salary.adjustment.* 未配置时 fallback
    return fallback;
  }
}

async function getMinRatio(): Promise<number> {
  return readNumberConfig('adjustment.min_increase_ratio', FALLBACK_MIN_RATIO);
}

async function getMaxRatio(): Promise<number> {
  return readNumberConfig('adjustment.max_increase_ratio', FALLBACK_MAX_RATIO);
}

async function getNoticeDays(): Promise<number> {
  return readNumberConfig('adjustment.advance_notice_days', FALLBACK_NOTICE_DAYS);
}

async function getCeoThreshold(): Promise<number> {
  return readNumberConfig('adjustment.require_approval_threshold', FALLBACK_CEO_THRESHOLD);
}

async function findActivePlan(employeeId: string, asOf: Date) {
  return prisma.employeeSalaryPlan.findFirst({
    where: {
      employeeId,
      status: 'active',
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });
}

/**
 * 创建调薪申请（V1.2 §二.4.5 调薪 + §四.7 D6 联动）
 * @param actorId 操作人 ID（hr/admin）
 * @param input { employeeId, adjustmentType, toBaseSalary, toPerformanceSalary?, effectiveDate, reason, remark? }
 * @returns 新创建的 SalaryAdjustment（status='draft'）
 * @throws AppError(404, 73804) employee 不存在或已离职
 * @throws AppError(400, 73805) effective_date 格式错或 < 提前通知天数
 * @throws AppError(400, 73806) 减薪 / 涨幅越界
 * @throws AppError(400, 73809) 同 employeeId+effectiveDate+adjustmentType 已存在
 * 校验链：
 *  1. 校验 employeeId 存在（prisma.employee.findUnique）→ 不存在或 status='resigned' 抛 73804
 *  2. 查 C1 employee_salary_plans（当前 active plan）→ 不存在抛 73804
 *  3. 校验 toBaseSalary > fromBaseSalary（C8 不实现减薪流程）→ 否则抛 73806
 *  4. 计算 increaseRatio = (toBaseSalary - fromBaseSalary) / fromBaseSalary
 *  5. 校验 [min_increase_ratio, max_increase_ratio]（默认 [0.05, 0.30]）→ 越界抛 73806
 *  6. 校验 effectiveDate 格式（YYYY-MM-DD）→ 错抛 73805
 *  7. 校验 advance_notice_days（effectiveDate - now() >= 7 默认）→ 否则抛 73805
 *  8. 校验 adjustmentType ∈ 4 种类型
 *  9. 校验同 (employeeId, effectiveDate, adjustmentType) 不存在 → 否则抛 73809
 *  10. 事务：create SalaryAdjustment（status='draft'）
 *  11. 写 audit（SALARY_ADJUSTMENT_CREATE）
 * 注：
 *  - C8 不更新 employees.baseSalary（该字段不存在）
 *  - 联动 C1 employee_salary_plans + M1 employee_salary_history 在 executeAdjustment 阶段
 */
export async function createAdjustment(
  actorId: string,
  input: CreateAdjustmentInput,
): Promise<SalaryAdjustment> {
  if (!ADJUSTMENT_TYPES.has(input.adjustmentType)) {
    throw new AppError('调薪类型非法', 400, 73802);
  }
  if (!input.reason || input.reason.trim() === '') {
    throw new AppError('调薪原因必填', 400, 73802);
  }

  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee || employee.deletedAt) {
    throw new AppError('员工不存在或已离职', 404, 73804);
  }
  if (employee.status !== 'active') {
    throw new AppError('员工不存在或已离职', 404, 73804);
  }

  const today = utcToday();
  const plan = await findActivePlan(input.employeeId, today);
  if (!plan) {
    throw new AppError('员工不存在或已离职', 404, 73804);
  }

  const fromBase = toNum(plan.baseSalary);
  const fromPerf = toNum(plan.performanceBase);
  if (input.toBaseSalary <= fromBase) {
    throw new AppError('严禁减薪', 400, 73806);
  }
  if (fromBase <= 0) {
    throw new AppError('涨幅越界', 400, 73806);
  }
  const increaseRatio = (input.toBaseSalary - fromBase) / fromBase;
  const minRatio = await getMinRatio();
  const maxRatio = await getMaxRatio();
  if (increaseRatio < minRatio || increaseRatio > maxRatio) {
    throw new AppError('涨幅越界', 400, 73806);
  }

  const effectiveDate = parseYmd(input.effectiveDate);
  const noticeDays = await getNoticeDays();
  if (daysBetween(today, effectiveDate) < noticeDays) {
    throw new AppError('effective_date 早于提前通知天数', 400, 73805);
  }

  const overlap = await prisma.salaryAdjustment.findFirst({
    where: {
      employeeId: input.employeeId,
      effectiveDate,
      OR: [
        { adjustmentType: input.adjustmentType },
        { status: { in: [...OPEN_STATUSES] } },
      ],
    },
  });
  if (overlap) {
    throw new AppError('同一员工生效日已有调薪', 400, 73809);
  }

  const toPerf = input.toPerformanceSalary ?? fromPerf;
  const delta = Math.round((input.toBaseSalary - fromBase) * 100) / 100;

  let created: SalaryAdjustment;
  try {
    created = await prisma.salaryAdjustment.create({
      data: {
        employeeId: input.employeeId,
        adjustmentType: input.adjustmentType,
        fromBaseSalary: fromBase,
        fromPerformanceSalary: fromPerf,
        toBaseSalary: input.toBaseSalary,
        toPerformanceSalary: toPerf,
        delta,
        effectiveDate,
        reason: input.reason.trim(),
        remark: input.remark,
        status: 'draft',
        createdBy: actorId,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('同一员工生效日已有调薪', 400, 73809);
    }
    throw err;
  }

  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_ADJUSTMENT_CREATE',
    resourceType: RESOURCE_TYPE,
    resourceId: created.id,
    description: '创建调薪申请',
    newValue: {
      adjustmentId: created.id,
      employeeId: input.employeeId,
      adjustmentType: input.adjustmentType,
      toBaseSalary: input.toBaseSalary,
      effectiveDate: input.effectiveDate,
    },
  });
  return created;
}

/**
 * 提交调薪审批（status='draft' → 'pending'，调 M0.5-1 approval）
 * @param actorId 操作人 ID（hr/admin）
 * @param id adjustment ID
 * @param input { comment?: string }
 * @returns 更新后的 SalaryAdjustment
 * @throws AppError(404, 73801) adjustment 不存在
 * @throws AppError(400, 73802) 状态机非法（不是 draft）
 * @throws AppError(400, 73807) 已 approved 不能再次提交
 * 校验链：
 *  1. 查询 adjustment → 不存在抛 73801
 *  2. 状态检查：status === 'draft' → 否则抛 73802 / 73807
 *  3. 计算 require_ceo_approval = delta > require_approval_threshold（默认 5000）
 *  4. 调 approvalService.submitApproval({ flowKey: 'salary:salary_adjustment', ... })
 *  5. update { status: 'pending', approvalInstanceId }
 *  6. 写 audit（SALARY_ADJUSTMENT_SUBMIT）
 * 注：C8 不创建审批模板；hr 兼任复核
 */
export async function submitAdjustment(
  actorId: string,
  id: string,
  input?: { comment?: string },
): Promise<SalaryAdjustment> {
  const rec = await prisma.salaryAdjustment.findUnique({ where: { id } });
  if (!rec) {
    throw new AppError('调薪申请不存在', 404, 73801);
  }
  if (rec.status === 'approved') {
    throw new AppError('已 approved 不能再次提交', 400, 73807);
  }
  if (rec.status !== 'draft') {
    throw new AppError('仅 draft 可提交审批', 400, 73802);
  }

  const threshold = await getCeoThreshold();
  const delta = toNum(rec.delta);
  const requireCeo = delta > threshold;

  const instance = await approvalService.submitApproval({
    flowKey: FLOW_KEY,
    businessType: 'salary_adjustment',
    businessId: rec.id,
    title: `调薪审批 ${rec.employeeId}`,
    initiatorId: actorId,
    data: {
      employeeId: rec.employeeId,
      adjustmentType: rec.adjustmentType,
      delta,
      requireCeo,
      comment: input?.comment,
    },
  });

  const updated = await prisma.salaryAdjustment.update({
    where: { id },
    data: { status: 'pending', approvalInstanceId: instance.id },
  });

  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_ADJUSTMENT_SUBMIT',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '提交调薪审批',
    newValue: {
      adjustmentId: id, requireCeo, approvalInstanceId: instance.id,
    },
  });
  return updated;
}

/**
 * 审批调薪（status='pending' → 'approved' / 'rejected'，通过 M0.5-1 approval）
 * @param actorId 操作人 ID
 * @param id adjustment ID
 * @param input { action: 'approve' | 'reject', comment?: string }
 * @returns 更新后的 SalaryAdjustment
 * @throws AppError(404, 73801) adjustment 不存在
 * @throws AppError(400, 73802) 状态机非法（不是 pending）
 * 校验链：
 *  1. 查询 adjustment（含 approvalInstanceId）→ 不存在抛 73801
 *  2. 状态检查：status === 'pending' → 否则抛 73802
 *  3. 调 approvalService.approve / reject
 *  4. 根据返回 status：approved → 更新 approved；rejected → 更新 rejected；pending → 保持 pending
 *  5. 写 audit（SALARY_ADJUSTMENT_APPROVE）
 * 注：C8 不实现审批流节点逻辑（依赖 M0.5-1）；无 getStatus 导出，用 approve/reject 返回值
 */
export async function approveAdjustment(
  actorId: string,
  id: string,
  input: ApproveAdjustmentInput,
): Promise<SalaryAdjustment> {
  const rec = await prisma.salaryAdjustment.findUnique({ where: { id } });
  if (!rec) {
    throw new AppError('调薪申请不存在', 404, 73801);
  }
  if (rec.status !== 'pending') {
    throw new AppError('仅 pending 可审批', 400, 73802);
  }
  if (!rec.approvalInstanceId) {
    throw new AppError('仅 pending 可审批', 400, 73802);
  }

  const actionInput = {
    instanceId: rec.approvalInstanceId,
    approverId: actorId,
    comment: input.comment,
  };
  const result = input.action === 'reject'
    ? await approvalService.reject(actionInput)
    : await approvalService.approve(actionInput);

  let nextStatus: SalaryAdjustment['status'] = rec.status;
  if (result.status === 'approved') nextStatus = 'approved';
  if (result.status === 'rejected') nextStatus = 'rejected';

  const updated = nextStatus === rec.status
    ? rec
    : await prisma.salaryAdjustment.update({
      where: { id },
      data: { status: nextStatus },
    });

  auditService.auditLog({
    userId: actorId,
    actorType: 'USER',
    action: 'SALARY_ADJUSTMENT_APPROVE',
    resourceType: RESOURCE_TYPE,
    resourceId: id,
    description: '审批调薪',
    newValue: {
      adjustmentId: id,
      action: input.action,
      comment: input.comment,
      approvalStatus: result.status,
    },
  });
  return updated;
}
