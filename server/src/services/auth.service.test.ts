// M0-08+ 安全修复：auth.service 关键安全行为单测 | HRMS
// 覆盖：login 失败审计、refresh rotation、reuse 检测、me 禁用拦截、logout 幂等
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-use-before-define */

import jwt from 'jsonwebtoken';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

import { env } from '../lib/env';

import * as authService from './auth.service';

// -------- mock 工厂：所有 vi.hoisted 引用必须放在最前 --------
type RedisChain = {
  set: ReturnType<typeof vi.fn>;
  sadd: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  srem: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => {
  const userFindFirst = vi.fn();
  const userUpdate = vi.fn();
  const auditLog = vi.fn();
  const multi = vi.fn();
  const set = vi.fn();
  const sadd = vi.fn();
  const expire = vi.fn();
  const sismember = vi.fn();
  const smembers = vi.fn();
  const srem = vi.fn();
  const del = vi.fn();
  const get = vi.fn();
  const exec = vi.fn();
  const connectRedis = vi.fn().mockResolvedValue(undefined);
  const uuidV4 = vi.fn(() => 'default-uuid');
  return {
    userFindFirst,
    userUpdate,
    auditLog,
    multi,
    set,
    sadd,
    expire,
    sismember,
    smembers,
    srem,
    del,
    get,
    exec,
    connectRedis,
    uuidV4,
  };
});

vi.mock('uuid', () => ({
  v4: mocks.uuidV4,
}));

// bcryptMocks 在文件下方 hoist 定义（vitest 要求 vi.mock 工厂内引用的变量必须 hoist）
// eslint-disable-next-line @typescript-eslint/no-use-before-define
vi.mock('bcryptjs', () => ({
  default: {
    compare: bcryptMocks.compareFn,
    hash: bcryptMocks.hashFn,
  },
}));

vi.mock('../lib/prisma', () => ({
  default: {
    user: {
      findFirst: mocks.userFindFirst,
      update: mocks.userUpdate,
    },
  },
}));

vi.mock('../lib/redis', () => {
  const buildChain = (): RedisChain => {
    const chain = {
      set: mocks.set.mockReturnThis(),
      sadd: mocks.sadd.mockReturnThis(),
      expire: mocks.expire.mockReturnThis(),
      srem: mocks.srem.mockReturnThis(),
      del: mocks.del.mockReturnThis(),
      exec: mocks.exec.mockResolvedValue([]),
    };
    return chain as unknown as RedisChain;
  };
  const chainThenable: RedisChain = buildChain();
  return {
    redis: {
      multi: mocks.multi.mockImplementation(() => chainThenable),
      sismember: mocks.sismember,
      smembers: mocks.smembers,
      srem: mocks.srem,
      del: mocks.del,
      get: mocks.get,
    },
    connectRedis: mocks.connectRedis,
  };
});

vi.mock('./audit.service', () => ({
  AUDIT_ACTIONS: {
    LOGIN: 'LOGIN', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE', EXPORT: 'EXPORT',
  },
  AUDIT_STATUS: { SUCCESS: 'SUCCESS', FAILURE: 'FAILURE' },
  AUDIT_RESOURCE_TYPES: { AUTH: 'Auth' },
  auditLog: mocks.auditLog.mockResolvedValue(undefined),
}));

