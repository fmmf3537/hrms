// M0.5-3: 加密字段 service | HRMS
// 职责：CRUD + 解密授权（按角色 + 二次审计）

import type { Prisma } from '@prisma/client';

import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

import * as cryptoService from './crypto.service';

// ============== 错误码（与 docs/error-codes.md §4xxxx 对齐）==============

// 40100 ENCRYPTION_KEY_MISSING
// 40101 ENCRYPTION_FAILED
// 40102 DECRYPTION_FAILED
// 40103 ENCRYPTION_KEY_ROTATION_FAILED
// 40110 DECRYPT_PERMISSION_DENIED
// 40111 ENCRYPTED_FIELD_SCHEMA_INVALID

// ============== 工具：按角色校验 ==============

interface DecryptContext {
  userId: string;
  userRoles: string[]; // 用户的所有角色 code 列表
  isSelf: boolean; // 是否访问自己的记录（accessRoles 含 'self' 且 recordId === userId）
}

/**
 * 校验 user 是否有权解密该字段
 * accessRoles 数组中含 'self' 表示员工本人可查，含 'admin' / 'hr' 等表示对应角色可查
 */
function canDecrypt(
  field: { accessRoles: Prisma.JsonValue; enabled: boolean },
  ctx: DecryptContext,
): boolean {
  if (!field.enabled) return false;
  const roles = field.accessRoles as string[];
  // self 检查
  if (ctx.isSelf && roles.includes('self')) return true;
  // 角色检查
  return ctx.userRoles.some((role) => roles.includes(role));
}

// ============== 工具：审计 ==============

async function writeAudit(
  fieldId: string,
  userId: string,
  operation: 'encrypt' | 'decrypt' | 'rotate_key',
  recordId: string | null,
  ipAddress: string | null,
): Promise<void> {
  await prisma.encryptedFieldAudit.create({
    data: {
      fieldId,
      userId,
      operation,
      recordId,
      ipAddress,
    },
  });
}

// ============== 配置管理 ==============

export interface CreateFieldInput {
  tableName: string;
  columnName: string;
  accessRoles: string[];
  encryptionAlgo?: string;
  description?: string;
}

export async function createField(input: CreateFieldInput): Promise<{ id: string }> {
  if (input.accessRoles.length === 0) {
    throw new AppError('accessRoles 不能为空', 400, 40111);
  }

  // 检查 (tableName, columnName) 唯一
  const existing = await prisma.encryptedField.findUnique({
    where: { tableName_columnName: { tableName: input.tableName, columnName: input.columnName } },
  });
  if (existing) {
    throw new AppError(
      `字段已注册: ${input.tableName}.${input.columnName}`,
      409,
      40111,
    );
  }

  const created = await prisma.encryptedField.create({
    data: {
      tableName: input.tableName,
      columnName: input.columnName,
      accessRoles: input.accessRoles,
      encryptionAlgo: input.encryptionAlgo ?? 'aes-256-gcm',
      enabled: true,
      description: input.description ?? null,
    },
  });
  return { id: created.id };
}

export async function listFields(opts: { enabledOnly?: boolean } = {}): Promise<Array<{
  id: string;
  tableName: string;
  columnName: string;
  accessRoles: string[];
  enabled: boolean;
  keyVersion: number;
}>> {
  const fields = await prisma.encryptedField.findMany({
    where: {
      deletedAt: null,
      ...(opts.enabledOnly ? { enabled: true } : {}),
    },
    orderBy: [{ tableName: 'asc' }, { columnName: 'asc' }],
  });
  return fields.map((f) => ({
    id: f.id,
    tableName: f.tableName,
    columnName: f.columnName,
    accessRoles: f.accessRoles as string[],
    enabled: f.enabled,
    keyVersion: f.keyVersion,
  }));
}

export async function deleteField(id: string): Promise<void> {
  // 软删除 + 禁用
  await prisma.encryptedField.update({
    where: { id },
    data: { deletedAt: new Date(), enabled: false },
  });
}

// ============== 解密核心 ==============

export interface DecryptInput {
  fieldId: string;
  ciphertext: string;
  keyVersion?: number; // 默认用字段当前 keyVersion
  recordId?: string; // 用于 'self' 授权检查
  userId: string;
  userRoles: string[];
  ipAddress?: string | null;
}

export interface DecryptResult {
  plaintext: string;
  field: {
    id: string;
    tableName: string;
    columnName: string;
    keyVersion: number;
  };
}

