# M0-07b 任务：清理 server 端 ESLint 错误到 0 error

## 项目位置（务必确认）
- 项目根目录：`D:/projects/hrms/`（不是 `D:/工作文档区`，不要在文档目录操作）
- 本次只动 `server/` 包。

## 背景
M0-05/M0-06/M0-07 完成后，`pnpm --filter hrms-server lint` 仍报 **2 error + 2 warning**。
目标：把 lint **错误（error）清零**，warning 能顺手修就修，但**不要为了消 warning 破坏 import 风格约定**。

## 当前已知 lint 输出（你执行时以实际为准，可能略有差异）
```
D:\projects\hrms\server\src\middleware\validate.ts
  36:5   error  Unsafe assignment of an `any` value                                                @typescript-eslint/no-unsafe-assignment
  36:19  error  This assertion is unnecessary since it does not change the type of the expression  @typescript-eslint/no-unnecessary-type-assertion

D:\projects\hrms\server\src\index.ts
  3:8  warning  Using exported name 'prisma' as identifier for default import  import/no-named-as-default

D:\projects\hrms\server\src\services\auth.service.ts
  7:8  warning  Using exported name 'prisma' as identifier for default import  import/no-named-as-default
```

## 执行步骤（严格按顺序）

### 1. 先跑一次实际 lint，锁定真实问题
在 `D:/projects/hrms` 根目录执行：
```
pnpm --filter hrms-server lint
```
记下真实 error/warning 列表（以实际为准，不要只看上面的摘要）。

### 2. 自动修复可修复项
```
pnpm --filter hrms-server exec eslint src --ext .ts --fix
```
然后重跑 lint。

### 3. 手动修复剩余的 `validate.ts` 第 36 行（核心）
当前代码：
```ts
req[source] = result.data as Request[typeof source];
```
问题：`result.data` 被推断为 `any` 触发 no-unsafe-assignment；且 `as Request[typeof source]` 断言被判定为不必要（no-unnecessary-type-assertion）。

**要求的安全修法（任选其一，必须保留运行时逻辑不变）**：
- 方案 A（推荐）：引入 zod 的类型推导，给 `result.data` 一个明确类型再赋值：
  ```ts
  const validated = result.data;
  (req as Record<string, unknown>)[source] = validated;
  ```
  注意：`req[source]` 的赋值在 TS 里类型不易直接表达，用 `Record<string, unknown>` 索引赋值可绕过 unsafe，且**不要加 `as` 断言**（zod 已保证类型安全）。
- 方案 B：将 `validate` 的返回签名改为先把 `data` 存入 `res.locals` 或在 `req` 上挂一个明确类型字段，避免对 `req[source]` 做类型不安全的写入。但**不要改变中间件对外行为**（调用方仍通过 `req.body`/`req.query`/`req.params` 拿到验证后的数据）。

**禁止事项**：
- 禁止用 `// @ts-ignore` 或 `// eslint-disable` 掩盖问题（除非是确属工具误报且无其他写法，但本例有安全写法，所以不允许屏蔽）。
- 禁止把 `data` 改成 `any` 显式类型来绕过。
- 禁止改动 `formatZodError`、`passwordSchema`、中间件签名与运行时行为。

### 4. 关于两个 `import/no-named-as-default` warning（index.ts / auth.service.ts）
- 这是 `@prisma/client` 导出 `prisma` 实例的命名约定导致的**误报**（prisma 客户端确实导出名为 `prisma` 的默认实例，用 `import { prisma } from '@prisma/client'` 是官方推荐写法）。
- **本次不强制修**，但如果 `--fix` 能干净处理就处理；若处理需要改 import 风格或加 disable，则**保留 warning 不管**，不要为了消 warning 引入 risk。
- 验收标准只要求 **error = 0**，warning 可保留。

### 5. 修复后必须重跑验证（缺一不可）
```
pnpm --filter hrms-server lint
pnpm --filter hrms-server type-check
pnpm --filter hrms-server test
```
- `lint` 必须 **0 error**（warning 可 >0 但需说明）。
- `type-check` 必须 0 error。
- `test`（vitest）必须全过（当前 9 个用例）。

### 6. 不要动的部分（红线）
- 不要改动 Prisma schema / migration。
- 不要改动 `auth.ts`（M0-07 RBAC）、`permissions.ts`、`rbac.test.ts`、`auth.service.ts` 的权限逻辑（只允许为消 warning 做的最小 import 调整，且不得改变行为）。
- 不要 `pnpm install` 新增依赖（除非 lint 报错确实需要某个 devDep，但目前不需要）。
- 不要改动前端 `client/`。
- 不要删除任何现有测试。

## 上下文包（AI 应先 Read 这些文件以对齐）
- `D:/projects/hrms/server/src/middleware/validate.ts`（本次主改）
- `D:/projects/hrms/server/src/index.ts`
- `D:/projects/hrms/server/src/services/auth.service.ts`
- `D:/projects/hrms/server/.eslintrc.cjs`（确认规则，不要改这个文件）
- `D:/projects/hrms/server/package.json`（确认 lint/type-check/test 脚本）

## 输出要求
完成后用中文简短报告：
1. 修复前 lint 真实 error/warning 数量。
2. 修复方式（validate.ts 用了方案 A 还是 B，是否触及 index.ts/auth.service.ts）。
3. 修复后 lint / type-check / test 三项的执行结果（error 数量、是否 0 error、test 用例数）。
4. 若有保留的 warning，列出文件与规则名并说明为何保留。

## 验收标准
- `pnpm --filter hrms-server lint`：**error = 0**。
- `pnpm --filter hrms-server type-check`：0 error。
- `pnpm --filter hrms-server test`：全部通过（≥9 用例）。
- 未触碰红线文件。
