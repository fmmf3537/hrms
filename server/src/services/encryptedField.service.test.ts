// M0.5-3: encryptedField service 单元测试 | HRMS
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define,
   @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call,
   @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any,
   @typescript-eslint/require-await */

import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

import * as encryptedFieldService from './encryptedField.service';

// ============== Mock ==============

const mocks = vi.hoisted(() => {
  const fieldFindUnique = vi.fn();
  const fieldFindMany = vi.fn();
  const fieldCreate = vi.fn();
  const fieldUpdate = vi.fn();
  const auditCreate = vi.fn();
  return {
    fieldFindUnique, fieldFindMany, fieldCreate, fieldUpdate, auditCreate,
  };
});

vi.mock('../lib/prisma', () => ({
  default: {
    encryptedField: {
      findUnique: mocks.fieldFindUnique,
      findMany: mocks.fieldFindMany,
      create: mocks.fieldCreate,
      update: mocks.fieldUpdate,
    },
    encryptedFieldAudit: {
      create: mocks.auditCreate,
    },
  },
}));

const makeField = (overrides: Record<string, unknown> = {}) => ({
  id: 'field-1',
  tableName: 'employees',
  columnName: 'id_card',
  encryptionAlgo: 'aes-256-gcm',
  keyVersion: 1,
  accessRoles: ['admin', 'hr', 'self'],
  enabled: true,
  description: null,
  createdBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auditCreate.mockResolvedValue({});
});

// ============== 列表 ==============

describe('listFields - 列出加密字段', () => {
  it('基本列表（不过滤）', async () => {
    mocks.fieldFindMany.mockResolvedValueOnce([
      makeField(),
      makeField({ id: 'field-2', columnName: 'bank_card', accessRoles: ['admin'] }),
    ]);

    const result = await encryptedFieldService.listFields();

    expect(result).toHaveLength(2);
    expect(mocks.fieldFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
  });

  it('enabledOnly=true → where 含 enabled: true', async () => {
    mocks.fieldFindMany.mockResolvedValueOnce([]);

    await encryptedFieldService.listFields({ enabledOnly: true });

    expect(mocks.fieldFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ enabled: true }) }),
    );
  });
});

// ============== 创建 ==============

