// M0-07: RBAC requirePermission / mergePermissions 单元测试 | HRMS | 2026-08-24
import type { NextFunction, Request, Response } from 'express';
import {
  describe, expect, it, vi,
} from 'vitest';

import { PERMISSIONS, WILDCARD } from '../constants/permissions';
import { mergePermissions } from '../services/auth.service';

import { requirePermission, type JwtPayload } from './auth';

function makeUser(permissions: string[]): JwtPayload {
  return {
    userId: 'u1',
    username: 'tester',
    companyId: null,
    departmentId: null,
    roles: ['employee'],
    permissions,
    tokenVersion: 0,
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
  });

  it('用户拥有 salary:read → 访问 requirePermission(salary:read) 放行', () => {
    const { req, res, next } = createMocks(makeUser([PERMISSIONS.SALARY_READ]));
    requirePermission(PERMISSIONS.SALARY_READ)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('用户无 salary:write（权限为 employee:read）→ 返回 403', () => {
    const {
      req, res, status, json, next,
    } = createMocks(makeUser([PERMISSIONS.EMPLOYEE_READ]));
    requirePermission(PERMISSIONS.SALARY_WRITE)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 403 }),
    );
  });

  it('req.user 为 undefined（未认证）→ 返回 401', () => {
    const {
      req, res, status, json, next,
    } = createMocks(undefined);
    requirePermission(PERMISSIONS.SALARY_READ)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 401 }),
    );
  });

  it('req.user.permissions 缺失（旧 token 无该字段）→ 返回 403 而非误放行', () => {
    // 模拟 M0-05 签发的旧 token：payload 中没有 permissions 字段
    const legacyUser = { ...makeUser([]) } as { permissions?: string[] };
    delete legacyUser.permissions;
    const {
      req, res, status, next,
    } = createMocks(legacyUser as unknown as JwtPayload);
    requirePermission(PERMISSIONS.SALARY_READ)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it('req.user.permissions 为空数组 → 返回 403', () => {
    const {
      req, res, status, next,
    } = createMocks(makeUser([]));
    requirePermission(PERMISSIONS.SALARY_READ)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
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
    expect(merged).toHaveLength(2); // 去重生效
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
