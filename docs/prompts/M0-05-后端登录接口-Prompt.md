# 【任务 ID】M0-05：后端登录接口（Express + JWT + Redis）

## 【任务目标】
为 `D:/projects/hrms/server/` 实现最小可用的后端：
- Express 应用骨架（app.ts / index.ts / 中间件 / 路由聚合）
- JWT 认证（Access Token 15min + Refresh Token 7d）
- 3 个接口：`POST /api/auth/login` / `POST /api/auth/refresh` / `POST /api/auth/logout` / `GET /api/auth/me` / `GET /api/health`
- Refresh Token 黑名单存 Redis
- 全局错误处理 + 请求日志 + CORS + rate limit + helmet

## 【前置状态】
- M0-01 ~ M0-04 已完成
- 数据库已就绪：`localhost:5501` PostgreSQL（db=hrms），含 users/roles/user_roles/companies 等表
- Redis 已就绪：`localhost:6401`
- admin 账号：`username=admin` / 密码 `Admin@123`（bcrypt 加密已存库）
- `.env` 已含 `JWT_SECRET` / `JWT_REFRESH_SECRET` / `PORT=3000` / `CORS_ORIGIN=http://localhost:5173`

## 【强制约束】
- 项目根目录：`D:/projects/hrms/`
- 参考项目（只读）：`C:/Users/fmmf/Kimi/recruiting-system/server/`
- **必须先 Read 以下参考文件，理解写法后适配**：
  - `C:/Users/fmmf/Kimi/recruiting-system/server/src/app.ts`
  - `C:/Users/fmmf/Kimi/recruiting-system/server/src/index.ts`
  - `C:/Users/fmmf/Kimi/recruiting-system/server/src/lib/env.ts`
  - `C:/Users/fmmf/Kimi/recruiting-system/server/src/lib/prisma.ts`
  - `C:/Users/fmmf/Kimi/recruiting-system/server/src/lib/redis.ts`
  - `C:/Users/fmmf/Kimi/recruiting-system/server/src/middleware/auth.ts`
  - `C:/Users/fmmf/Kimi/recruiting-system/server/src/middleware/errorHandler.ts`
  - `C:/Users/fmmf/Kimi/recruiting-system/server/src/middleware/rate-limit.ts`
  - `C:/Users/fmmf/Kimi/recruiting-system/server/src/middleware/validate.ts`
  - `C:/Users/fmmf/Kimi/recruiting-system/server/src/routes/auth.ts`
  - `C:/Users/fmmf/Kimi/recruiting-system/server/src/routes/index.ts`
- **不要执行 `pnpm install`**：本任务完成后由用户统一执行
- **不要启动服务**：写完代码即可，不要跑 `pnpm dev`
- 不要修改招聘系统任何文件

## 【业务约束（HRMS 适配点）】

- **登录字段用 username（不是 email）**：HRMS 内部系统，用户更习惯工号/用户名登录
- **JWT Payload 字段**：`userId / username / companyId / departmentId / roles (string[]) / tokenVersion`
  - 与招聘系统不同：HRMS 一个用户可对应一个 employee，roles 是数组（UserRole 多对多）
- **不要复用招聘系统的 `role` 单值字段**：HRMS 用 `roles[]`
- **不要实现飞书登录 / 邮箱注册 / 改密**（一期只做登录/刷新/登出/me）
- **rate limit**：登录 5 分钟最多 10 次

## 【需要创建的文件】

### 1. `server/src/lib/env.ts`
读取并校验 process.env，导出强类型 `env` 对象。至少含：
- `NODE_ENV / PORT / DATABASE_URL / REDIS_URL / JWT_SECRET / JWT_EXPIRES_IN / JWT_REFRESH_SECRET / JWT_REFRESH_EXPIRES_IN / CORS_ORIGIN`
- 用 zod 校验，缺关键变量时启动报错并退出

### 2. `server/src/lib/prisma.ts`
导出 PrismaClient 单例，开发环境打印 SQL 日志。

### 3. `server/src/lib/redis.ts`
导出 ioredis 单例，含连接事件日志。

### 4. `server/src/middleware/errorHandler.ts`
- `AppError` 类（`message / statusCode / code?`）
- `asyncHandler` 包装器
- 全局错误处理中间件（区分 AppError / zodError / 未知错误）
- 统一响应格式：`{ success: false, error, code, details? }`

### 5. `server/src/middleware/validate.ts`
- `validate(schema)` 中间件：校验 req.body，失败返回 400
- `passwordSchema`：zod 密码规则（≥8 位，含大小写+数字+特殊字符）

### 6. `server/src/middleware/rate-limit.ts`
- `loginLimiter`：5min / 10 次
- `apiLimiter`：1min / 100 次（兜底）

### 7. `server/src/middleware/auth.ts`
- `JwtPayload` 接口：`{ userId, username, companyId, departmentId, roles, tokenVersion? }`
- `authenticate` 中间件：从 `Authorization: Bearer <token>` 提取并验证
- `requireRole(...codes: string[])` 中间件：检查 roles 交集
- 类型扩展：`declare global { namespace Express { interface Request { user?: JwtPayload } } }`

