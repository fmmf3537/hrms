import { randomInt } from 'crypto';

import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

import { WILDCARD } from '../constants/permissions';
import { env } from '../lib/env';
import prisma from '../lib/prisma';
import { redis, connectRedis } from '../lib/redis';
import type { JwtPayload } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

import * as auditService from './audit.service';

// Refresh Token 在 Redis 中的 TTL（7 天，与 JWT_REFRESH_EXPIRES_IN 保持一致）
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;

// M5-04: 登录 timing oracle 防御——用户不存在时也执行一次 bcrypt.compare（cost 12，~100-300ms），
// 抹平"用户不存在/停用"与"密码错误"的响应时间差，防止侧信道枚举账号。
// 该 hash 属于一次性生成的合法 bcrypt cost=12 哈希，明文不可知、无任何账号使用。
const DUMMY_TIMING_HASH = '$2a$12$pj495GdnQfuPgal5ncA//.1HyatDnPr2rhi6f.rQJfqADomTTQHJK';

interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

// 带角色与员工信息的用户查询条件
const userWithRolesInclude = {
  userRoles: {
    include: { role: true },
  },
  employee: {
    select: {
      id: true,
      employeeNo: true,
      name: true,
      companyId: true,
      departmentId: true,
      status: true,
    },
  },
} as const;

// 用 Prisma 类型推导替代手写 UserWithRoles（消除 as 强转，与 schema 自动同步）
export type UserWithRoles = Prisma.UserGetPayload<{
  include: typeof userWithRolesInclude;
}>;

/**
 * 合并多角色的权限点并去重；任一角色含通配 '*' 则直接返回 ['*']
 */
export function mergePermissions(
  roles: Array<{ code: string; permissions: string[] }>,
): string[] {
  if (roles.some((r) => r.permissions.includes(WILDCARD))) {
    return [WILDCARD];
  }
  return [...new Set(roles.flatMap((r) => r.permissions))];
}

function toSafeUser(user: UserWithRoles) {
  const roles = user.userRoles.map((ur) => ur.role.code);
  // Prisma Json 字段推导为 JsonValue，schema 默认值保证非空；运行时 narrow 为 string[]
  const rolePerms = user.userRoles.map((ur) => ({
    code: ur.role.code,
    permissions: (ur.role.permissions as string[] | null) ?? [],
  }));
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    roles,
    permissions: mergePermissions(rolePerms),
    companyId: user.employee?.companyId ?? null,
    departmentId: user.employee?.departmentId ?? null,
    employee: user.employee,
  };
}

function signAccessToken(user: UserWithRoles): string {
  const roles = user.userRoles.map((ur) => ur.role.code);
  const rolePerms = user.userRoles.map((ur) => ({
    code: ur.role.code,
    permissions: (ur.role.permissions as string[] | null) ?? [],
  }));
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    companyId: user.employee?.companyId ?? null,
    departmentId: user.employee?.departmentId ?? null,
    roles,
    permissions: mergePermissions(rolePerms),
    tokenVersion: user.tokenVersion,
    mustChangePassword: user.mustChangePassword,
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

function signRefreshToken(userId: string, tokenId: string): string {
  return jwt.sign(
    { userId, tokenId } as RefreshTokenPayload,
    env.JWT_REFRESH_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    },
  );
}

// 单 token 存在性 key
function refreshKey(userId: string, tokenId: string): string {
  return `refresh:${userId}:${tokenId}`;
}

// 该用户当前所有活跃 refresh tokenId 集合（用于 reuse 检测 + rotation）
function activeSetKey(userId: string): string {
  return `refresh_active:${userId}`;
}

/**
 * 把新 tokenId 登记为该用户的活跃 token
 * - 写单 token key（带 TTL）
 * - 加到活跃 set（带 TTL，自动续期）
 */
async function registerActiveToken(userId: string, tokenId: string): Promise<void> {
  await connectRedis();
  const setKey = activeSetKey(userId);
  const tokenK = refreshKey(userId, tokenId);
  // 同一个 pipeline 写入；失败时确保原子性由 Redis 自身保证
  await redis.multi()
    .set(tokenK, '1', 'EX', REFRESH_TOKEN_TTL)
    .sadd(setKey, tokenId)
    .expire(setKey, REFRESH_TOKEN_TTL)
    .exec();
}

