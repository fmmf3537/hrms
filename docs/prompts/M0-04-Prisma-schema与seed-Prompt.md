# 【任务 ID】M0-04：Prisma schema 骨架 + migration + seed

## 【任务目标】
为 `D:/projects/hrms/server/` 创建 Prisma schema（5 张基础表）、生成首次 migration、写 seed 脚本（含 3 个法人 + 5 个角色 + 1 个 admin 账号），并更新 server/package.json 引入 Prisma 相关依赖与命令。

## 【前置状态】
- M0-01（pnpm monorepo）✅
- M0-02（ESLint/Prettier/TS 配置）✅
- M0-03（docker-compose + .env）✅ — `DATABASE_URL` 已在 `.env` 中
- 当前 `server/` 下还没有 `prisma/` 目录与 `src/`

## 【强制约束】
- 项目根目录：`D:/projects/hrms/`
- 参考项目（只读）：`C:/Users/fmmf/Kimi/recruiting-system/server/prisma/schema.prisma`
- **不要执行 `prisma migrate dev` / `prisma generate`**（用户后续手动跑，需要先 `docker compose up -d`）
- **不要执行 `pnpm install`**（用户后续手动跑）
- 不要修改招聘系统任何文件
- 不要创建业务代码（controller/service/routes 留到 M0-05+）

## 【业务上下文（重要）】

HRMS 一期覆盖 **3 个独立法人**（不含北京研究院）：

| code | name | 城市 |
|---|---|---|
| `XACH` | 西安辰航卓越科技有限公司 | 西安 |
| `XACX` | 西安辰翔卓越科技有限公司 | 西安 |
| `SCXH` | 四川新航卓越（待定）有限公司 | 四川 |

> 第三个法人全名待用户提供，先用占位名，后续只需改 seed 重跑即可。

**5 个角色**（RBAC 基础）：
- `admin`：系统管理员
- `hr`：HR
- `dept_head`：部门负责人
- `executive`：高管（董事长/总经理）
- `employee`：普通员工（含正式/实习/顾问/劳务）

## 【需要创建的文件】

### 1. `D:/projects/hrms/server/prisma/schema.prisma`

要求：
- 严格参考招聘系统 `C:/Users/fmmf/Kimi/recruiting-system/server/prisma/schema.prisma` 的写法风格
- datasource：`provider = "postgresql"`，`url = env("DATABASE_URL")`
- generator：`provider = "prisma-client-js"`
- 创建以下 6 个 model（含 UserRole 关联表）：

