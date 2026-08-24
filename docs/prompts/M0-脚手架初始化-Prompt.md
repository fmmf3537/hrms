# M0-01 至 M0-09：员工管理系统脚手架初始化 Prompt

> 使用方法：把下面整段复制到 Kimi Code（或 Cursor / Copilot Workspace），让它在你指定的新项目目录执行。
> 推荐项目位置：`D:/projects/hrms/`（与现有招聘系统 `C:/Users/fmmf/Kimi/recruiting-system/` 平级）

---

## 【任务 ID】M0 全部 9 个子任务一次性初始化

## 【任务目标】
为西安辰航卓越科技有限公司员工管理系统（HRMS）搭建完整的开发脚手架，达到"可登录、可连库、可部署"的最小可用状态。

## 【项目背景】
- 公司：西安辰航卓越科技有限公司（无人机/低空安全，40 人，多法人：西安/北京/四川）
- 项目类型：自研内部 HRMS，覆盖组织人事/考勤/薪酬/绩效
- 技术栈约束：必须严格复用现有招聘系统的栈与配置（见下方"参考项目"）
- 开发模式：AI Coding，所有代码由你生成，需保证风格一致、可直接投产

## 【参考项目（强制对齐）】
- 路径：`C:/Users/fmmf/Kimi/recruiting-system/`
- 你需要先 Read 以下文件，理解其结构与风格，然后**严格复用**：
  - `package.json`（根目录 pnpm workspace 配置）
  - `pnpm-workspace.yaml`
  - `docker-compose.yml`
  - `server/package.json`（后端依赖清单）
  - `server/prisma/schema.prisma`（Prisma 写法参考）
  - `server/src/app.ts` / `server/src/index.ts`（Express 启动写法）
  - `server/src/middleware/auth.ts` / `errorHandler.ts` / `rate-limit.ts` / `validate.ts`（中间件模板）
  - `client/package.json`（前端依赖清单）
  - `client/src/main.ts` / `App.vue` / `router/` / `stores/`（Vue3 入口写法）
  - `.eslintrc*` / `.prettierrc*` / `tsconfig*.json`（ lint 与 TS 配置）

## 【技术栈（不可替换）】
- 包管理：pnpm（workspace 模式，monorepo）
- 后端：Node.js ≥18 + Express 4 + TypeScript 5 + Prisma 5 + PostgreSQL 15+ + Redis 7 + BullMQ
- 前端：Vue 3.4 + Vite 5 + Element Plus 2.5 + Pinia 2 + Vue Router 4 + ECharts 5 + axios
- 移动端：暂留空目录 `mobile/`（一期只做 H5 自适应，二期扩展）
- 测试：Vitest（单元） + Supertest（接口） + Playwright（E2E）
- 部署：Docker + docker-compose + Nginx
- 认证：JWT（Access Token 15min + Refresh Token 7d）
- 校验：zod
- 密码：bcryptjs

## 【目录结构（严格按此创建）】
```
hrms/
├── package.json                # 根 package.json（private, workspaces）
├── pnpm-workspace.yaml
├── docker-compose.yml          # 开发环境（PostgreSQL + Redis + server + client）
├── docker-compose.prod.yml     # 生产环境（含 Nginx）
├── .gitignore
├── .eslintrc.cjs               # 从招聘系统复制适配
├── .prettierrc                 # 从招聘系统复制
├── README.md
├── AGENTS.md                   # 项目级 AI Coding 上下文说明（见下方模板）
├── client/                     # Vue3 Web 端
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.ts
│       ├── App.vue
│       ├── api/                # axios 封装 + 各模块 API
│       ├── assets/
│       ├── components/         # 通用组件
│       ├── layouts/            # 主布局（含侧边栏 + 顶栏）
│       ├── router/             # 路由 + 守卫
│       ├── stores/             # Pinia（user / app）
│       ├── types/              # TS 类型
│       ├── utils/
│       └── views/
│           ├── login/
│           ├── dashboard/
│           └── error/          # 403 / 404
├── server/                     # Express 后端
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── index.ts            # 入口
│       ├── app.ts              # express app
│       ├── constants/
│       ├── controllers/
│       ├── lib/                # prisma client / redis / errors
│       ├── middleware/         # auth / errorHandler / rateLimit / validate / auditLog
│       ├── routes/             # 路由聚合
│       ├── services/
│       ├── types/
│       ├── utils/
│       └── workers/            # BullMQ 消费者（暂留空）
├── mobile/                     # 暂留空目录，含 README.md 说明
├── nginx/
│   └── nginx.conf              # 反代 client 静态资源 + /api 到 server
└── scripts/
    ├── dev.ps1                 # Windows 一键启动
    ├── dev.sh                  # Linux/macOS 一键启动
    └── deploy.sh               # 部署脚本
```

## 【9 个子任务（按顺序执行）】