/**
 * 吊销单个 token（正常 rotation 或 logout）
 */
async function revokeToken(userId: string, tokenId: string): Promise<void> {
  await connectRedis();
  await redis.multi()
    .del(refreshKey(userId, tokenId))
    .srem(activeSetKey(userId), tokenId)
    .exec();
}

/**
 * 吊销该用户的所有 refresh token（reuse 检测命中时使用）
 */
async function revokeAllUserTokens(userId: string): Promise<void> {
  await connectRedis();
  const setKey = activeSetKey(userId);
  const tokenIds = await redis.smembers(setKey);
  if (tokenIds.length > 0) {
    const keysToDel = tokenIds.map((tid) => refreshKey(userId, tid));
    await redis.del(...keysToDel);
  }
  await redis.del(setKey);
}

/**
 * 用户登录（含失败审计埋点）
 * 失败原因不区分"用户不存在/密码错"——统一返回 401，避免账号枚举
 * 但 auditLog 内部会记录区分，方便事后审计
 */
export async function login(
  username: string,
  password: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  // findFirst + deletedAt: null —— 软删除用户即使 status 仍为 active 也不得登录
  const user = await prisma.user.findFirst({
    where: { username, deletedAt: null },
    include: userWithRolesInclude,
  });

  // 失败：用户不存在 / 已停用 / 密码错 → 统一 401
  if (!user) {
    // M5-04: timing oracle 抹平——跑一次假 bcrypt 比对，使耗时与"密码错误"路径一致
    try {
      await bcrypt.compare(password, DUMMY_TIMING_HASH);
    } catch {
      /* 仅用于耗时抹平，失败忽略 */
    }
    auditService.auditLog({
      userId: null,
      action: auditService.AUDIT_ACTIONS.LOGIN,
      resourceType: auditService.AUDIT_RESOURCE_TYPES.AUTH,
      description: `登录失败：用户不存在 (username=${username})`,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      status: auditService.AUDIT_STATUS.FAILURE,
    }).catch(() => { /* audit 内部已兜底 */ });
    throw new AppError('用户名或密码错误', 401, 10110);
  }

  if (user.status !== 'active') {
    auditService.auditLog({
      userId: user.id,
      action: auditService.AUDIT_ACTIONS.LOGIN,
      resourceType: auditService.AUDIT_RESOURCE_TYPES.AUTH,
      resourceId: user.id,
      description: `登录失败：账号已停用 (username=${username})`,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      status: auditService.AUDIT_STATUS.FAILURE,
    }).catch(() => { /* audit 内部已兜底 */ });
    // V1.2.1 安全加固：对外文案与"密码错"完全一致（防账号枚举），
    // 内部审计已记录具体原因（账号已停用）
    throw new AppError('用户名或密码错误', 401, 10110);
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    auditService.auditLog({
      userId: user.id,
      action: auditService.AUDIT_ACTIONS.LOGIN,
      resourceType: auditService.AUDIT_RESOURCE_TYPES.AUTH,
      resourceId: user.id,
      description: `登录失败：密码错误 (username=${username})`,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      status: auditService.AUDIT_STATUS.FAILURE,
    }).catch(() => { /* audit 内部已兜底 */ });
    throw new AppError('用户名或密码错误', 401, 10110);
  }

  // 渐进式重哈希：若当前 passwordHash 的 cost < 12（V1.2 安全基线），
  // 异步用 cost=12 重新哈希后写回，登录主流程不被阻塞。
  // 失败仅 console.error，不影响登录。
  (async () => {
    try {
      const roundsMatch = /^\$2[aby]\$(\d+)\$/.exec(user.passwordHash);
      const currentRounds = roundsMatch ? parseInt(roundsMatch[1], 10) : 0;
      if (currentRounds < 12) {
        const newHash = await bcrypt.hash(password, 12);
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: newHash },
        });
      }
    } catch (err) {
      console.error('[auth] 渐进式重哈希失败（不影响登录）:', err);
    }
  })();

  const accessToken = signAccessToken(user);

  // 签发 refresh token 并登记到活跃 set
  const tokenId = uuidv4();
  const refreshToken = signRefreshToken(user.id, tokenId);
  await registerActiveToken(user.id, tokenId);

  // 更新最后登录时间
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    user: toSafeUser(user),
    accessToken,
    refreshToken,
  };
}

