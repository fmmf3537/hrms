# 【任务 ID】M0-03：docker-compose 开发环境编排

## 【任务目标】
为 `D:/projects/hrms/` 创建开发环境用的 docker-compose 编排，启动 PostgreSQL 和 Redis 两个基础设施服务（server/client 由本地 pnpm dev 启动，不进容器）。

## 【前置状态】
- M0-01 / M0-02 已完成：项目骨架与 lint/TS 配置就绪
- 当前项目根目录还没有 docker-compose.yml / .env.example

## 【强制约束】
- 项目根目录：`D:/projects/hrms/`
- 参考项目（只读）：`C:/Users/fmmf/Kimi/recruiting-system/docker-compose.yml`
- **本任务只做开发环境的基础设施编排（PostgreSQL + Redis），不做生产环境的 server/client/nginx 镜像构建**（那是 M0-09 的事）
- 不要执行 `docker-compose up` / `docker compose up` 等命令（用户后续手动跑）
- 不要安装任何 npm 依赖
- 不要修改招聘系统任何文件

## 【需要创建的文件】

### 1. `D:/projects/hrms/docker-compose.yml`（开发环境，仅基础设施）

```yaml
# M0-03: dev infrastructure compose | adapted from recruiting-system | 2026-08-23
# 仅用于本地开发：启动 PostgreSQL + Redis
# server / client 由 pnpm dev 在本地启动，不进容器

services:
  # PostgreSQL 数据库
  postgres:
    image: postgres:16-alpine
    container_name: hrms_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-changeme}
      POSTGRES_DB: ${DB_NAME:-hrms}
      # 强制 UTF-8 + 中国时区
      LANG: C.UTF-8
      TZ: Asia/Shanghai
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:${DB_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-postgres} -d ${DB_NAME:-hrms}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - hrms_network

  # Redis（BullMQ 队列 + JWT refresh token 黑名单 + 缓存）
  redis:
    image: redis:7-alpine
    container_name: hrms_redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    ports:
      - "127.0.0.1:${REDIS_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - hrms_network

volumes:
  postgres_data:
    name: hrms_postgres_data
  redis_data:
    name: hrms_redis_data

networks:
  hrms_network:
    name: hrms_network
    driver: bridge
```

### 2. `D:/projects/hrms/.env.example`

```bash
# ===== 数据库 =====
DB_USER=postgres
DB_PASSWORD=changeme
DB_NAME=hrms
DB_PORT=5432

# ===== Redis =====
REDIS_PORT=6379
REDIS_URL=redis://localhost:6379

# ===== Prisma =====
DATABASE_URL=postgresql://postgres:changeme@localhost:5432/hrms?schema=public

# ===== JWT =====
JWT_SECRET=dev-only-jwt-secret-min-32-chars-change-in-prod
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=dev-only-refresh-secret-min-32-chars-change-in-prod
JWT_REFRESH_EXPIRES_IN=7d

# ===== Server =====
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173

# ===== Client =====
VITE_API_BASE_URL=http://localhost:3000/api
```

### 3. `D:/projects/hrms/.env`（本地开发用，把 .env.example 内容原样复制一份）

> 注意：`.env` 已在 `.gitignore` 中（M0-01 已配置），不会进版本库。

### 4. `D:/projects/hrms/scripts/dev.sh`（Linux/macOS 一键启动）

```bash
#!/usr/bin/env bash
# M0-03: dev startup script (Linux/macOS)
set -e

cd "$(dirname "$0")/.."

echo "==> 启动 PostgreSQL + Redis ..."
docker compose up -d postgres redis

echo "==> 等待数据库健康检查通过 ..."
until docker compose exec -T postgres pg_isready -U "${DB_USER:-postgres}" -d "${DB_NAME:-hrms}" >/dev/null 2>&1; do
  sleep 1
done
echo "==> PostgreSQL 就绪"

echo "==> 等待 Redis 就绪 ..."
until docker compose exec -T redis redis-cli ping >/dev/null 2>&1; do
  sleep 1
done
echo "==> Redis 就绪"

echo ""
echo "✅ 基础设施已启动"
echo "   PostgreSQL: localhost:${DB_PORT:-5432}  (db=${DB_NAME:-hrms})"
echo "   Redis:      localhost:${REDIS_PORT:-6379}"
echo ""
echo "下一步："
echo "  1) pnpm install                       # 首次需要"
echo "  2) pnpm --filter hrms-server db:migrate && pnpm --filter hrms-server db:seed"
echo "  3) pnpm dev                           # 启动 server + client"
```