### M0-01 初始化 pnpm monorepo
- 创建上述目录结构
- 根 `package.json` 含 scripts：`dev` / `dev:server` / `dev:client` / `build` / `lint` / `format`（参考招聘系统）
- `pnpm-workspace.yaml` 包含 `client` / `server` / `mobile`

### M0-02 复制 lint/格式化/TS 配置
- `.eslintrc.cjs` / `.prettierrc` / 各端 `tsconfig.json`
- 严格模式开启：`strict: true`、`noUncheckedIndexedAccess: true`

### M0-03 docker-compose 编排
- 服务：postgres（5432）/ redis（6379）/ server（3000）/ client（5173）
- 参考招聘系统的 healthcheck / volumes / networks 写法
- `.env.example` 列出所有环境变量

### M0-04 Prisma schema 骨架
仅创建以下 5 张表（不要扩展，后续模块再加）：

```prisma
// 注意：以下为示意，实际写法请参考招聘系统 schema.prisma 风格

model User {
  id            String   @id @default(uuid())
  username      String   @unique
  passwordHash  String
  email         String?  @unique
  phone         String?
  status        String   @default("active")  // active / disabled
  lastLoginAt   DateTime?
  createdAt     DateTime @defaultNow()
  updatedAt     DateTime @updatedAt
  deletedAt     DateTime?
  
  employee      Employee?
  userRoles     UserRole[]
  
  @@map("users")
}

model Role {
  id          String   @id @default(uuid())
  code        String   @unique   // admin / hr / dept_head / executive / employee
  name        String              // 系统管理员 / HR / 部门负责人 / 高管 / 员工
  description String?
  permissions Json                // 权限点数组，如 ["employee:read", "salary:write"]
  createdAt   DateTime @defaultNow()
  updatedAt   DateTime @updatedAt
  
  userRoles   UserRole[]
  
  @@map("roles")
}

model UserRole {
  userId    String
  roleId    String
  createdAt DateTime @defaultNow()
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)
  
  @@id([userId, roleId])
  @@map("user_roles")
}

model Company {
  id          String   @id @default(uuid())
  code        String   @unique   // XACH / BJYJY / SC 等法人代码
  name        String              // 西安辰航卓越科技有限公司 / 北京平谷低空安全研究院等
  shortName   String?
  address     String?
  contact     String?
  status      String   @default("active")
  createdAt   DateTime @defaultNow()
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?
  
  departments Department[]
  employees   Employee[]
  
  @@map("companies")
}

model Department {
  id          String   @id @default(uuid())
  companyId   String
  parentId    String?             // 自引用，支持树形
  code        String   @unique
  name        String
  leaderId    String?             // 部门负责人（关联 Employee，但先不强约束）
  order       Int      @default(0)
  status      String   @default("active")
  createdAt   DateTime @defaultNow()
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?
  
  company     Company      @relation(fields: [companyId], references: [id])
  parent      Department?  @relation("DeptTree", fields: [parentId], references: [id])
  children    Department[] @relation("DeptTree")
  employees   Employee[]
  
  @@map("departments")
}

model Employee {
  id              String   @id @default(uuid())
  userId          String?  @unique
  companyId       String
  departmentId    String?
  employeeNo      String   @unique  // 工号：法人代码+年份+4位流水
  name            String
  gender          String?           // male / female
  idCard          String?  @unique  // 加密存储（应用层处理）
  birthDate       DateTime?
  phone           String?
  email           String?
  employmentType  String            // formal / intern / consultant / labor
  status          String   @default("active")  // active / probation / resigned
  hireDate        DateTime?
  createdAt       DateTime @defaultNow()
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?
  
  user       User?       @relation(fields: [userId], references: [id])
  company    Company     @relation(fields: [companyId], references: [id])
  department Department? @relation(fields: [departmentId], references: [id])
  
  @@map("employees")
}
```

要求：
1. 字段命名 snake_case（Prisma 用 `@map` 映射）
2. 所有表软删除（deletedAt）
3. 写 `prisma/seed.ts`：创建 3 个法人（西安/北京/四川）、5 个角色（admin/hr/dept_head/executive/employee）、1 个 admin 账号（用户名 `admin`，密码 `Admin@123`，bcrypt 加密）
4. `.env.example` 含 `DATABASE_URL="postgresql://postgres:changeme@localhost:5432/hrms?schema=public"`

### M0-05 后端登录/刷新/登出接口
- POST `/api/auth/login` 入参 `{ username, password }` → 返回 `{ accessToken, refreshToken, user }`
- POST `/api/auth/refresh` 入参 `{ refreshToken }` → 返回新 `{ accessToken }`
- POST `/api/auth/logout` 需鉴权 → 使 refreshToken 失效（Redis 黑名单）
- 错误统一返回 `{ code, message, details? }`，HTTP 状态码语义化（400/401/403/404/500）