/**
 * 刷新 Access Token
 * 行为：rotation（每次都换新 refreshToken，旧 token 立即失效）+ reuse 检测
 *
 * Reuse 检测语义：
 *   - 正常 refresh：旧 tokenId 在活跃 set 中 → 换发新 token，旧 tokenId 移出 set
 *   - 异常 refresh：旧 tokenId 不在 set 中（说明已用过/被吊销）→ 视为盗用
 *     → 吊销该用户所有 refresh token，强制重新登录
 */
export async function refresh(refreshTokenValue: string) {
  // 1. 验签 + 过期检查
  let decoded: RefreshTokenPayload;
  try {
    decoded = jwt.verify(refreshTokenValue, env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
    }) as RefreshTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('刷新令牌已过期，请重新登录', 401, 10104);
    }
    throw new AppError('无效的刷新令牌', 401, 10105);
  }

  await connectRedis();

  // 2. 检查 token 是否还在活跃 set 中
  const isActive = await redis.sismember(activeSetKey(decoded.userId), decoded.tokenId);
  if (!isActive) {
    // Reuse 检测命中：吊销该 user 所有 refresh token
    await revokeAllUserTokens(decoded.userId);
    // 记录安全事件
    auditService.auditLog({
      userId: decoded.userId,
      action: auditService.AUDIT_ACTIONS.LOGIN,
      resourceType: auditService.AUDIT_RESOURCE_TYPES.AUTH,
      resourceId: decoded.userId,
      description: '刷新令牌重用检测命中，已强制该用户所有会话下线',
      status: auditService.AUDIT_STATUS.FAILURE,
    }).catch(() => { /* audit 内部已兜底 */ });
    throw new AppError('检测到刷新令牌被重用，请重新登录', 401, 10106);
  }

  // 3. 用户当前状态校验
  const user = await prisma.user.findFirst({
    where: { id: decoded.userId, deletedAt: null },
    include: userWithRolesInclude,
  });
  if (!user || user.status !== 'active') {
    await revokeAllUserTokens(decoded.userId);
    throw new AppError('用户不存在或已被禁用', 403, 10111);
  }

  // 4. Rotation：吊销旧 token + 签发新 token
  await revokeToken(decoded.userId, decoded.tokenId);
  const newTokenId = uuidv4();
  const newRefreshToken = signRefreshToken(user.id, newTokenId);
  await registerActiveToken(user.id, newTokenId);

  const accessToken = signAccessToken(user);
  return { accessToken, refreshToken: newRefreshToken };
}

/**
 * 用户登出：吊销对应的 refresh token
 */
export async function logout(userId: string, refreshTokenValue?: string) {
  if (!refreshTokenValue) {
    return;
  }
  try {
    const decoded = jwt.verify(refreshTokenValue, env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
    }) as RefreshTokenPayload;
    if (decoded.userId === userId) {
      await revokeToken(decoded.userId, decoded.tokenId);
    }
  } catch {
    // refresh token 已过期/无效时无需处理，幂等登出
  }
}

/**
 * 获取当前用户信息（含 roles 与关联 employee）
 */
export async function me(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: userWithRolesInclude,
  });

  if (!user) {
    throw new AppError('用户不存在', 404, 70101);
  }
  // 禁用用户不应能查自己（与"禁用即冻结"原则一致）
  if (user.status !== 'active') {
    throw new AppError('账号已被禁用', 403, 10111);
  }

  return toSafeUser(user);
}

const PASSWORD_STRENGTH = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

/**
 * 用户自助改密（M0.5-7）
 * - 校验旧密码 → 强度校验 → bcrypt cost=12 → 清 mustChangePassword → bump tokenVersion
 * - 吊销全部 refresh token（全端下线）
 */
export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  if (!PASSWORD_STRENGTH.test(newPassword)) {
    throw new AppError(
      '新密码强度不足：至少 8 位，且含大小写字母与数字',
      400,
      10100,
    );
  }
  if (oldPassword === newPassword) {
    throw new AppError('新密码不能与旧密码相同', 400, 10100);
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
  });
  if (!user || user.status !== 'active') {
    throw new AppError('用户不存在或已被禁用', 403, 10111);
  }

  const ok = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!ok) {
    throw new AppError('旧密码错误', 401, 10110);
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: newHash,
      mustChangePassword: false,
      tokenVersion: { increment: 1 },
    },
  });

  await revokeAllUserTokens(userId);

  auditService.auditLog({
    userId,
    action: 'UPDATE_PASSWORD',
    resourceType: auditService.AUDIT_RESOURCE_TYPES.AUTH,
    resourceId: userId,
    description: '用户自助修改密码',
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent ?? null,
  }).catch(() => { /* fire-and-forget */ });
}

