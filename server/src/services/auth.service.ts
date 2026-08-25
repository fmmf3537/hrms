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
    tokenVersion: 0,
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
    auditService.auditLog({
      userId: null,
      action: auditService.AUDIT_ACTIONS.LOGIN,
      resourceType: auditService.AUDIT_RESOURCE_TYPES.AUTH,
      description: `登录失败：用户不存在 (username=${username})`,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      status: auditService.AUDIT_STATUS.FAILURE,
    }).catch(() => { /* audit 内部已兜底 */ });
    throw new AppError('用户名或密码错误', 401);
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
    throw new AppError('用户名或密码错误', 401);
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
    throw new AppError('用户名或密码错误', 401);
  }

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
      throw new AppError('刷新令牌已过期，请重新登录', 401);
    }
    throw new AppError('无效的刷新令牌', 401);
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
    throw new AppError('检测到刷新令牌被重用，请重新登录', 401);
  }

  // 3. 用户当前状态校验
  const user = await prisma.user.findFirst({
    where: { id: decoded.userId, deletedAt: null },
    include: userWithRolesInclude,
  });
  if (!user || user.status !== 'active') {
    await revokeAllUserTokens(decoded.userId);
    throw new AppError('用户不存在或已被禁用', 401);
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
    throw new AppError('用户不存在', 404);
  }
  // 禁用用户不应能查自己（与"禁用即冻结"原则一致）
  if (user.status !== 'active') {
    throw new AppError('账号已被禁用', 403);
  }

  return toSafeUser(user);
}
