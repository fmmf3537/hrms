// M5-10: BullMQ 调度接线（M4 遗留 8 个待接入函数收口）| HRMS
// 将 C4/C6/C7/C8 暴露的定时函数接入 5 个 repeatable cron 任务：
//   1. payroll.monthly-generate     每月 25 日 05:00 生成下月算薪批次（C4 createPayrollRun）
//   2. payroll.ai-summary-daily     每日 02:10 对已定稿批次补 AI 算薪摘要（C4 requestAiSummary）
//   3. commission.quarterly-settle  1/4/7/10 月 1 日 03:30 结算上一季度（C6 createSettlement）
//   4. cost-alert.daily-scan        每日 02:00 加班费占比 + 离职率扫描（C7 scan*Alerts）
//   5. salary-adjustment.daily-run  每日 02:05 到期调薪批量执行（C8 executePendingAdjustments）
//
// Actor 语义：
//   - C7/C8 原生支持 actorId='SYSTEM'（audit actorType=SYSTEM，userId=null）→ 直接传 'SYSTEM'
//   - C4/C6 createdBy 为必填 uuid FK（无 SYSTEM 分支）→ 传 system 服务账号 userId（users.username='system'，
//     seed 创建；缺失时 fallback admin）
// 开关：每个任务运行前查 configs.salary.scheduler.*（缺失视为启用）
// 失败：Worker attempts=2 + exponential backoff（沿用 M0.5-2 通知队列模式）

