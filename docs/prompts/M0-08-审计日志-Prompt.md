# M0-08 任务：审计日志（Audit Log）基础设施

## 项目位置（务必确认）
- 项目根目录：`D:/projects/hrms/`（不是 `D:/工作文档区`，不要在文档目录操作）
- 本次只动 `server/` 包。

## 背景与目标
HRMS 是员工人事/薪酬/绩效系统，合规要求所有"写操作"可追溯。M0-08 要建立一个**通用审计日志基础设施**，供后续 M1~M4 各业务模块直接调用，而不是在 M0 阶段就给每个接口埋点（那是 M1 以后的事）。

目标产出：
1. 数据库 `AuditLog` 表（记录谁、在什么时间、对什么资源、做了什么动作、前后值、IP、结果）。
2. 一个 `auditLog()` 服务函数（或 middleware / helper），业务代码一行就能记录。
3. 一个 `/api/audit-logs` 查询接口（仅 admin / hr 可读，受 RBAC 控制），支持按时间/操作人/资源类型/动作分页过滤。
4. 在**现有已实现的写接口**上做最小示范埋点（登录成功、登出、刷新 token 不需要；建议对 `auth` 相关的关键写操作示范，例如：权限演示接口不必埋，但应至少有一个真实写接口示范），证明基础设施可用。
5. 单元测试覆盖核心服务函数（异步写不阻塞主流程、字段正确、权限查询过滤）。

## 执行步骤（严格按顺序）

### 1. 先 Read 这些上下文文件（对齐现有风格）
- `D:/projects/hrms/server/prisma/schema.prisma`（看清现有 model 命名风格、软删除约定、主键类型）
- `D:/projects/hrms/server/src/lib/prisma.ts`
- `D:/projects/hrms/server/src/services/auth.service.ts`（看现有 service 怎么写、怎么取 req.user）
- `D:/projects/hrms/server/src/middleware/auth.ts`（看 `requirePermission` 签名、`AuthedRequest` 类型）
- `D:/projects/hrms/server/src/constants/permissions.ts`（看现有权限点，新增审计查询权限点要符合现有命名）
- `D:/projects/hrms/server/src/routes/auth.ts`（看现有路由注册方式）
- `D:/projects/hrms/server/src/app.ts`（看中间件挂载顺序）
- `D:/projects/hrms/server/server/package.json`（确认脚本、是否已装必要 devDep）

### 2. 新增 `AuditLog` Prisma model
遵循现有风格（参考 Companies/Users 的写法：UUID 主键 `cuid()`、统一 `snake_case` 映射、软删除 `deleted_at` 若项目通用则加，否则省略——以实际 schema 约定为准）。字段建议：
- `id` String @id @default(cuid())
- `userId` String? （操作用户 id，匿名/系统操作可为 null）
- `action` String （如 LOGIN / CREATE / UPDATE / DELETE / EXPORT）
- `resourceType` String （如 Employee / Salary / Attendance）
- `resourceId` String? （被操作对象 id）
- `description` String? （人类可读描述）
- `oldValue` Json? （变更前，敏感字段须脱敏/省略，M0 阶段允许存 Json 或省略）
- `newValue` Json?
- `ipAddress` String?
- `userAgent` String?
- `status` String （SUCCESS / FAILURE）
- `createdAt` DateTime @default(now()) （审计日志**不可更新**，只有 createdAt）
- 软删除：审计日志**不建议**加 deleted_at（日志不可删），按实际约定；若项目强制所有表软删除，则加但禁止逻辑删除调用。

在 model 上建合理索引：`(userId)`、`(action)`、`(resourceType)`、`(createdAt)`、复合 `(resourceType, createdAt)` 便于查询过滤。

然后生成并应用 migration（用 `pnpm --filter hrms-server db:migrate --name add_audit_log`，或直接 `prisma migrate dev`，以 package.json 脚本为准；不要用 `db push` 绕过 migration 历史）。

### 3. 新增权限点（在 `constants/permissions.ts`）
参照现有 `PERMISSIONS` / `ROLE_PERMISSIONS` 结构，新增：
- `AUDIT_READ = 'audit:read'`
- 在 `ROLE_PERMISSIONS` 中：admin 与 hr 角色加入 `AUDIT_READ`（若现有 ROLE_PERMISSIONS 是数组/对象形式，按实际结构加；不要破坏现有映射）。
- **同步更新 `seed.ts`**：若 seed 当前是引用 `ROLE_PERMISSIONS` 派生的，则自动生效；若 seed 是硬编码权限数组，则必须同步把 `audit:read` 加进 admin 和 hr 的 permissions（保证 seed 与代码单一真相源一致，参照 M0-07 已建立的约定）。
- 跑一次 `pnpm --filter hrms-server db:seed`（确认幂等，不要重复插入角色/用户）。

