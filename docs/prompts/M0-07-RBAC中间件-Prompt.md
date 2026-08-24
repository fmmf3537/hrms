# 任务 M0-07：RBAC 权限中间件（细粒度权限控制）

## 执行目录（重要）
所有命令必须在项目根目录 `D:/projects/hrms/` 下执行，不要在当前 AI 的工作文档目录执行。

## 背景与现状（务必先理解，避免重复/冲突）
M0-05 已完成的鉴权基础设施：
- `server/src/middleware/auth.ts` 已有两个中间件：`authenticate`（JWT 校验）和 `requireRole(...codes)`（基于 `req.user.roles` 字符串数组的粗粒度角色校验）。
- `server/src/services/auth.service.ts` 的 `signAccessToken()` 构造的 `JwtPayload` 只含 `roles: string[]`，**不含 permissions**。
- `/me` 接口（`toSafeUser`）只返回 `roles`，不返回 `permissions`。

M0-04 的 `server/prisma/seed.ts` 中 `roles` 表已定义 `permissions: string[]` 字段，每个角色都已配置了权限点（如 hr 角色拥有 `employee:read`/`employee:write`/`salary:read`/`salary:write` 等；admin 为 `['*']` 通配）。

**缺口**：当前没有把角色的 permissions 注入 JWT，也没有 `requirePermission` 中间件，导致细粒度权限（如"只有 HR 能看薪资"）无法在后端强制校验。

## 目标
在 M0-05 基础上补齐**基于权限点（permission）的细粒度 RBAC 中间件**，并通过 Vitest 单元测试验证。M0 阶段**不做**角色管理 UI / 动态改权限页面（那是 M1 业务功能），只做后端基础设施。

## 必须完成的工作

### 1. 新增权限点常量文件 `server/src/constants/permissions.ts`
- 定义 `PERMISSIONS` 常量对象，集中枚举当前系统所有权限点（从 seed.ts 现有 roleDefinitions 里提取，至少包含以下，保持与 seed 一致）：
  - 组织人事：`employee:read` `employee:write` `employee:read:self-dept` `department:read` `department:write`
  - 考勤：`attendance:read` `attendance:write` `attendance:read:self-dept` `attendance:read:self` `attendance:write:self` `attendance:approve`
  - 薪酬：`salary:read` `salary:write` `salary:read:self` `salary:approve`
  - 绩效：`performance:read` `performance:write` `performance:read:self-dept` `performance:write:self-dept` `performance:read:self` `performance:write:self` `performance:approve`
  - 合同：`contract:read` `contract:write`
  - 假勤：`leave:apply` `leave:approve` `overtime:apply` `overtime:approve`
  - 报表：`report:read`
  - 个人中心：`profile:read:self` `profile:write:self`
- 定义 `ROLE_PERMISSIONS` 常量：角色 code → 权限点数组的映射（把 seed.ts 里 `roleDefinitions` 的 permissions 原样搬过来，admin 为 `['*']`）。
- 定义通配常量 `WILDCARD = '*'`。
- 导出类型 `Permission`（= 上述字面量联合类型，用 `typeof PERMISSIONS` 推导或手动联合，保证类型安全）。

### 2. 让 `seed.ts` 复用常量（消除两处不一致）
- 修改 `server/prisma/seed.ts`：从 `../src/constants/permissions` import `ROLE_PERMISSIONS`，用它生成 `roleDefinitions`（不要再在 seed 里硬编码权限数组）。
- 注意 seed.ts 是独立 ts 脚本（用 tsx 跑），import 路径用相对路径 `../src/constants/permissions`，确保 `pnpm db:seed` 仍能跑通。
- ⚠️ seed 内容不变（仍是 3 法人 + 5 角色 + admin 账号），只是权限数组改为引用常量。重新跑 seed 应是幂等（upsert）。

### 3. 登录/刷新时把合并后的 permissions 注入 JWT
- 修改 `server/src/services/auth.service.ts`：
  - `UserWithRoles` 类型与 `userWithRolesInclude` 需额外 include 角色的 `permissions` 字段（当前 `userRoles.include.role` 没取 permissions，需加 `permissions: true`）。
  - 新增 `mergePermissions(roles: {code:string; permissions:string[]}[]): string[]` 工具函数：合并多角色的权限点并**去重**；若任一角色含 `'*'` 则直接返回 `['*']`（通配）。
  - `signAccessToken(user)` 的 `JwtPayload` 增加 `permissions: string[]`（调用 mergePermissions）。
  - `toSafeUser(user)` 返回对象增加 `permissions`（合并后的数组），供 `/me` 返回。
- 修改 `server/src/middleware/auth.ts` 的 `JwtPayload` 接口，增加 `permissions: string[]` 字段（与 signAccessToken 对齐）。