import type { Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';

import prisma from '../lib/prisma';
import { connectRedis, createBullMqRedis } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';
import * as attritionService from '../services/attrition.service';
import * as commissionSettlementService from '../services/commission_settlement.service';
import * as configService from '../services/config.service';
import * as overtimeRatioService from '../services/overtime_ratio.service';
import * as payrollAiSummaryService from '../services/payroll_ai_summary.service';
import * as payrollRunService from '../services/payroll_run.service';
import * as salaryAdjustmentExecuteService from '../services/salary_adjustment_execute.service';

// ============== 常量 ==============

export const QUEUE_NAMES = {
  PAYROLL_MONTHLY: 'payroll.monthly-generate',
  PAYROLL_AI_DAILY: 'payroll.ai-summary-daily',
  COMMISSION_QUARTERLY: 'commission.quarterly-settle',
  COST_ALERT_DAILY: 'cost-alert.daily-scan',
  SALARY_ADJUST_DAILY: 'salary-adjustment.daily-run',
} as const;

export const CRON_PATTERNS = {
  /** 每月 25 日 05:00（算薪窗口，V1.2 约定每月 25 日） */
  PAYROLL_MONTHLY: '0 5 25 * *',
  /** 每日 02:10（避开 02:00 整点任务） */
  PAYROLL_AI_DAILY: '10 2 * * *',
  /** 季度首月 1 日 03:30（结算上一季度） */
  COMMISSION_QUARTERLY: '30 3 1 1,4,7,10 *',
  /** 每日 02:00（V1.2 §四.8 明确） */
  COST_ALERT_DAILY: '0 2 * * *',
  /** 每日 02:05（02:00 扫描类任务之后） */
  SALARY_ADJUST_DAILY: '5 2 * * *',
} as const;

export const JOB_IDS = {
  PAYROLL_MONTHLY: 'payroll-monthly-generate',
  PAYROLL_AI_DAILY: 'payroll-ai-daily-summarize',
  COMMISSION_QUARTERLY: 'commission-quarterly-settle',
  COST_ALERT_DAILY: 'cost-alert-daily-scan',
  SALARY_ADJUST_DAILY: 'salary-adjustment-daily-execute',
} as const;

const CONFIG_PREFIX = 'scheduler';

type BusinessJobData = { period?: string; asOfDate?: string };

// ============== 纯日期工具（可单测） ==============

/** 取指定日期偏移 n 个月的 YYYY-MM（n 可负；UTC 安全） */
export function shiftMonth(date: Date, delta: number): string {
  const m0 = date.getUTCMonth() + delta;
  const year = date.getUTCFullYear() + Math.floor(m0 / 12);
  const month = ((m0 % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** 指定日期所在季度的上一季度（quarter 1-4） */
export function prevQuarter(date: Date): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const prevM0 = date.getUTCMonth() - 3;
  const year = date.getUTCFullYear() + Math.floor(prevM0 / 12);
  const m0 = ((prevM0 % 12) + 12) % 12;
  const quarter = Math.floor(m0 / 3) + 1;
  return { year, quarter: quarter as 1 | 2 | 3 | 4 };
}

/** 指定日期 → YYYY-MM-DD（UTC） */
export function ymdOf(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ============== 内部工具 ==============

/** 调度开关：configs 缺失视为启用 */
async function schedulerEnabled(section: string): Promise<boolean> {
  try {
    const v = await configService.getValue('salary', `${CONFIG_PREFIX}.${section}`);
    return v !== false && v !== 'false' && v !== 0;
  } catch {
    return true;
  }
}

/**
 * 解析调度操作人 userId：优先 system 服务账号（C4/C6 createdBy FK 需要），缺失 fallback admin
 */
export async function resolveSystemUserId(): Promise<string> {
  const system = await prisma.user.findUnique({
    where: { username: 'system' },
    select: { id: true },
  });
  if (system) return system.id;
  const admin = await prisma.user.findUnique({
    where: { username: 'admin' },
    select: { id: true },
  });
  if (admin) return admin.id;
  throw new AppError('无 system/admin 用户，调度任务无法指定操作人', 500, 99999);
}

// ============== 任务处理函数 ==============

/**
 * 1. 每月生成下月算薪批次（幂等：同 period 已存在则跳过）
 * @param period 可选覆盖（手动验证用）；缺省=下月
 */
export async function processMonthlyGenerate(period?: string): Promise<{ runId?: string; skipped: boolean }> {
  if (!(await schedulerEnabled('payroll.auto_generate_enabled'))) {
    return { skipped: true };
  }
  const sysId = await resolveSystemUserId();
  const target = period ?? shiftMonth(new Date(), 1);
  try {
    const { run } = await payrollRunService.createPayrollRun(sysId, { period: target });
    return { runId: run.id, skipped: false };
  } catch (err) {
    if (err instanceof AppError && err.code === 73402) {
      return { skipped: true }; // 该月已有批次（幂等）
    }
    throw err;
  }
}

/**
 * 2. 每日：对最近 45 天内已定稿（approved/locked）且尚无 AI 摘要的批次补摘要（单条失败不中断）
 */
export async function processAiSummaryDaily(): Promise<{ summarized: number; skipped: number; errors: string[] }> {
  const result = { summarized: 0, skipped: 0, errors: [] as string[] };
  if (!(await schedulerEnabled('payroll.ai_summary_auto_enabled'))) {
    return result;
  }
  const sysId = await resolveSystemUserId();
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const runs = await prisma.payrollRun.findMany({
    where: { status: { in: ['approved', 'locked'] }, createdAt: { gte: since } },
    select: { id: true },
  });
  await Promise.all(runs.map(async (run) => {
    const hasSummary = await prisma.aiSummary.findFirst({
      where: { referenceId: run.id },
      select: { id: true },
    });
    if (hasSummary) {
      result.skipped += 1;
      return;
    }
    try {
      await payrollAiSummaryService.requestAiSummary(sysId, run.id);
      result.summarized += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${run.id}: ${msg}`);
    }
  }));
  return result;
}

/**
 * 3. 季度末：对上一季度创建销售提成结算单（幂等：已存在或无已发提成则跳过）
 */
export async function processQuarterlySettle(year?: number, quarter?: 1 | 2 | 3 | 4): Promise<{
  settlementId?: string;
  skipped: boolean;
}> {
  if (!(await schedulerEnabled('commission.auto_settle_enabled'))) {
    return { skipped: true };
  }
  const sysId = await resolveSystemUserId();
  const target = year !== undefined && quarter !== undefined
    ? { year, quarter }
    : prevQuarter(new Date());
  try {
    const created = await commissionSettlementService.createSettlement(sysId, {
      year: target.year,
      quarter: target.quarter,
      initialStatus: 'pending_confirm',
    });
    return { settlementId: created.id, skipped: false };
  } catch (err) {
    if (err instanceof AppError && (err.code === 73607 || err.code === 73606)) {
      return { skipped: true }; // 已存在 / 无已发提成
    }
    throw err;
  }
}

/**
 * 4. 每日 02:00：成本预警扫描（加班费占比 + 离职率）。
 * 扫描"上一个完整月"；无数据（当月尚未结算）时回退扫当月，仍无则记录告警不重试轰炸。
 */
export async function processCostAlertDaily(): Promise<{ alerts: number; noDataPeriods: string[] }> {
  const result = { alerts: 0, noDataPeriods: [] as string[] };
  if (!(await schedulerEnabled('cost_alert.auto_scan_enabled'))) {
    return result;
  }
  const candidates = [shiftMonth(new Date(), -1), shiftMonth(new Date(), 0)];
  await Promise.all(candidates.map(async (period) => {
    try {
      const ot = await overtimeRatioService.scanOvertimeRatioAlerts('SYSTEM', period);
      result.alerts += ot.alertCount;
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      result.noDataPeriods.push(`overtime:${period}`);
    }
    try {
      const at = await attritionService.scanAttritionAlerts('SYSTEM', period);
      result.alerts += at.alertCount;
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      result.noDataPeriods.push(`attrition:${period}`);
    }
  }));
  return result;
}

/**
 * 5. 每日 02:05：批量执行到期（effective_date <= today）的 approved 调薪
 */
export async function processSalaryAdjustmentDaily(asOfDate?: string): Promise<{
  asOfDate: string;
  skipped: boolean;
}> {
  if (!(await schedulerEnabled('adjustment.auto_execute_enabled'))) {
    return { asOfDate: asOfDate ?? ymdOf(new Date()), skipped: true };
  }
  const asOf = asOfDate ?? ymdOf(new Date());
  await salaryAdjustmentExecuteService.executePendingAdjustments('SYSTEM', asOf);
  return { asOfDate: asOf, skipped: false };
}

// ============== 队列 / 调度注册 / Worker ==============

type BusinessHandler = (job: Job<BusinessJobData>) => Promise<unknown>;

interface JobSpec {
  queueName: string;
  jobId: string;
  cron: string;
  handler: BusinessHandler;
}

const JOB_SPECS: JobSpec[] = [
  {
    queueName: QUEUE_NAMES.PAYROLL_MONTHLY,
    jobId: JOB_IDS.PAYROLL_MONTHLY,
    cron: CRON_PATTERNS.PAYROLL_MONTHLY,
    handler: (job) => processMonthlyGenerate(job.data.period),
  },
  {
    queueName: QUEUE_NAMES.PAYROLL_AI_DAILY,
    jobId: JOB_IDS.PAYROLL_AI_DAILY,
    cron: CRON_PATTERNS.PAYROLL_AI_DAILY,
    handler: () => processAiSummaryDaily(),
  },
  {
    queueName: QUEUE_NAMES.COMMISSION_QUARTERLY,
    jobId: JOB_IDS.COMMISSION_QUARTERLY,
    cron: CRON_PATTERNS.COMMISSION_QUARTERLY,
    handler: () => processQuarterlySettle(),
  },
  {
    queueName: QUEUE_NAMES.COST_ALERT_DAILY,
    jobId: JOB_IDS.COST_ALERT_DAILY,
    cron: CRON_PATTERNS.COST_ALERT_DAILY,
    handler: () => processCostAlertDaily(),
  },
  {
    queueName: QUEUE_NAMES.SALARY_ADJUST_DAILY,
    jobId: JOB_IDS.SALARY_ADJUST_DAILY,
    cron: CRON_PATTERNS.SALARY_ADJUST_DAILY,
    handler: (job) => processSalaryAdjustmentDaily(job.data.asOfDate),
  },
];

const queueMap = new Map<string, Queue<BusinessJobData>>();
const workerMap = new Map<string, Worker<BusinessJobData>>();

async function getQueue(queueName: string): Promise<Queue<BusinessJobData>> {
  const existing = queueMap.get(queueName);
  if (existing) return existing;
  await connectRedis();
  const queue = new Queue<BusinessJobData>(queueName, {
    connection: createBullMqRedis(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    },
  });
  queueMap.set(queueName, queue);
  return queue;
}

/**
 * 注册 5 个 cron 任务（BullMQ v6 JobScheduler，幂等：jobSchedulerId 稳定，重复调用覆盖同名不重复）
 */
export async function registerBusinessSchedules(): Promise<void> {
  await Promise.all(JOB_SPECS.map(async (spec) => {
    const queue = await getQueue(spec.queueName);
    await queue.upsertJobScheduler(spec.jobId, { pattern: spec.cron }, {
      name: spec.queueName,
      data: {},
    });
  }));
  // eslint-disable-next-line no-console
  console.log(`[business scheduler] registered ${JOB_SPECS.length} cron jobs`);
}

/**
 * 启动全部业务 Worker（每队列 concurrency=1，避免定时任务并行重入）
 */
export async function startBusinessWorkers(): Promise<void> {
  await Promise.all(JOB_SPECS.map(async (spec) => {
    if (workerMap.has(spec.queueName)) return;
    await connectRedis();
    const worker = new Worker<BusinessJobData>(
      spec.queueName,
      spec.handler,
      { connection: createBullMqRedis(), concurrency: 1 },
    );
    worker.on('failed', (job, err) => {
      // eslint-disable-next-line no-console
      console.error(`[${spec.queueName}] job ${job?.id ?? '?'} failed:`, err.message);
    });
    workerMap.set(spec.queueName, worker);
  }));
  // eslint-disable-next-line no-console
  console.log(`[business scheduler] started ${workerMap.size} workers`);
}

/**
 * 停止全部业务 Worker 与 Queue（优雅退出）
 */
export async function stopBusinessWorkers(): Promise<void> {
  await Promise.all([...workerMap.values()].map((w) => w.close()));
  await Promise.all([...queueMap.values()].map((q) => q.close()));
  workerMap.clear();
  queueMap.clear();
}

export default {
  registerBusinessSchedules,
  startBusinessWorkers,
  stopBusinessWorkers,
};