// ---- helpers ----

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  username: 'alice',
  passwordHash: '$2a$10$validbcrypt',
  email: null,
  phone: null,
  status: 'active',
  mustChangePassword: false,
  tokenVersion: 0,
  userRoles: [
    {
      role: {
        id: 'r1',
        code: 'employee',
        name: '员工',
        description: null,
        permissions: ['profile:read:self'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
  ],
  employee: null,
  ...overrides,
});

const signRefresh = (userId: string, tokenId: string): string => jwt.sign(
  { userId, tokenId },
  env.JWT_REFRESH_SECRET,
  { algorithm: 'HS256', expiresIn: '7d' },
);

// vitest 的 expect.stringContaining() 在 expect.objectContaining 上下文里推断为 any
// 用 helper 收敛调用点；返回 any 让 lint 闭嘴但保留 matcher 行为
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
const contains = (fragment: string): any => expect.stringContaining(fragment);

beforeEach(() => {
  vi.clearAllMocks();
  // 重新让 multi() 返回一个新 chain
  mocks.multi.mockImplementation(() => {
    const chain = {
      set: mocks.set.mockReturnThis(),
      sadd: mocks.sadd.mockReturnThis(),
      expire: mocks.expire.mockReturnThis(),
      srem: mocks.srem.mockReturnThis(),
      del: mocks.del.mockReturnThis(),
      exec: mocks.exec.mockResolvedValue([]),
    };
    return chain;
  });
  mocks.userUpdate.mockResolvedValue({});
  mocks.exec.mockResolvedValue([]);
  mocks.uuidV4.mockReset();
  mocks.uuidV4.mockImplementation(() => 'default-uuid');
});

// ==================== login - 失败审计 ====================

describe('login - 失败审计埋点', () => {
  it('用户不存在 → 抛 401 + 写 FAILURE 审计 (userId=null)', async () => {
    mocks.userFindFirst.mockResolvedValue(null);

    await expect(authService.login('ghost', 'pwd', { ipAddress: '1.1.1.1' }))
      .rejects.toMatchObject({ statusCode: 401 });

    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        action: 'LOGIN',
        status: 'FAILURE',
        description: contains('用户不存在'),
        ipAddress: '1.1.1.1',
      }),
    );
  });

  it('账号已停用 → 对外抛 401+10110 + 审计记录"账号已停用"（防账号枚举）', async () => {
    mocks.userFindFirst.mockResolvedValue(makeUser({ status: 'disabled' }));

    await expect(authService.login('alice', 'pwd'))
      .rejects.toMatchObject({ statusCode: 401, code: 10110, message: '用户名或密码错误' });

    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        status: 'FAILURE',
        description: contains('账号已停用'),
      }),
    );
  });

  it('密码错误 → 抛 401 + 写 FAILURE 审计（对外文案统一为"用户名或密码错误"，V1.2 code=10110）', async () => {
    mocks.userFindFirst.mockResolvedValue(makeUser());

    await expect(authService.login('alice', 'definitely-wrong-pwd'))
      .rejects.toMatchObject({ statusCode: 401, code: 10110, message: '用户名或密码错误' });

    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        status: 'FAILURE',
        description: contains('密码错误'),
      }),
    );
  });

  // V1.2.1：账号禁用对外文案应与"密码错"完全一致（防账号枚举）
  it('账号已停用 → 对外抛 401+10110 + 审计记录"账号已停用"（防账号枚举）', async () => {
    mocks.userFindFirst.mockResolvedValue(makeUser({ status: 'disabled' }));

    await expect(authService.login('alice', 'pwd'))
      .rejects.toMatchObject({ statusCode: 401, code: 10110, message: '用户名或密码错误' });

    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        status: 'FAILURE',
        description: contains('账号已停用'),
      }),
    );
  });
});

// ==================== login - 渐进式重哈希（V1.2.1）====================

// 在 describe 之前 hoist bcrypt mock 工厂（V1.2.1：测试渐进式重哈希）
const bcryptMocks = vi.hoisted(() => {
  const compareFn = vi.fn();
  const hashFn = vi.fn();
  return { compareFn, hashFn };
});

describe('login - 渐进式重哈希（cost 10 → 12）', () => {
  beforeEach(() => {
    bcryptMocks.compareFn.mockReset();
    bcryptMocks.hashFn.mockReset();
  });

  it('passwordHash cost < 12 → 登录成功后异步用 cost=12 重写', async () => {
    // cost=10 的 bcrypt 哈希（合法格式）
    const cost10Hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
    mocks.userFindFirst.mockResolvedValue(makeUser({ passwordHash: cost10Hash }));
    bcryptMocks.compareFn.mockResolvedValue(true);
    bcryptMocks.hashFn.mockResolvedValue('$2a$12$newHashForTest');

    await authService.login('alice', 'pwd', {});

    // 异步重哈希等 microtask 跑完
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(bcryptMocks.hashFn).toHaveBeenCalledWith('pwd', 12);
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          passwordHash: expect.stringMatching(/^\$2[aby]\$12\$/),
        }),
      }),
    );
  });

  it('passwordHash cost = 12 → 不触发重哈希（userUpdate 仅写 lastLoginAt）', async () => {
    const cost12Hash = '$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
    mocks.userFindFirst.mockResolvedValue(makeUser({ passwordHash: cost12Hash }));
    bcryptMocks.compareFn.mockResolvedValue(true);

    await authService.login('alice', 'pwd', {});

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(bcryptMocks.hashFn).not.toHaveBeenCalled();
    // userUpdate 仍会被调，但只写 lastLoginAt
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastLoginAt: expect.any(Date) },
    });
  });
});

// ==================== refresh - rotation + reuse ====================