```prisma
// schema.prisma（示意，字段含义见注释；实际写法请参考招聘系统）

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String    @id @default(uuid()) @db.Uuid
  username     String    @unique @db.VarChar(50)
  passwordHash String    @map("password_hash") @db.VarChar(255)
  email        String?   @unique @db.VarChar(100)
  phone        String?   @db.VarChar(20)
  status       String    @default("active") @db.VarChar(20) // active / disabled
  lastLoginAt  DateTime? @map("last_login_at") @db.Timestamptz(6)
  createdAt    DateTime  @defaultNow() @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt    DateTime? @map("deleted_at") @db.Timestamptz(6)

  employee  Employee?
  userRoles UserRole[]

  @@map("users")
}

model Role {
  id          String   @id @default(uuid()) @db.Uuid
  code        String   @unique @db.VarChar(50) // admin / hr / dept_head / executive / employee
  name        String   @db.VarChar(50)          // 中文名
  description String?  @db.Text
  permissions Json     @default("[]")           // 权限点数组
  createdAt   DateTime @defaultNow() @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  userRoles UserRole[]

  @@map("roles")
}

model UserRole {
  userId    String   @map("user_id") @db.Uuid
  roleId    String   @map("role_id") @db.Uuid
  createdAt DateTime @defaultNow() @map("created_at") @db.Timestamptz(6)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@id([userId, roleId])
  @@map("user_roles")
}

model Company {
  id        String    @id @default(uuid()) @db.Uuid
  code      String    @unique @db.VarChar(20)      // XACH / XACX / SCXH
  name      String    @db.VarChar(200)
  shortName String?   @map("short_name") @db.VarChar(50)
  city      String?   @db.VarChar(20)              // 西安 / 四川
  address   String?   @db.VarChar(500)
  contact   String?   @db.VarChar(100)
  status    String    @default("active") @db.VarChar(20)
  createdAt DateTime  @defaultNow() @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)

  departments Department[]
  employees   Employee[]

  @@map("companies")
}

model Department {
  id        String    @id @default(uuid()) @db.Uuid
  companyId String    @map("company_id") @db.Uuid
  parentId  String?   @map("parent_id") @db.Uuid
  code      String    @unique @db.VarChar(50)
  name      String    @db.VarChar(100)
  leaderId  String?   @map("leader_id") @db.Uuid // 关联 Employee.id，但暂不强制外键（避免循环依赖）
  order     Int       @default(0)
  status    String    @default("active") @db.VarChar(20)
  createdAt DateTime  @defaultNow() @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)

  company    Company      @relation(fields: [companyId], references: [id])
  parent     Department?  @relation("DeptTree", fields: [parentId], references: [id])
  children   Department[] @relation("DeptTree")
  employees  Employee[]

  @@index([companyId, parentId])
  @@map("departments")
}

model Employee {
  id             String    @id @default(uuid()) @db.Uuid
  userId         String?   @unique @map("user_id") @db.Uuid
  companyId      String    @map("company_id") @db.Uuid
  departmentId   String?   @map("department_id") @db.Uuid
  employeeNo     String    @unique @map("employee_no") @db.VarChar(20)  // 工号：法人代码+年份+4位流水
  name           String    @db.VarChar(50)
  gender         String?   @db.VarChar(10)      // male / female
  idCard         String?   @unique @map("id_card") @db.VarChar(255)     // 加密存储（应用层处理）
  birthDate      DateTime? @map("birth_date") @db.Date
  phone          String?   @db.VarChar(20)
  email          String?   @db.VarChar(100)
  employmentType String    @map("employment_type") @db.VarChar(20)      // formal / intern / consultant / labor
  status         String    @default("probation") @db.VarChar(20)        // probation / active / resigned
  hireDate       DateTime? @map("hire_date") @db.Date
  createdAt      DateTime  @defaultNow() @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz(6)

  user       User?       @relation(fields: [userId], references: [id])
  company    Company     @relation(fields: [companyId], references: [id])
  department Department? @relation(fields: [departmentId], references: [id])

  @@index([companyId, departmentId])
  @@index([employmentType, status])
  @@map("employees")
}
```

### 2. `D:/projects/hrms/server/prisma/seed.ts`

