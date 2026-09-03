// M0-08: 审计日志服务 | HRMS | 2026-08-24
// 通用审计基础设施：业务代码一行 auditLog({...}) 即可记录写操作。
// 关键可靠性要求：fire-and-forget，写入失败绝不抛出、绝不阻塞主流程。
//
// M5-04 审计敏感字段保护（对齐 docs/audit-masking.md）：
//   - 写入：old_value / new_value 中命中敏感规则的字段自动 AES 加密为 { "__enc": 密文 }
//     （应用层唯一脱敏/加密点，业务调用侧无需处理；已 mask（含 *）或已加密的值跳过）
//   - 读取：列表返回前对 { "__enc": ... } 解密并按字段类型打码（绝不回传明文）
//   - reveal：admin/hr/executive 经 POST /audit-logs/:id/reveal 解密指定字段明文 + 二次审计

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as cryptoService from './crypto.service';

/** 加密包装标记 key */
const ENC_TAG = '__enc';

/** 统一归一化 key：去 _ - 空格 + 小写 */
function normKey(k: string): string {
  return k.replace(/[_\-\s]/g, '').toLowerCase();
}

type MaskFn = (plain: string) => string;

/** 敏感字段识别规则：归一化 key 命中 → 打码函数 */
const SENSITIVE_RULES: Array<{ test: (nk: string) => boolean; mask: MaskFn }> = [
  // 身份证
  {
    test: (nk) => nk === 'idcard' || nk.includes('identitycard') || nk.includes('identityno') || nk.includes('sfzh'),
    mask: (v) => (v.length >= 8 ? `${v.slice(0, 6)}********${v.slice(-4)}` : '****'),
  },
  // 手机 / 紧急联系电话 → 全打码
  { test: (nk) => nk.includes('phone') || nk.includes('mobile'), mask: () => '***' },
  // 银行卡
  {
    test: (nk) => nk.includes('bankcard') || nk.includes('cardno') || (nk.includes('bank') && nk.includes('account')),
    mask: (v) => (v.length >= 8 ? `${v.slice(0, 4)}**********${v.slice(-4)}` : '****'),
  },
  // 薪资金额 → 整百区间（防反推精确值）
  {
    test: (nk) => ['salary', 'wage', 'pay', 'bonus', 'allowance', 'amount'].some((s) => nk.includes(s)),
    mask: (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return '****';
      const base = Math.floor(n / 100) * 100;
      return `${base}-${base + 99}`;
    },
  },
  // 密码 / secret / token / 哈希 → 完全抹除
  {
    test: (nk) => ['password', 'secret', 'token', 'hash', 'credential'].some((s) => nk.includes(s)),
    mask: () => '***REDACTED***',
  },
  // 紧急联系人等其余敏感上下文 → 完全打码
  { test: (nk) => nk.includes('emergency'), mask: () => '***' },
];

function isEncBox(v: unknown): v is { __enc: string } {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && ENC_TAG in v;
}

function isMaskedText(v: string): boolean {
  return v.includes('*');
}

function shouldEncrypt(key: string, value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const nk = normKey(key);
  if (!SENSITIVE_RULES.some((r) => r.test(nk))) return false;
  if (typeof value === 'string') {
    if (value === '' || isMaskedText(value)) return false; // 空 / 已脱敏
  }
  return true;
}

function maskFor(key: string, plain: string): string {
  const nk = normKey(key);
  const rule = SENSITIVE_RULES.find((r) => r.test(nk));
  return rule ? rule.mask(plain) : plain;
}

/**
 * 写入侧保护：递归遍历，敏感字段 → { "__enc": 密文 }
 */
export function protectAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => protectAuditValue(v));
  }
  if (typeof value === 'object' && value !== null) {
    if (isEncBox(value) || typeof value === 'string') return value; // 已加密对象原样
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (out, [k, v]) => {
        if (shouldEncrypt(k, v)) {
          out[k] = { [ENC_TAG]: cryptoService.encrypt(String(v), 1) };
        } else {
          out[k] = protectAuditValue(v);
        }
        return out;
      },
      {},
    );
  }
  return value;
}

/**
 * 读取侧打码：{ "__enc": 密文 } → 解密 → 按字段类型打码（列表 API 绝不回传明文）
 * 解密失败（密钥轮转/损坏）→ '***'，避免把密文当明文展示
 */