### 4. 新增审计服务 `src/services/audit.service.ts`
导出 `auditLog(params)`，要求：
- 入参：`{ userId?, action, resourceType, resourceId?, description?, oldValue?, newValue?, ipAddress?, userAgent?, status }`
- **异步 fire-and-forget**：写入失败**绝不能**影响主业务流程（用 try/catch 包住，错误只 log，不 throw 到调用方）。这是审计系统的关键可靠性要求。
- 从 Prisma client 写入 `AuditLog`。
- 提供 `listAuditLogs({ page, pageSize, userId?, action?, resourceType?, from?, to? })` 供查询接口调用，返回分页结果与总数。

### 5. 在现有写接口做最小示范埋点
- 选 `auth.controller.ts` 的登录成功分支：登录成功后调用 `auditLog({ userId, action:'LOGIN', resourceType:'Auth', status:'SUCCESS', ipAddress, userAgent })`。
- 如还有其他已实现的真实写接口（例如刷新 token 失败、登出），可酌情埋 1 个。示范即可，**不要求全埋**（全埋是 M1 各模块职责）。
- 从 `req` 取 `ipAddress`（注意反向代理场景用 `req.ip`，若前面有 nginx 后续再处理 `X-Forwarded-For`，M0 阶段用 `req.ip` 即可）与 `userAgent`（`req.headers['user-agent']`）。

### 6. 新增查询接口 `GET /api/audit-logs`
- 路由文件建议 `src/routes/audit.ts`，在 `src/routes/index.ts` 注册。
- 中间件链：`authenticate` + `requirePermission(PERMISSIONS.AUDIT_READ)`。
- 支持 query：`page`（默认1）、`pageSize`（默认20，上限100）、`userId`、`action`、`resourceType`、`from`、`to`（ISO 日期）。
- 返回 `{ data: AuditLog[], total, page, pageSize }`。
- 加 zod 校验（参考现有 `validate` 中间件用法，或在此路由内用 zod 校验 query）。
- 仅返回必要字段，避免泄露敏感 `newValue`（或按权限，M0 阶段直接返回即可，后续再做脱敏）。

### 7. 单元测试 `src/services/audit.service.test.ts`
覆盖：
- 写入成功：调用 `auditLog` 后数据库确实有记录（用测试库或 mock prisma；若项目无测试数据库，用 vitest mock `prisma.auditLog.create` 验证入参正确）。
- 写入失败不抛错：mock `prisma.auditLog.create` 抛错，验证 `auditLog` 不 reject、主流程可继续（可 spy console.error 或直接验证不 throw）。
- `listAuditLogs` 过滤：mock `findMany` / `count` 返回，验证分页参数与过滤条件正确传入。
- 至少 3 个用例。

### 8. 修复后必须重跑验证（缺一不可）
```
pnpm --filter hrms-server migrate:status   # 确认 migration 已应用
pnpm --filter hrms-server lint
pnpm --filter hrms-server type-check
pnpm --filter hrms-server test
```
- `lint`：**0 error**（warning 可保留，参照 M0-07b 约定）。
- `type-check`：0 error。
- `test`：全部通过（现有 9 个 + 新增 ≥3 个）。

### 9. 不要动的部分（红线）
- 不要改动 `auth.ts`（RBAC 中间件本身）、`permissions.ts` 的现有权限点语义（只能**新增** `AUDIT_READ`，不能改现有映射）。
- 不要改动前端 `client/`。
- 不要删/改现有 migration（只新增 migration）。
- 不要改变登录/refresh 接口的现有返回结构。
- 不要为了消 lint warning 用 `@ts-ignore` / `eslint-disable` 掩盖真实类型问题。

## 关于 pnpm 在本机执行
本机若直接 `pnpm` 因 safe-delete 注入失败，执行任何 pnpm 命令前加 `NODE_OPTIONS=''`（即 `NODE_OPTIONS='' pnpm ...`）。若仍不行，用 `npx` 直接调用同等二进制（eslint/tsc/vitest/prisma），参数与 package.json script 一致。

## 输出要求
完成后用中文简短报告：
1. 新增/修改了哪些文件。
2. migration 名称与状态。
3. 新增权限点及其在 seed 中的落地方式。
4. 示范埋点位置（哪个接口、什么 action）。
5. lint / type-check / test 三项结果（error 数、test 用例数）。
6. 若有保留 warning，列出。

## 验收标准
- `AuditLog` 表通过 migration 创建，未破坏现有表。
- `auditLog()` 异步不阻塞主流程（失败不抛错）。
- `/api/audit-logs` 受 `AUDIT_READ` 权限控制（无权限 403，无 token 401）。
- 单元测试用例全部通过（≥3 新增）。
- `lint` 0 error、`type-check` 0 error、现有 9 用例 + 新增用例全过。
- 未触碰红线文件。