describe('createField - 创建加密字段配置', () => {
  it('合法配置 → 创建成功', async () => {
    mocks.fieldFindUnique.mockResolvedValueOnce(null); // 不存在
    mocks.fieldCreate.mockImplementationOnce(({ data }: any) => Promise.resolve({ id: 'new-field', ...data }));

    const result = await encryptedFieldService.createField({
      tableName: 'payslips',
      columnName: 'bonus',
      accessRoles: ['admin', 'hr'],
    });

    expect(result.id).toBe('new-field');
  });

  it('accessRoles 为空 → 抛 40111 (400)', async () => {
    await expect(
      encryptedFieldService.createField({
        tableName: 'employees',
        columnName: 'id_card',
        accessRoles: [],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 40111 });
  });

  it('(tableName, columnName) 已存在 → 抛 40111 (409)', async () => {
    mocks.fieldFindUnique.mockResolvedValueOnce(makeField());

    await expect(
      encryptedFieldService.createField({
        tableName: 'employees',
        columnName: 'id_card',
        accessRoles: ['admin'],
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 40111 });
  });
});

// ============== 解密（按角色授权）==============

describe('decryptValue - 解密单条', () => {
  it('admin 角色 + 合法密文 → 解密成功 + 写审计', async () => {
    // 先生成真实密文
    const { encrypt } = await import('./crypto.service');
    const ciphertext = encrypt('110101199003078812', 1);
    mocks.fieldFindUnique.mockResolvedValueOnce(makeField());

    const result = await encryptedFieldService.decryptValue({
      fieldId: 'field-1',
      ciphertext,
      userId: 'user-1',
      userRoles: ['admin'],
    });

    expect(result.plaintext).toBe('110101199003078812');
    expect(result.field.keyVersion).toBe(1);
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fieldId: 'field-1',
        userId: 'user-1',
        operation: 'decrypt',
      }),
    });
  });

  it('无 accessRoles 角色 + 字段 enabled=false → 抛 40110', async () => {
    mocks.fieldFindUnique.mockResolvedValueOnce(makeField({ enabled: false }));

    await expect(
      encryptedFieldService.decryptValue({
        fieldId: 'field-1',
        ciphertext: 'aGVsbG8=.d29ybGQ=.YWFhY2M=',
        userId: 'user-1',
        userRoles: ['employee'],
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 40110 });
  });

  it('角色不在 accessRoles 列表 → 抛 40110 (403)', async () => {
    // accessRoles=['admin','hr']，用户只有['employee']
    mocks.fieldFindUnique.mockResolvedValueOnce(
      makeField({ accessRoles: ['admin', 'hr'] }),
    );

    await expect(
      encryptedFieldService.decryptValue({
        fieldId: 'field-1',
        ciphertext: 'aGVsbG8=.d29ybGQ=.YWFhY2M=',
        userId: 'user-1',
        userRoles: ['employee'],
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 40110 });
  });

  it("'self' 标记 + recordId === userId → 允许解密", async () => {
    // accessRoles=['self']，用户是 employee，访问自己的记录
    const { encrypt } = await import('./crypto.service');
    const ciphertext = encrypt('13800138000', 1);
    mocks.fieldFindUnique.mockResolvedValueOnce(
      makeField({ accessRoles: ['self'] }),
    );

    const result = await encryptedFieldService.decryptValue({
      fieldId: 'field-1',
      ciphertext,
      userId: 'user-1',
      userRoles: ['employee'],
      recordId: 'user-1', // 自己的记录
    });

    expect(result.plaintext).toBe('13800138000');
  });

  it("'self' 标记 + recordId !== userId → 拒绝（40110）", async () => {
    mocks.fieldFindUnique.mockResolvedValueOnce(
      makeField({ accessRoles: ['self'] }),
    );

    await expect(
      encryptedFieldService.decryptValue({
        fieldId: 'field-1',
        ciphertext: 'aGVsbG8=.d29ybGQ=.YWFhY2M=',
        userId: 'user-1',
        userRoles: ['employee'],
        recordId: 'OTHER-USER', // 不是自己
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 40110 });
  });

  it('字段不存在 → 抛 40111 (404)', async () => {
    mocks.fieldFindUnique.mockResolvedValueOnce(null);

    await expect(
      encryptedFieldService.decryptValue({
        fieldId: 'nonexistent',
        ciphertext: 'aGVsbG8=.d29ybGQ=.YWFhY2M=',
        userId: 'user-1',
        userRoles: ['admin'],
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 40111 });
  });
});

// ============== 批量解密 ==============

describe('decryptBatch - 批量解密', () => {
  it('3 条记录 + admin 角色 → 全部解密成功', async () => {
    const { encrypt } = await import('./crypto.service');
    const c1 = encrypt('110101199003078812', 1);
    const c2 = encrypt('13800138000', 1);
    const c3 = encrypt('6228 1234 5678 9012', 1);
    mocks.fieldFindUnique.mockResolvedValueOnce(makeField());

    const result = await encryptedFieldService.decryptBatch({
      fieldId: 'field-1',
      records: [
        { recordId: 'u1', ciphertext: c1 },
        { recordId: 'u2', ciphertext: c2 },
        { recordId: 'u3', ciphertext: c3 },
      ],
      userId: 'admin-1',
      userRoles: ['admin'],
    });

    expect(result.results).toHaveLength(3);
    expect(result.results.every((r) => r.success)).toBe(true);
    expect(mocks.auditCreate).toHaveBeenCalledTimes(3); // 每条 1 条审计
  });

  it('1 条记录密文损坏 → 该条失败，其他成功', async () => {
    const { encrypt } = await import('./crypto.service');
    const good = encrypt('good-data', 1);
    const bad = 'corrupted.ciphertext.tagXX';
    mocks.fieldFindUnique.mockResolvedValueOnce(makeField());

    const result = await encryptedFieldService.decryptBatch({
      fieldId: 'field-1',
      records: [
        { recordId: 'u1', ciphertext: good },
        { recordId: 'u2', ciphertext: bad },
      ],
      userId: 'admin-1',
      userRoles: ['admin'],
    });

    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toBeDefined();
  });
});

// ============== 密钥轮转 ==============

describe('rotateKey - 密钥轮转', () => {
  it('v1 → v2 轮转成功', async () => {
    mocks.fieldFindUnique.mockResolvedValueOnce(makeField({ keyVersion: 1 }));
    mocks.fieldUpdate.mockResolvedValueOnce({});

    const result = await encryptedFieldService.rotateKey({
      fieldId: 'field-1',
      newKeyVersion: 2,
    });

    expect(result.oldVersion).toBe(1);
    expect(result.newVersion).toBe(2);
    expect(mocks.fieldUpdate).toHaveBeenCalledWith({
      where: { id: 'field-1' },
      data: { keyVersion: 2 },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ operation: 'rotate_key' }),
    });
  });

  it('newKeyVersion <= 当前版本 → 抛 40103 (400)', async () => {
    mocks.fieldFindUnique.mockResolvedValueOnce(makeField({ keyVersion: 2 }));

    await expect(
      encryptedFieldService.rotateKey({ fieldId: 'field-1', newKeyVersion: 1 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 40103 });
  });
});

// ============== 删除 ==============

describe('deleteField - 软删除', () => {
  it('删除（软删除 + enabled=false）', async () => {
    mocks.fieldUpdate.mockResolvedValueOnce({});

    await encryptedFieldService.deleteField('field-1');

    expect(mocks.fieldUpdate).toHaveBeenCalledWith({
      where: { id: 'field-1' },
      data: expect.objectContaining({
        deletedAt: expect.any(Date),
        enabled: false,
      }),
    });
  });
});
