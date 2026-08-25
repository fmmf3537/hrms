// M0-08: 审计日志服务 | HRMS | 2026-08-24
// 通用审计基础设施：业务代码一行 auditLog({...}) 即可记录写操作。
// 关键可靠性要求：fire-and-forget，写入失败绝不抛出、绝不阻塞主流程。

import prisma from '../lib/prisma';

/** 审计动作（约定俗成，不强制枚举） */
export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  EXPORT: 'EXPORT',
  // AI 底座（M0.5-5）
  AI_OCR: 'AI_OCR',
  AI_QA: 'AI_QA',
  AI_SUMMARIZE: 'AI_SUMMARIZE',
  AI_SCORE: 'AI_SCORE',
} as const;

/** 审计资源类型（resource_type 字段，统一收敛避免散落字符串） */
export const AUDIT_RESOURCE_TYPES = {
  AUTH: 'Auth',
  EMPLOYEE: 'Employee',
  DEPARTMENT: 'Department',
  COMPANY: 'Company',
  ATTENDANCE: 'Attendance',
  SALARY: 'Salary',
  PERFORMANCE: 'Performance',
  CONTRACT: 'Contract',
  AI: 'Ai',
} as const;

export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[keyof typeof AUDIT_RESOURCE_TYPES];

export const AUDIT_STATUS = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
} as const;

export interface AuditLogParams {
  userId?: string | null;
  /** V1.2 新增：操作主体类型，默认 USER；AI 调用填 AGENT；定时任务填 SYSTEM；第三方对接填 INTEGRATION */
  actorType?: 'USER' | 'AGENT' | 'SYSTEM' | 'INTEGRATION';
  action: string;
  resourceType: string;
  resourceId?: string | null;
  description?: string | null;
  /** 变更前快照；敏感字段须在调用侧脱敏/省略后再传入 */
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  status?: string;
}

export interface ListAuditLogsQuery {
  page: number;
  pageSize: number;
  userId?: string;
  action?: string;
  resourceType?: string;
  from?: Date;
  to?: Date;
}

/**
 * 写入一条审计日志（异步 fire-and-forget）。
 * 内部 try/catch：任何失败只记录到 console.error，绝不 throw / reject 给调用方。
 */
export async function auditLog(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        actorType: params.actorType ?? 'USER',
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId ?? null,
        description: params.description ?? null,
        oldValue: params.oldValue === undefined ? undefined : (params.oldValue as object),
        newValue: params.newValue === undefined ? undefined : (params.newValue as object),
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        status: params.status ?? AUDIT_STATUS.SUCCESS,
      },
    });
  } catch (error) {
    // 审计写入失败只告警，不影响主业务流程
    console.error('[auditLog] 审计日志写入失败:', error);
  }
}

/**
 * 分页查询审计日志（供 GET /api/audit-logs 使用）
 */
export async function listAuditLogs(query: ListAuditLogsQuery) {
  const {
    page, pageSize, userId, action, resourceType, from, to,
  } = query;

  const where = {
    ...(userId ? { userId } : {}),
    ...(action ? { action } : {}),
    ...(resourceType ? { resourceType } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data, total, page, pageSize,
  };
}