### M0-06 前端登录页 + 路由守卫
- 登录页：用户名 + 密码 + 登录按钮，调用 `/api/auth/login`
- 登录成功跳转 `/dashboard`，token 存 localStorage
- axios 拦截器：请求带 `Authorization: Bearer <accessToken>`；401 时自动用 refreshToken 换新，失败跳登录
- 路由守卫：未登录访问任意页面跳 `/login`

### M0-07 RBAC 权限中间件
- `middleware/auth.ts`：验证 JWT，把 `userId` 挂到 `req.user`
- `middleware/permission.ts`：`requirePermission('employee:read')` 这种声明式检查
- 权限从 Role.permissions JSON 数组读取
- 未授权返回 403

### M0-08 审计日志中间件
- 创建 `audit_logs` 表（userId / action / resource / resourceId / oldValue / newValue / ip / userAgent / createdAt）
- 中间件拦截 POST/PUT/DELETE 请求，自动记录（含请求 body 与响应摘要）
- 异步写库，不阻塞主流程

### M0-09 Nginx + Dockerfile + 部署脚本
- `nginx/nginx.conf`：80 端口 → client 静态资源；`/api/*` → server:3000
- `server/Dockerfile` / `client/Dockerfile`：多阶段构建（build + runtime）
- `docker-compose.prod.yml`：含 nginx 服务
- `scripts/deploy.sh`：构建 → 上传 → 重启（占位即可，后期填实际服务器）

## 【验收标准】

完成全部 9 个子任务后，必须满足：

1. `pnpm install` 一键装齐所有依赖
2. `docker-compose up -d postgres redis` 启动依赖
3. `pnpm --filter server db:migrate && pnpm --filter server db:seed` 初始化数据库
4. `pnpm dev` 同时启动 server (3000) 和 client (5173)
5. 浏览器访问 `http://localhost:5173` → 跳转登录页 → 用 `admin / Admin@123` 登录成功 → 进入空白工作台
6. Postman 调用：
   - `POST /api/auth/login` 返回 token
   - `GET /api/auth/me`（带 token）返回当前用户信息
   - `GET /api/auth/me`（不带 token）返回 401
7. `pnpm lint` 全通过，`pnpm build` 全通过
8. 数据库 `users` 表有 1 条 admin 记录，`roles` 表有 5 条角色记录，`companies` 表有 3 条法人记录
9. 所有 POST 请求在 `audit_logs` 表有记录

## 【输出要求】

1. 完整创建上述目录结构与所有文件
2. 每个文件头部加注释：`// M0-XX: <任务名> | generated by AI Coding | 2026-08-23`
3. 完成后输出：
   - 文件清单（树状）
   - 启动命令序列
   - 测试结果（登录接口请求/响应示例）
   - 任何未决问题或偏差

## 【AGENTS.md 模板（你必须创建在项目根目录）】

```markdown
# AGENTS.md - HRMS 项目 AI Coding 上下文

## 项目简介
西安辰航卓越科技有限公司员工管理系统（HRMS），一期覆盖组织人事/考勤/薪酬/绩效。

## 技术栈
- pnpm monorepo：client (Vue3) / server (Express+Prisma+PG) / mobile (留空)
- 认证：JWT (access 15min + refresh 7d)
- 权限：RBAC（Role.permissions JSON 数组）
- 数据库：PostgreSQL 15+，软删除约定

## 参考项目
招聘系统：C:/Users/fmmf/Kimi/recruiting-system/
- 风格参考：所有 service / controller / middleware 写法以该项目为准
- 不要直接复制代码，只参考结构

## 命名规范
- 数据库表：snake_case 复数（employees / departments）
- Prisma model：PascalCase 单数（Employee / Department）
- TS 类型：PascalCase（EmployeeDto / CreateEmployeeInput）
- API 路径：/api/<module>/<resource>，kebab-case
- Vue 组件：PascalCase（EmployeeForm.vue）
- 文件：kebab-case（employee.service.ts）

## 业务规则配置化
以下规则必须放 configs 表，不写死代码：
- 工号生成规则、合同到期预警天数、试用期时长、绩效系数、固浮比、提成比例、差旅补助标准

## 当前进度
- [x] M0 脚手架（本周）
- [ ] M1 组织人事
- [ ] M2 考勤假勤
- [ ] M3 绩效管理
- [ ] M4 薪酬核算
- [ ] M5 联调上线
```

## 【禁止事项】

1. 不要引入额外依赖（除非上面明确列出）
2. 不要跳过任何子任务
3. 不要修改参考项目的任何文件
4. 不要使用 ORM 之外的 SQL 查询（除性能关键场景，且需注释说明）
5. 不要在前端存敏感信息（密码、身份证等）
6. 不要省略测试与 seed 数据

---

开始执行。