export function maskAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => maskAuditValue(v));
  }
  if (typeof value === 'object' && value !== null) {
    if (isEncBox(value)) {
      try {
        return maskFor('salary', cryptoService.decrypt(value.__enc, 1));
      } catch {
        return '***';
      }
    }
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (out, [k, v]) => {
        if (typeof v === 'object' && v !== null && !Array.isArray(v) && isEncBox(v)) {
          try {
            out[k] = maskFor(k, cryptoService.decrypt(v.__enc, 1));
          } catch {
            out[k] = '***';
          }
        } else {
          out[k] = maskAuditValue(v);
        }
        return out;
      },
      {},
    );
  }
  return value;
}

/**
 * 沿路径段逐层下降（规则兼容：不用 for/continue，reduce 折叠）
 */
function descendTo(node: unknown, segs: string[]): { hit: boolean; value: unknown } {
  const finalState = segs.reduce<{ ok: boolean; node: unknown }>(
    (acc, rawSeg) => {
      if (!acc.ok) return acc;
      const cur = acc.node;
      if (typeof cur !== 'object' || cur === null || Array.isArray(cur)) {
        return { ok: false, node: undefined };
      }
      const obj = cur as Record<string, unknown>;
      const foundKey = Object.keys(obj).find((k) => normKey(k) === normKey(rawSeg));
      if (foundKey === undefined) return { ok: false, node: undefined };
      return { ok: true, node: obj[foundKey] };
    },
    { ok: true, node },
  );
  return finalState.ok
    ? { hit: true, value: finalState.node }
    : { hit: false, value: undefined };
}

/**
 * reveal：按路径字段还原明文（仅服务端/admin 端调用，路由层已做角色校验）
 * 路径例："before.base_salary" / "after.base_salary" / "newValue.baseSalary"
 *   第一段 before/old → oldValue，after/new → newValue，否则在两者中查找
 * @throws AppError 40110 字段不存在或非加密敏感字段（无可 reveal 明文）
 */
export function revealAuditValue(
  log: { oldValue: unknown; newValue: unknown },
  fieldPath: string,
): unknown {
  const segs = fieldPath.split('.').map((s) => s.trim()).filter(Boolean);
  if (segs.length === 0) throw new AppError('字段路径为空', 400, 40110);

  const first = normKey(segs[0]);
  let body = segs;
  let roots: unknown[];
  if (first === 'old' || first === 'oldvalue' || first === 'before') {
    roots = [log.oldValue];
    body = segs.slice(1);
  } else if (first === 'new' || first === 'newvalue' || first === 'after') {
    roots = [log.newValue];
    body = segs.slice(1);
  } else {
    roots = [log.oldValue, log.newValue];
  }

  const matched = roots.map((r) => descendTo(r, body)).find((r) => r.hit);
  if (!matched) {
    throw new AppError('请求的字段不存在或非加密敏感字段', 400, 40110);
  }
  const node = matched.value;

  if (isEncBox(node)) {
    try {
      return cryptoService.decrypt(node.__enc, 1);
    } catch {
      throw new AppError('字段解密失败，可能已密钥轮转', 400, 40110);
    }
  }
  if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
    // 嵌套对象：递归 reveal 其下所有加密字段
    return Object.entries(node as Record<string, unknown>).reduce<Record<string, unknown>>(
      (out, [k, v]) => {
        if (typeof v === 'object' && v !== null && !Array.isArray(v) && isEncBox(v)) {
          try {
            out[k] = cryptoService.decrypt(v.__enc, 1);
          } catch {
            throw new AppError(`字段 ${k} 解密失败`, 400, 40110);
          }
        } else {
          out[k] = v;
        }
        return out;
      },
      {},
    );
  }
  // 叶子命中但非加密包装：历史明文或非敏感字段不在 reveal 白名单 → 拒绝
  // （对齐 audit-masking §4.2：仅还原加密敏感字段；历史明文按 §7.1 视为不可信，不对外还原）
  throw new AppError('字段不在可还原白名单内（非加密敏感字段）', 400, 40110);
}

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
        // M5-04: 敏感字段自动加密存储（对齐 audit-masking.md 基线脱敏，DB 物理泄露亦安全）
        oldValue: params.oldValue === undefined
          ? undefined
          : (protectAuditValue(params.oldValue) as object),
        newValue: params.newValue === undefined
          ? undefined
          : (protectAuditValue(params.newValue) as object),
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

  // M5-04: 列表返回前对加密字段解密并打码（角色化过滤由路由/controller 承担）
  const masked = data.map((row) => ({
    ...row,
    oldValue: row.oldValue === null ? null : maskAuditValue(row.oldValue),
    newValue: row.newValue === null ? null : maskAuditValue(row.newValue),
  }));

  return {
    data: masked, total, page, pageSize,
  };
}

/** 按 id 取单条审计日志（reveal 用；返回原始存储形态，未打码） */
export async function getAuditLogById(id: string) {
  return prisma.auditLog.findUnique({ where: { id } });
}