### 8. `server/src/services/auth.service.ts`
- `login(username, password)`：查用户 → bcrypt 校验 → 签发 access + refresh token → 把 refreshToken 存 Redis（key=`refresh:<userId>:<tokenId>`，TTL 7d）→ 返回 `{ user, accessToken, refreshToken }`
- `refresh(refreshToken)`：验证 refresh token → 检查 Redis 是否存在 → 签发新 access token → 返回 `{ accessToken }`
- `logout(userId, refreshToken)`：从 Redis 删除对应 key
- `me(userId)`：返回用户基本信息 + roles + 关联 employee（如有）
- 用户查询时 join `userRoles → role`，把 roles 数组提取为 `string[]`

### 9. `server/src/controllers/auth.controller.ts`
薄壳，调用 service，处理 HTTP 状态码。

### 10. `server/src/routes/auth.ts`
- `POST /login` → loginLimiter + validate(loginSchema) + controller
- `POST /refresh` → validate(refreshSchema) + controller
- `POST /logout` → authenticate + controller
- `GET /me` → authenticate + controller

loginSchema:
```typescript
z.object({
  username: z.string().min(2, '用户名至少 2 位').max(50),
  password: z.string().min(6, '密码至少 6 位'),
})
```

### 11. `server/src/routes/index.ts`
- 聚合路由：`router.use('/auth', authRouter)`
- 加 `GET /api/health` 返回 `{ success: true, data: { status: 'ok', timestamp, uptime } }`

### 12. `server/src/app.ts`
- 创建 express app
- 中间件顺序：helmet → cors → morgan('dev') → express.json → apiLimiter → routes → 404 → errorHandler
- 导出 app（不 listen）

### 13. `server/src/index.ts`
- import app + env + prisma + redis
- 启动监听 env.PORT
- 优雅关闭：SIGTERM/SIGINT 时关闭 server → prisma.$disconnect() → redis.quit()
- 未捕获异常兜底：process.on('unhandledRejection' / 'uncaughtException')

### 14. 修改 `D:/projects/hrms/server/package.json`

在现有 dependencies 添加（版本与招聘系统对齐）：
```
"express": "^4.18.2",
"jsonwebtoken": "^9.0.2",
"zod": "^3.22.4",
"ioredis": "^5.10.1",
"helmet": "^7.1.0",
"cors": "^2.8.5",
"morgan": "^1.10.0",
"compression": "^1.8.1",
"express-rate-limit": "^8.3.2",
"dotenv": "^16.3.1",
"uuid": "^9.0.1"
```

devDependencies 添加：
```
"@types/express": "^4.17.21",
"@types/jsonwebtoken": "^9.0.5",
"@types/cors": "^2.8.17",
"@types/morgan": "^1.10.0",
"@types/compression": "^1.8.1",
"@types/uuid": "^9.0.7",
"tsx": "^4.7.0"  (如果还没有)
```

scripts 更新：
```json
"dev": "tsx watch src/index.ts",
"build": "tsc",
"start": "node dist/index.js"
```

### 15. 更新 `D:/projects/hrms/AGENTS.md`
`- [ ] M0-05 后端登录接口` → `- [x] M0-05 后端登录接口`

## 【执行步骤】

1. 先 Read 上述 11 个参考文件（招聘系统）
2. 按上述清单创建 13 个新文件 + 修改 2 个文件
3. **不要执行 `pnpm install`**（用户手动跑）
4. **不要启动服务**

## 【验收】

完成后输出：

1. 完整目录树（重点：server/src/）
2. 文件清单表：路径 / 字节数 / 新建或修改
3. 接口列表：方法 + 路径 + 中间件链 + 说明
4. 与招聘系统的差异说明（HRMS 的适配点）：
   - 登录字段：username vs email
   - JWT Payload：roles 数组 vs role 单值
   - 公司/部门上下文：companyId + departmentId
5. 未能从招聘系统复用的点（如有）

## 【用户后续手动验证步骤（仅供你参考，不要执行）】

```bash
# 1. 装依赖
cd D:/projects/hrms && pnpm install

# 2. 启动 server
pnpm --filter hrms-server dev

# 3. 另一个终端测试
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123"}'

# 期望返回 accessToken + refreshToken + user 信息

# 4. 用 accessToken 访问 /me
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <accessToken>"

# 5. 健康检查
curl http://localhost:3000/api/health
```

## 【禁止事项】

- 不要执行任何 pnpm / npm / docker / curl 命令
- 不要写飞书登录、邮箱注册、改密、忘记密码（一期不需要）
- 不要写业务接口（employee/department 等留到 M1）
- 不要写测试代码（M0-08 再做）
- 不要修改 prisma/schema.prisma（已经稳定）
- 不要修改根目录 package.json
- 不要初始化 git
