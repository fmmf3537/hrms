# 【任务 ID】M0-01：pnpm monorepo 初始化

## 【任务目标】
在 `D:/projects/hrms/` 目录下初始化 pnpm monorepo 骨架（仅目录结构 + 根 package.json + pnpm-workspace.yaml + 三个子包的占位 package.json），达到 `pnpm install` 能跑通的最小状态。

## 【强制约束】
- 项目根目录：`D:/projects/hrms/`（已存在，为空目录）
- 参考项目（只读，不修改）：`C:/Users/fmmf/Kimi/recruiting-system/`
- 不要联网安装额外脚手架（不跑 `pnpm create vite` 等命令），所有文件由你直接写入
- 不要启动任何服务、不要跑 migrate、不要初始化 git
- 不要创建 node_modules；只生成配置文件
- 不要生成业务代码（controller/service/page 一律不写）

## 【需要创建的文件与内容】

### 1. `D:/projects/hrms/package.json`
```json
{
  "name": "hrms",
  "version": "0.1.0",
  "private": true,
  "description": "西安辰航卓越科技有限公司员工管理系统（HRMS）",
  "scripts": {
    "dev": "concurrently \"pnpm dev:server\" \"pnpm dev:client\"",
    "dev:client": "pnpm --filter hrms-client dev",
    "dev:server": "pnpm --filter hrms-server dev",
    "dev:mobile": "pnpm --filter hrms-mobile dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "format": "pnpm -r format",
    "test": "pnpm -r test"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  },
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  },
  "packageManager": "pnpm@8.15.0"
}
```

### 2. `D:/projects/hrms/pnpm-workspace.yaml`
```yaml
packages:
  - 'client'
  - 'server'
  - 'mobile'
```

### 3. `D:/projects/hrms/.gitignore`
```
node_modules/
dist/
build/
.env
.env.local
.env.*.local
*.log
.DS_Store
coverage/
.vscode/
.idea/
*.tsbuildinfo
.prisma/
```

### 4. `D:/projects/hrms/.npmrc`
```
strict-peer-dependencies=false
auto-install-peers=true
shamefully-hoist=false
```

### 5. `D:/projects/hrms/client/package.json`（占位，后续 M0-06 再填完整）
```json
{
  "name": "hrms-client",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "echo 'client dev - to be implemented in M0-06'",
    "build": "echo 'client build - to be implemented in M0-06'",
    "lint": "echo 'client lint - placeholder'",
    "format": "echo 'client format - placeholder'",
    "test": "echo 'client test - placeholder'"
  }
}
```

### 6. `D:/projects/hrms/server/package.json`（占位，后续 M0-05 再填完整）
```json
{
  "name": "hrms-server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "echo 'server dev - to be implemented in M0-05'",
    "build": "echo 'server build - to be implemented in M0-05'",
    "lint": "echo 'server lint - placeholder'",
    "format": "echo 'server format - placeholder'",
    "test": "echo 'server test - placeholder'"
  }
}
```

### 7. `D:/projects/hrms/mobile/package.json`（占位）
```json
{
  "name": "hrms-mobile",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "echo 'mobile - reserved for phase 2'",
    "build": "echo 'mobile - reserved'",
    "lint": "echo 'placeholder'",
    "format": "echo 'placeholder'",
    "test": "echo 'placeholder'"
  }
}
```

### 8. `D:/projects/hrms/mobile/README.md`
```markdown
# mobile

一期占位目录。
- 一期仅做 client (Vue3 H5) 移动端自适应
- 二期扩展为小程序 / App
```

### 9. `D:/projects/hrms/README.md`
```markdown
# HRMS - 员工管理系统

西安辰航卓越科技有限公司内部 HRMS 系统。

## 一期范围
- 组织人事（M1）
- 考勤假勤（M2）
- 绩效管理（M3）
- 薪酬核算（M4）

## 技术栈
pnpm monorepo / Express + TS + Prisma + PostgreSQL / Vue 3 + Element Plus

## 参考项目
C:/Users/fmmf/Kimi/recruiting-system/（只读）

## 启动
\`\`\`bash
pnpm install
pnpm dev
\`\`\`
```

### 10. `D:/projects/hrms/AGENTS.md`
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
招聘系统：C:/Users/fmmf/Kimi/recruiting-system/（只读）

## 命名规范
- 数据库表：snake_case 复数（employees / departments）
- Prisma model：PascalCase 单数（Employee / Department）
- TS 类型：PascalCase
- API 路径：/api/<module>/<resource>，kebab-case
- Vue 组件：PascalCase
- 文件：kebab-case

## 业务规则配置化
工号规则 / 预警天数 / 试用期 / 绩效系数 / 固浮比 / 提成比例 / 差旅标准 → 全部走 configs 表

## 当前进度
- [ ] M0-01 pnpm monorepo 初始化（当前）
- [ ] M0-02 lint 配置
- [ ] M0-03 docker-compose
- [ ] M0-04 Prisma schema
- [ ] M0-05 后端登录接口
- [ ] M0-06 前端登录页
- [ ] M0-07 RBAC 中间件
- [ ] M0-08 审计日志
- [ ] M0-09 Nginx + Docker
```

## 【执行步骤（严格按序）】

1. 在 `D:/projects/hrms/` 下创建 `client/`、`server/`、`mobile/` 三个子目录
2. 按上述内容逐个创建文件（**绝对路径写入**，不要 cd）
3. 不要运行 `pnpm install`（我们只想生成配置文件，跑 install 留给用户）
4. 不要运行任何其他命令（不起服务、不连库、不跑 lint）

## 【验收】

完成后列出 `D:/projects/hrms/` 完整目录树（用 `tree` 或 `ls -R`），并自报：
- 创建了多少个文件
- 每个文件的字节数
- 是否有任何偏差

## 【禁止事项】
- 不要执行 `pnpm install` / `pnpm dev` / `npm` 任何命令
- 不要创建 `node_modules`
- 不要修改 `C:/Users/fmmf/Kimi/recruiting-system/` 任何文件
- 不要创建除上述 10 个文件以外的任何文件
- 不要初始化 git