### 5. `D:/projects/hrms/scripts/dev.ps1`（Windows 一键启动）

```powershell
# M0-03: dev startup script (Windows PowerShell)
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> 启动 PostgreSQL + Redis ..." -ForegroundColor Cyan
docker compose up -d postgres redis

Write-Host "==> 等待数据库健康检查通过 ..." -ForegroundColor Cyan
$dbUser = if ($env:DB_USER) { $env:DB_USER } else { "postgres" }
$dbName = if ($env:DB_NAME) { $env:DB_NAME } else { "hrms" }
do {
  Start-Sleep -Seconds 1
  $ready = docker compose exec -T postgres pg_isready -U $dbUser -d $dbName 2>$null
} while ($LASTEXITCODE -ne 0)
Write-Host "==> PostgreSQL 就绪" -ForegroundColor Green

Write-Host "==> 等待 Redis 就绪 ..." -ForegroundColor Cyan
do {
  Start-Sleep -Seconds 1
  docker compose exec -T redis redis-cli ping 2>$null | Out-Null
} while ($LASTEXITCODE -ne 0)
Write-Host "==> Redis 就绪" -ForegroundColor Green

$dbPort = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$redisPort = if ($env:REDIS_PORT) { $env:REDIS_PORT } else { "6379" }

Write-Host ""
Write-Host "✅ 基础设施已启动" -ForegroundColor Green
Write-Host "   PostgreSQL: localhost:$dbPort  (db=$dbName)"
Write-Host "   Redis:      localhost:$redisPort"
Write-Host ""
Write-Host "下一步："
Write-Host "  1) pnpm install"
Write-Host "  2) pnpm --filter hrms-server db:migrate; pnpm --filter hrms-server db:seed"
Write-Host "  3) pnpm dev"
```

### 6. 更新 `D:/projects/hrms/README.md`

在 `## 启动` 小节下面追加：

```markdown

## 基础设施（开发）

\`\`\`bash
# 启动 PostgreSQL + Redis
docker compose up -d

# 或使用一键脚本
bash scripts/dev.sh        # Linux/macOS
./scripts/dev.ps1          # Windows PowerShell

# 停止
docker compose down

# 停止并清空数据（谨慎）
docker compose down -v
\`\`\`

## 环境变量
复制 `.env.example` 为 `.env` 并按需修改。
```

### 7. 更新 `D:/projects/hrms/AGENTS.md`

把"当前进度"小节的 `- [ ] M0-03 docker-compose` 改为 `- [x] M0-03 docker-compose`。

## 【执行步骤】

1. Read 招聘系统的 `C:/Users/fmmf/Kimi/recruiting-system/docker-compose.yml`（仅供你参考写法，不要照抄 server/client/nginx 部分）
2. 按上述清单创建 5 个新文件 + 更新 2 个已有文件
3. **不要执行** `docker compose up` / `docker-compose up` / `docker` 任何命令
4. **不要执行** `pnpm install` 或任何 npm 命令

## 【验收】

完成后输出：

1. 完整目录树（重点：docker-compose.yml / .env / .env.example / scripts/）
2. 表格列出每个新建/修改文件的：
   - 路径
   - 字节数
   - 类型（新建/修改）
3. 用 `docker compose config` 命令的语义检查（你可以**脑内**模拟，不需要真跑），确认 yaml 语法正确：服务名/卷名/网络名是否一致、端口映射格式是否正确
4. 是否引用了招聘系统特有内容（ats_postgres / recruitment_system 等），如有则报错（应该是 hrms_postgres / hrms）

## 【禁止事项】

- 不要执行 `docker` / `docker-compose` / `docker compose` 任何命令
- 不要执行 `pnpm` / `npm` 任何命令
- 不要添加 server / client / nginx 服务（那是 M0-09 的事）
- 不要修改招聘系统任何文件
- 不要初始化 git
- 不要写生产部署相关配置（Dockerfile / docker-compose.prod.yml / nginx.conf 一律不创建）