```typescript
// M0-04: database seed | HRMS | 2026-08-23
// 用法：pnpm --filter hrms-server db:seed

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('==> Seeding companies...');
  const companies = await Promise.all([
    prisma.company.upsert({
      where: { code: 'XACH' },
      update: {},
      create: {
        code: 'XACH',
        name: '西安辰航卓越科技有限公司',
        shortName: '辰航卓越',
        city: '西安',
      },
    }),
    prisma.company.upsert({
      where: { code: 'XACX' },
      update: {},
      create: {
        code: 'XACX',
        name: '西安辰翔卓越科技有限公司',
        shortName: '辰翔卓越',
        city: '西安',
      },
    }),
    prisma.company.upsert({
      where: { code: 'SCXH' },
      update: {},
      create: {
        code: 'SCXH',
        name: '四川新航卓越（待定）有限公司',  // TODO: 待用户提供完整法定名称后修改
        shortName: '新航卓越',
        city: '四川',
      },
    }),
  ]);
  console.log(`   ✓ ${companies.length} companies`);

  console.log('==> Seeding roles...');
  const roleDefinitions = [
    {
      code: 'admin',
      name: '系统管理员',
      description: '拥有所有权限',
      permissions: ['*'],
    },
    {
      code: 'hr',
      name: 'HR',
      description: '人力资源部',
      permissions: [
        'employee:read', 'employee:write',
        'department:read', 'department:write',
        'attendance:read', 'attendance:write',
        'salary:read', 'salary:write',
        'performance:read', 'performance:write',
        'contract:read', 'contract:write',
      ],
    },
    {
      code: 'dept_head',
      name: '部门负责人',
      description: '部门管理者',
      permissions: [
        'employee:read:self-dept',
        'attendance:read:self-dept', 'attendance:approve',
        'performance:read:self-dept', 'performance:write:self-dept',
        'leave:approve', 'overtime:approve',
      ],
    },
    {
      code: 'executive',
      name: '高管',
      description: '董事长/总经理',
      permissions: [
        'employee:read', 'department:read',
        'salary:read', 'salary:approve',
        'performance:read', 'performance:approve',
        'report:read',
      ],
    },
    {
      code: 'employee',
      name: '员工',
      description: '普通员工（正式/实习/顾问/劳务）',
      permissions: [
        'profile:read:self', 'profile:write:self',
        'attendance:read:self', 'attendance:write:self',
        'leave:apply', 'overtime:apply',
        'salary:read:self',
        'performance:read:self', 'performance:write:self',
      ],
    },
  ];

  const roles = await Promise.all(
    roleDefinitions.map((r) =>
      prisma.role.upsert({
        where: { code: r.code },
        update: {},
        create: r,
      }),
    ),
  );
  console.log(`   ✓ ${roles.length} roles`);

  console.log('==> Seeding admin user...');
  const adminRole = roles.find((r) => r.code === 'admin')!;
  const passwordHash = await bcrypt.hash('Admin@123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      email: 'admin@hrms.local',
      status: 'active',
      userRoles: {
        create: { roleId: adminRole.id },
      },
    },
  });
  console.log(`   ✓ admin user (id=${admin.id})`);

  console.log('==> Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

### 3. 修改 `D:/projects/hrms/server/package.json`

在现有基础上：
- `dependencies` 添加：`@prisma/client: 5.22.0` + `bcryptjs: ^2.4.3`（与招聘系统版本对齐）
- `devDependencies` 添加：`prisma: ^5.7.1` + `tsx: ^4.7.0` + `@types/bcryptjs: ^2.4.6`（与招聘系统对齐）
- `scripts` 添加：
  ```json
  "db:generate": "prisma generate",
  "db:migrate": "prisma migrate dev",
  "db:deploy": "prisma migrate deploy",
  "db:studio": "prisma studio",
  "db:seed": "tsx prisma/seed.ts",
  "db:reset": "prisma migrate reset"
  ```
- 末尾添加：
  ```json
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
  ```

### 4. `D:/projects/hrms/server/.gitignore`
```
node_modules/
dist/
.env
*.log
```

### 5. 更新 `D:/projects/hrms/AGENTS.md`
把 `- [ ] M0-04 Prisma schema` 改为 `- [x] M0-04 Prisma schema`。

## 【执行步骤（严格按序）】

1. Read `C:/Users/fmmf/Kimi/recruiting-system/server/prisma/schema.prisma` 感受写法风格
2. Read `C:/Users/fmmf/Kimi/recruiting-system/server/package.json` 确认依赖版本
3. 创建 `D:/projects/hrms/server/prisma/` 目录
4. 写入 `schema.prisma` 与 `seed.ts`
5. 修改 `server/package.json`（不要破坏现有 devDependencies，只追加）
6. 创建 `server/.gitignore`
7. 更新 `AGENTS.md` 进度

## 【不要执行的操作】

- ❌ 不要跑 `pnpm install`
- ❌ 不要跑 `prisma generate` / `prisma migrate dev` / `prisma db seed`
- ❌ 不要跑 `docker compose up`
- ❌ 不要跑 `tsx prisma/seed.ts`

> 原因：依赖还没装、数据库还没起，跑了会失败。让用户后续手动一次性执行：
> ```
> pnpm install
> docker compose up -d
> pnpm --filter hrms-server db:migrate
> pnpm --filter hrms-server db:seed
> ```

## 【验收】

完成后输出：

1. 完整目录树（重点：server/prisma/）
2. 文件清单表（路径 / 字节数 / 新建或修改）
3. schema.prisma 中 6 个 model 的清单（每个 model 一行：名称 / 字段数 / 关系数）
4. seed.ts 中确认：
   - 3 个法人代码：XACH / XACX / SCXH
   - 5 个角色代码：admin / hr / dept_head / executive / employee
   - 1 个 admin 账号：username=admin / 密码哈希 bcrypt 10 轮
5. server/package.json 中：
   - 新增的 dependencies 列表
   - 新增的 devDependencies 列表
   - 新增的 scripts 列表

## 【禁止事项】

- 不要执行任何 pnpm / npm / docker / prisma 命令
- 不要创建 `src/` 目录或业务代码
- 不要修改招聘系统任何文件
- 不要修改根目录 `package.json` / `docker-compose.yml` / `.env`
- 不要初始化 git