### 4. 新增 `requirePermission` 中间件
在 `server/src/middleware/auth.ts`（或新建 `server/src/middleware/rbac.ts` 并 re-export）中新增：
```ts
export const requirePermission = (...required: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({success:false, error:'未认证', code:401}); return; }
    const perms = req.user.permissions ?? [];
    const allowed = perms.includes('*') || required.some((p) => perms.includes(p));
    if (!allowed) {
      res.status(403).json({success:false, error:'没有权限执行此操作', code:403});
      return;
    }
    next();
  };
};
```
- 保留既有 `requireRole` 不变（向后兼容）。
- 在 `server/src/routes/auth.ts` 或某个演示路由上挂一个受 `requirePermission(PERMISSIONS.SALARY_READ)` 保护的端点（例如 `GET /api/auth/permission-demo`，仅用于验证，返回 200 + 当前用户权限；admin 可访问，无 salary 权限者 403）。注意：此演示端点仅作联调用，M1 正式模块路由会自行挂载 requirePermission。

### 5. 单元测试（Vitest）
- 新增 `server/src/middleware/rbac.test.ts`，用 `supertest` + `express` 或纯函数方式测试 `requirePermission` 与 `mergePermissions`，至少覆盖以下用例：
  1. admin（`permissions:['*']`）访问任意权限点 → 放行（next 被调用）
  2. 用户拥有 `salary:read` → 访问 `requirePermission('salary:read')` 放行
  3. 用户无 `salary:write`、权限为 `['employee:read']` → 访问 `requirePermission('salary:write')` 返回 403
  4. 多角色合并：角色 A=`['employee:read']` + 角色 B=`['department:read']` → 合并后含两者（去重生效）
  5. `req.user` 为 undefined（未认证）→ 返回 401
  6. `req.user.permissions` 缺失/为空数组 → 访问受保护端点返回 403（不能因为字段缺失而误放行）
- 若 server 包未装 vitest/supertest，请在 `server/package.json` devDependencies 增加并在本任务内安装（用你自己的进程执行 pnpm install，可正常跑完）。如引入 supertest 请同步加 `@types/supertest`。

## 约束与一致性要求
- **不改动**前端代码、不改动数据库 schema（roles 表 permissions 字段已存在，无需 migration）、不改动 M0-05 的 authenticate/requireRole 行为。
- 权限点/角色权限**唯一真相源**改为 `src/constants/permissions.ts`，seed 必须引用它，不允许 seed 与常量各写一份导致漂移。
- 安全性：permissions 必须**完全由服务端从用户角色派生**，绝不可信任客户端传入；`mergePermissions` 对 `'*'` 的处理要正确（任一角色含 `*` 即全通）。
- 代码风格与项目一致（Express + TS + ESM、用 `AppError` 抛错、用 `env` 读配置、ESLint 已配置，确保 `pnpm --filter hrms-server lint` 通过）。
- `JwtPayload` 增加 `permissions` 后，所有 `jwt.verify(...) as JwtPayload` 处类型一致，不要出现 any。

## 验收标准（全部满足）
- [ ] `server/src/constants/permissions.ts` 存在，含 `PERMISSIONS` / `ROLE_PERMISSIONS` / `WILDCARD` / `Permission` 类型
- [ ] `seed.ts` 引用常量，重新 `pnpm db:seed` 幂等成功，roles 的 permissions 与之前一致
- [ ] 登录返回的 JWT 含 `permissions`（admin 为 `['*']`）
- [ ] `/me` 返回 `permissions`
- [ ] `requirePermission` 中间件存在且 `requireRole` 仍可用
- [ ] `pnpm --filter hrms-server type-check` 退出码 0
- [ ] `pnpm --filter hrms-server lint` 退出码 0
- [ ] `pnpm --filter hrms-server test`（vitest）全部通过，覆盖上述 6 个用例
- [ ] 手动验证：用 admin 调 `/api/auth/permission-demo` → 200；在测试/脚本中以无 salary 权限的用户调 → 403

## 最终报告
完成后请报告：
1. 新增/修改了哪些文件
2. 登录 JWT 现在包含的权限示例（admin 与普通角色）
3. vitest 用例数与结果
4. 是否改动 schema（应无）、是否新增依赖及其用途
5. 任何偏离上述要求的地方

## 禁止事项
- 不要为通过测试用 `any` / `@ts-ignore` 掩盖类型或逻辑错误
- 不要删除/弱化 `authenticate` 或 `requireRole`
- 不要把权限判断逻辑写到控制器里而绕过中间件（保持"中间件统一强制"）
- 不要改动 client 前端代码