/**
 * Admin 强制要求某用户下次登录改密（M0.5-7）
 */
export async function forceChangePassword(
  actorUserId: string,
  targetUserId: string,
): Promise<void> {
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, deletedAt: null },
  });
  if (!target) {
    throw new AppError('用户不存在', 404, 70101);
  }

  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      mustChangePassword: true,
      tokenVersion: { increment: 1 },
    },
  });
  await revokeAllUserTokens(targetUserId);

  auditService.auditLog({
    userId: actorUserId,
    action: 'UPDATE_PASSWORD',
    resourceType: auditService.AUDIT_RESOURCE_TYPES.AUTH,
    resourceId: targetUserId,
    description: `管理员强制用户 ${target.username} 下次登录改密`,
  }).catch(() => { /* fire-and-forget */ });
}

const TWO_FA_TTL_SEC = 5 * 60;
// M5-04: 2FA 错误尝试锁定（5 次错 → 锁 30 分钟，需重新获取验证码）
const TWO_FA_MAX_ATTEMPTS = 5;
const TWO_FA_LOCK_SEC = 30 * 60;

/**
 * 发起二次验证：向用户手机/邮箱发 6 位验证码（经 integration sms/email）
 */
export async function request2fa(
  userId: string,
  channel: 'sms' | 'email',
): Promise<{ expiresIn: number }> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
  });
  if (!user || user.status !== 'active') {
    throw new AppError('用户不存在或已被禁用', 403, 10111);
  }

  // M5-04: 验证码用 CSPRNG（crypto.randomInt），取代原 Math.random（值域可暴力）
  const code = String(randomInt(100000, 1000000));
  await connectRedis();
  await redis.set(`2fa:${userId}:${channel}`, code, 'EX', TWO_FA_TTL_SEC);

  // 延迟加载，避免与 notification/integration 循环依赖
  const { send } = await import('./integration.service');

  if (channel === 'sms') {
    if (!user.phone) {
      throw new AppError('用户未绑定手机号', 400, 10100);
    }
    await send({
      code: 'sms',
      payload: { to: user.phone, content: `您的验证码是 ${code}，${TWO_FA_TTL_SEC / 60} 分钟内有效` },
    });
  } else {
    if (!user.email) {
      throw new AppError('用户未绑定邮箱', 400, 10100);
    }
    await send({
      code: 'email',
      payload: {
        to: user.email,
        subject: 'HRMS 二次验证码',
        content: `您的验证码是 ${code}，${TWO_FA_TTL_SEC / 60} 分钟内有效`,
      },
    });
  }

  return { expiresIn: TWO_FA_TTL_SEC };
}

/**
 * 校验二次验证码
 * M5-04: 失败计数（Redis INCR，5 次错锁 30min）——防暴力猜测（原无任何限制）
 */
export async function verify2fa(
  userId: string,
  channel: 'sms' | 'email',
  code: string,
): Promise<{ verified: true }> {
  await connectRedis();
  const key = `2fa:${userId}:${channel}`;
  const attemptsKey = `2fa_attempts:${userId}:${channel}`;
  const stored = await redis.get(key);
  if (!stored || stored !== code) {
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) {
      await redis.expire(attemptsKey, TWO_FA_LOCK_SEC);
    }
    if (attempts >= TWO_FA_MAX_ATTEMPTS) {
      await redis.del(key); // 清掉验证码，强制重新获取
      throw new AppError(
        `验证码错误次数过多，请 ${TWO_FA_LOCK_SEC / 60} 分钟后再试`,
        401,
        10131,
      );
    }
    throw new AppError('验证码错误或已过期', 401, 10103);
  }
  await redis.del(key);
  await redis.del(attemptsKey);
  // 短期放行标记（敏感操作中间件可查）
  await redis.set(`2fa_ok:${userId}`, '1', 'EX', 15 * 60);
  return { verified: true };
}
