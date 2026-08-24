# 【任务】在 D:/projects/hrms/ 下执行 pnpm install 并验证

## 【背景】
HRMS 项目（D:/projects/hrms/）是一个 pnpm monorepo，包含 client / server / mobile 三个子包。
之前我（另一个 AI）已生成所有 package.json，但 pnpm install 一直没成功（外部工具拦截）。
现在请你帮我跑通。

## 【执行步骤（严格按序）】

### 1. 检查现状
```bash
ls D:/projects/hrms/
ls D:/projects/hrms/server/package.json
cat D:/projects/hrms/pnpm-workspace.yaml
```

### 2. 清理（如果存在）
如果存在以下任何一项，**先删除**：
- `D:/projects/hrms/pnpm-lock.yaml`
- `D:/projects/hrms/node_modules/`
- `D:/projects/hrms/server/node_modules/`
- `D:/projects/hrms/client/node_modules/`
- `D:/projects/hrms/mobile/node_modules/`
- `D:/projects/hrms/_tmp_*`（任何这种前缀的临时文件/目录）

### 3. 执行 pnpm install
```bash
cd D:/projects/hrms
pnpm install
```

预期输出：装约 30-50 个包，无 ERR。

### 4. 验证依赖装上
确认以下关键包必须存在于 `D:/projects/hrms/server/node_modules/`：

**生产依赖：**
- express
- @prisma/client
- bcryptjs
- jsonwebtoken
- zod
- ioredis
- helmet
- cors
- morgan
- compression
- express-rate-limit
- dotenv
- uuid

**开发依赖（关键）：**
- typescript
- tsx
- prisma
- eslint
- prettier

可以跑：
```bash
ls D:/projects/hrms/server/node_modules/express/package.json
ls D:/projects/hrms/server/node_modules/jsonwebtoken/package.json
ls D:/projects/hrms/server/node_modules/zod/package.json
ls D:/projects/hrms/server/node_modules/ioredis/package.json
ls D:/projects/hrms/server/node_modules/helmet/package.json
ls D:/projects/hrms/server/node_modules/.bin/tsx
```

### 5. 编译验证（可选但推荐）
```bash
cd D:/projects/hrms/server
pnpm type-check
```
预期：要么通过，要么报几个可忽略的类型错误（不要因为类型错误回滚依赖安装）。

## 【验收报告格式】

完成后输出：

1. **执行摘要**：pnpm install 是否成功、用时多少、装了多少包
2. **依赖核对清单**：列出 §4 中每个包是否成功安装（✓/✗）
3. **类型检查结果**：`pnpm type-check` 是否通过；如失败，列出前 5 条错误
4. **遇到的任何问题**及你的解决方案

## 【禁止事项】
- 不要修改任何 package.json / pnpm-workspace.yaml / 源代码文件
- 不要执行 pnpm dev / pnpm build（只装依赖）
- 不要启动任何服务
- 不要修改 D:/projects/hrms/ 之外的任何文件
- 不要联网搜索"如何修 pnpm"——直接执行命令即可