/**
 * 解密一条密文
 * 流程：
 *   1. 查字段配置
 *   2. 校验权限（按 accessRoles + 'self' 标记）
 *   3. 调 cryptoService.decrypt
 *   4. 写 encrypted_field_audit (operation='decrypt')
 */
export async function decryptValue(input: DecryptInput): Promise<DecryptResult> {
  // 1. 查字段
  const field = await prisma.encryptedField.findUnique({
    where: { id: input.fieldId },
  });
  if (!field || field.deletedAt) {
    throw new AppError('加密字段配置不存在', 404, 40111);
  }

  // 2. 校验权限
  const ctx: DecryptContext = {
    userId: input.userId,
    userRoles: input.userRoles,
    isSelf: Boolean(input.recordId && input.recordId === input.userId),
  };
  if (!canDecrypt(field, ctx)) {
    throw new AppError('当前角色无权解密该字段', 403, 40110);
  }

  // 3. 解密
  const keyVersion = input.keyVersion ?? field.keyVersion;
  const plaintext = cryptoService.decrypt(input.ciphertext, keyVersion);

  // 4. 写审计
  await writeAudit(field.id, input.userId, 'decrypt', input.recordId ?? null, input.ipAddress ?? null);

  return {
    plaintext,
    field: {
      id: field.id,
      tableName: field.tableName,
      columnName: field.columnName,
      keyVersion,
    },
  };
}

export interface BatchDecryptInput {
  fieldId: string;
  records: Array<{ recordId?: string; ciphertext: string }>;
  userId: string;
  userRoles: string[];
  ipAddress?: string | null;
}

/**
 * 批量解密
 * 性能优化：权限只检查一次（按字段级）
 */
export async function decryptBatch(input: BatchDecryptInput): Promise<{
  field: { id: string; tableName: string; columnName: string };
  results: Array<{
    recordId?: string;
    success: boolean;
    plaintext?: string;
    error?: string;
  }>;
}> {
  // 查字段
  const field = await prisma.encryptedField.findUnique({
    where: { id: input.fieldId },
  });
  if (!field || field.deletedAt) {
    throw new AppError('加密字段配置不存在', 404, 40111);
  }

  // 校验权限（一次）
  const hasAnyRole = (input.userRoles.some((r) => (field.accessRoles as string[]).includes(r))
    || (field.accessRoles as string[]).includes('self'));
  if (!field.enabled || !hasAnyRole) {
    throw new AppError('当前角色无权解密该字段', 403, 40110);
  }

  // 逐条解密
  const results = input.records.map((r) => {
    try {
      const isSelf = Boolean(r.recordId && r.recordId === input.userId);
      // self 检查
      if (!isSelf && !(field.accessRoles as string[]).some((role) => input.userRoles.includes(role))) {
        return { recordId: r.recordId, success: false, error: '无权解密该记录' };
      }
      const plaintext = cryptoService.decrypt(r.ciphertext, field.keyVersion);
      // 写审计
      writeAudit(field.id, input.userId, 'decrypt', r.recordId ?? null, input.ipAddress ?? null).catch(() => {});
      return { recordId: r.recordId, success: true, plaintext };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { recordId: r.recordId, success: false, error: msg };
    }
  });

  return {
    field: {
      id: field.id,
      tableName: field.tableName,
      columnName: field.columnName,
    },
    results,
  };
}

// ============== 密钥轮转 ==============

export interface RotateKeyInput {
  fieldId: string;
  newKeyVersion: number; // 必须 > 当前 keyVersion
}

/**
 * 触发密钥轮转
 * 注意：实际轮转密文需要业务模块配合（M3+ 批量任务）
 * 本接口只更新字段配置的 keyVersion 标记
 */
export async function rotateKey(input: RotateKeyInput): Promise<{
  fieldId: string;
  oldVersion: number;
  newVersion: number;
}> {
  const field = await prisma.encryptedField.findUnique({
    where: { id: input.fieldId },
  });
  if (!field || field.deletedAt) {
    throw new AppError('加密字段配置不存在', 404, 40111);
  }
  if (input.newKeyVersion <= field.keyVersion) {
    throw new AppError(
      `newKeyVersion 必须 > 当前版本 ${field.keyVersion}`,
      400,
      40103,
    );
  }

  await prisma.encryptedField.update({
    where: { id: input.fieldId },
    data: { keyVersion: input.newKeyVersion },
  });
  await writeAudit(field.id, '00000000-0000-0000-0000-000000000000', 'rotate_key', null, null);

  return {
    fieldId: field.id,
    oldVersion: field.keyVersion,
    newVersion: input.newKeyVersion,
  };
}
