// M0-07: RBAC requirePermission / mergePermissions 单元测试 | HRMS | 2026-08-24
import type { NextFunction, Request, Response } from 'express';
import {
  describe, expect, it, vi,
} from 'vitest';

import { PERMISSIONS, WILDCARD } from '../constants/permissions';
import { mergePermissions } from '../services/auth.service';

import { requirePermission, type JwtPayload } from './auth';
import { AppError } from './errorHandler';

function makeUser(permissions: string[]): JwtPayload {
  return {
    userId: 'u1',
    username: 'tester',
    companyId: null,
    departmentId: null,
    roles: ['employee'],
    permissions,
    tokenVersion: 0,
    mustChangePassword: false,
  };
}

function createMocks(user?: JwtPayload) {
  const req = { user } as unknown as Request;
  const status = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  const res = { status, json } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return {
    req, res, status, json, next,
  };
}

describe('requirePermission', () => {
  it('admin（permissions 含 *）访问任意权限点 → 放行', () => {
    const { req, res, next } = createMocks(makeUser([WILDCARD]));
    requirePermission(PERMISSIONS.SALARY_WRITE, PERMISSIONS.CONTRACT_WRITE)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });

  it('用户拥有 salary:read → 访问 requirePermission(salary:read) 放行', () => {
    const { req, res, next } = createMocks(makeUser([PERMISSIONS.SALARY_READ]));
    requirePermission(PERMISSIONS.SALARY_READ)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('用户无 salary:write → next(AppError 403/10121)', () => {
    const { req, res, next } = createMocks(makeUser([PERMISSIONS.EMPLOYEE_READ]));
    requirePermission(PERMISSIONS.SALARY_WRITE)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe(10121);
  });

  it('req.user 为 undefined → next(AppError 401/10101)', () => {
    const { req, res, next } = createMocks(undefined);
    requirePermission(PERMISSIONS.SALARY_READ)(req, res, next);
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe(10101);
  });

  it('req.user.permissions 缺失 → next(AppError 403/10121)', () => {
    const legacyUser = { ...makeUser([]) } as { permissions?: string[] };
    delete legacyUser.permissions;
    const { req, res, next } = createMocks(legacyUser as unknown as JwtPayload);
    requirePermission(PERMISSIONS.SALARY_READ)(req, res, next);
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe(10121);
  });

  it('req.user.permissions 为空数组 → next(AppError 403/10121)', () => {
    const { req, res, next } = createMocks(makeUser([]));
    requirePermission(PERMISSIONS.SALARY_READ)(req, res, next);
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe(10121);
  });
});

describe('mergePermissions', () => {
  it('多角色合并去重：employee:read + department:read', () => {
    const merged = mergePermissions([
      { code: 'a', permissions: [PERMISSIONS.EMPLOYEE_READ] },
      { code: 'b', permissions: [PERMISSIONS.DEPARTMENT_READ, PERMISSIONS.EMPLOYEE_READ] },
    ]);
    expect(merged).toContain(PERMISSIONS.EMPLOYEE_READ);
    expect(merged).toContain(PERMISSIONS.DEPARTMENT_READ);
    expect(merged).toHaveLength(2);
  });

  it('任一角色含 * → 直接返回 [*]（全通）', () => {
    const merged = mergePermissions([
      { code: 'admin', permissions: [WILDCARD] },
      { code: 'hr', permissions: [PERMISSIONS.SALARY_READ] },
    ]);
    expect(merged).toEqual([WILDCARD]);
  });

  it('无角色 → 返回空数组', () => {
    expect(mergePermissions([])).toEqual([]);
  });
});