describe('refresh - rotation + reuse 检测', () => {
  it('正常 refresh：sismember=1 → 返回新 accessToken+refreshToken，旧 token 从 set 移除', async () => {
    const oldTokenId = 'old-tid';
    const newTokenId = 'new-tid';
    const oldToken = signRefresh('user-1', oldTokenId);
    mocks.sismember.mockResolvedValue(1);
    mocks.userFindFirst.mockResolvedValue(makeUser());
    mocks.uuidV4.mockReturnValue(newTokenId);

    const result = await authService.refresh(oldToken);

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    // 旧 token 应从活跃 set 移除
    expect(mocks.srem).toHaveBeenCalledWith('refresh_active:user-1', oldTokenId);
    // 新 token 应被注册
    expect(mocks.set).toHaveBeenCalledWith(
      `refresh:user-1:${newTokenId}`,
      '1',
      'EX',
      expect.any(Number),
    );
    expect(mocks.sadd).toHaveBeenCalledWith('refresh_active:user-1', newTokenId);
  });

  it('reuse 检测：sismember=0 → 抛 401 + 吊销该用户所有 token + 写审计', async () => {
    const oldTokenId = 'reused-tid';
    const oldToken = signRefresh('user-1', oldTokenId);
    mocks.sismember.mockResolvedValue(0);
    mocks.smembers.mockResolvedValue(['other-tid-1', 'other-tid-2']);

    await expect(authService.refresh(oldToken))
      .rejects.toMatchObject({ statusCode: 401, message: contains('重用') });

    // 吊销该 user 全部 token
    expect(mocks.smembers).toHaveBeenCalledWith('refresh_active:user-1');
    expect(mocks.del).toHaveBeenCalledWith('refresh:user-1:other-tid-1', 'refresh:user-1:other-tid-2');
    expect(mocks.del).toHaveBeenCalledWith('refresh_active:user-1');
    // 写安全事件审计
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        status: 'FAILURE',
        description: contains('重用'),
      }),
    );
  });

  it('refresh token 签名无效 → 抛 401 不写审计', async () => {
    await expect(authService.refresh('not.a.jwt'))
      .rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });
});

// ==================== me - 禁用账号拦截 ====================

describe('me - 禁用账号拦截', () => {
  it('user.status === "disabled" → 抛 403', async () => {
    mocks.userFindFirst.mockResolvedValue(makeUser({ status: 'disabled' }));

    await expect(authService.me('user-1'))
      .rejects.toMatchObject({ statusCode: 403, message: contains('禁用') });
  });

  it('user.status === "active" → 返回 toSafeUser', async () => {
    mocks.userFindFirst.mockResolvedValue(makeUser());

    const result = await authService.me('user-1');

    expect(result.username).toBe('alice');
    expect(result.permissions).toEqual(['profile:read:self']);
  });

  it('user 不存在 → 抛 404', async () => {
    mocks.userFindFirst.mockResolvedValue(null);
    await expect(authService.me('ghost'))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

// ==================== logout - 幂等 ====================

describe('logout - 幂等', () => {
  it('refreshToken 不传 → 静默返回（不抛）', async () => {
    await expect(authService.logout('user-1', undefined)).resolves.toBeUndefined();
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('refreshToken 无效（不是 jwt）→ 静默返回（幂等）', async () => {
    await expect(authService.logout('user-1', 'garbage')).resolves.toBeUndefined();
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('refreshToken 有效但 userId 不匹配 → 不吊销（防水平越权）', async () => {
    const token = signRefresh('attacker', 'tid');
    await authService.logout('user-1', token);
    expect(mocks.srem).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('refreshToken 有效 + userId 匹配 → 吊销该 token', async () => {
    const token = signRefresh('user-1', 'tid-1');
    await authService.logout('user-1', token);
    expect(mocks.srem).toHaveBeenCalledWith('refresh_active:user-1', 'tid-1');
  });
});

// ==================== changePassword - M0.5-7 ====================

describe('changePassword', () => {
  it('旧密码正确 + 强度合格 → 更新哈希 / 清 mustChange / bump tokenVersion / 吊销 refresh', async () => {
    mocks.userFindFirst.mockResolvedValue(makeUser({ mustChangePassword: true }));
    mocks.smembers.mockResolvedValue(['t1']);
    bcryptMocks.compareFn.mockResolvedValueOnce(true);
    bcryptMocks.hashFn.mockResolvedValueOnce('$2a$12$newhash');

    await authService.changePassword('user-1', 'OldPass1', 'NewPass12');

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        passwordHash: '$2a$12$newhash',
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      }),
    });
    expect(mocks.del).toHaveBeenCalledWith('refresh:user-1:t1');
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE_PASSWORD' }),
    );
  });

  it('旧密码错误 → 401/10110', async () => {
    mocks.userFindFirst.mockResolvedValue(makeUser());
    bcryptMocks.compareFn.mockResolvedValueOnce(false);

    await expect(authService.changePassword('user-1', 'wrong', 'NewPass12'))
      .rejects.toMatchObject({ statusCode: 401, code: 10110 });
  });

  it('新密码强度不足 → 400/10100', async () => {
    await expect(authService.changePassword('user-1', 'OldPass1', 'weak'))
      .rejects.toMatchObject({ statusCode: 400, code: 10100 });
  });
});
