import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

import { WILDCARD } from '../constants/permissions';
import { env } from '../lib/env';
import prisma from '../lib/prisma';
import { redis, connectRedis } from '../lib/redis';
import type { JwtPayload } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

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

type UserWithRoles = {
  id: string;
  username: string;
  passwordHash: string;
  email: string | null;
  phone: string | null;
  status: string;
  mustChangePassword: boolean;
  userRoles: Array<{ role: { code: string; name: string; permissions: string[] } }>;
  employee: {
    id: string;
    employeeNo: string;
    name: string;
    companyId: string;
    departmentId: string | null;
    status: string;
  } | null;
};

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
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    roles,
    permissions: mergePermissions(user.userRoles.map((ur) => ur.role)),
    companyId: user.employee?.companyId ?? null,
    departmentId: user.employee?.departmentId ?? null,
    employee: user.employee,
  };
}

function signAccessToken(user: UserWithRoles): string {
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    companyId: user.employee?.companyId ?? null,
    departmentId: user.employee?.departmentId ?? null,
    roles: user.userRoles.map((ur) => ur.role.code),
    permissions: mergePermissions(user.userRoles.map((ur) => ur.role)),
    tokenVersion: 0,
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

function refreshKey(userId: string, tokenId: string): string {
  return `refresh:${userId}:${tokenId}`;
}

/**
 * 用户登录
 */
export async function login(username: string, password: string) {
  // findFirst + deletedAt: null —— 软删除用户即使 status 仍为 active 也不得登录
  const user = (await prisma.user.findFirst({
    where: { username, deletedAt: null },
    include: userWithRolesInclude,
  })) as UserWithRoles | null;

  if (!user || user.status !== 'active') {
    throw new AppError('用户名或密码错误', 401);
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new AppError('用户名或密码错误', 401);
  }

  const accessToken = signAccessToken(user);

  // 签发 refresh token 并存入 Redis（key=refresh:<userId>:<tokenId>，TTL 7d）
  const tokenId = uuidv4();
  const refreshToken = jwt.sign(
    { userId: user.id, tokenId } as RefreshTokenPayload,
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
  );
  await connectRedis();
  await redis.set(refreshKey(user.id, tokenId), '1', 'EX', REFRESH_TOKEN_TTL);

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
 */
export async function refresh(refreshToken: string) {
  let decoded: RefreshTokenPayload;
  try {
    decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('刷新令牌已过期，请重新登录', 401);
    }
    throw new AppError('无效的刷新令牌', 401);
  }

  // 检查 Redis 中是否存在（登出后已删除则拒绝）
  await connectRedis();
  const exists = await redis.get(refreshKey(decoded.userId, decoded.tokenId));
  if (!exists) {
    throw new AppError('刷新令牌已失效，请重新登录', 401);
  }

  const user = (await prisma.user.findFirst({
    where: { id: decoded.userId, deletedAt: null },
    include: userWithRolesInclude,
  })) as UserWithRoles | null;

  if (!user || user.status !== 'active') {
    throw new AppError('用户不存在或已被禁用', 401);
  }

  const accessToken = signAccessToken(user);
  return { accessToken };
}

/**
 * 用户登出：删除 Redis 中对应的 refresh token
 */
export async function logout(userId: string, refreshToken?: string) {
  if (!refreshToken) {
    return;
  }
  try {
    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
    if (decoded.userId === userId) {
      await connectRedis();
      await redis.del(refreshKey(decoded.userId, decoded.tokenId));
    }
  } catch {
    // refresh token 已过期/无效时无需处理，幂等登出
  }
}

/**
 * 获取当前用户信息（含 roles 与关联 employee）
 */
export async function me(userId: string) {
  const user = (await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: userWithRolesInclude,
  })) as UserWithRoles | null;

  if (!user) {
    throw new AppError('用户不存在', 404);
  }

  return toSafeUser(user);
}
