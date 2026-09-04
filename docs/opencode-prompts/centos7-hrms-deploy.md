# CentOS7 + Docker 首次部署 HRMS —— opencode 任务提示词

> 使用方式：在 opencode 容器内 `cd /workspace && opencode`（或 Web），粘贴下方【任务】整段。

---

【任务】在 CentOS7 服务器上用 Docker Compose 完成 HRMS 的首次部署（运行环境已就绪）

【你的运行环境】
- 你在一个 ubuntu:22.04 容器里，通过挂载的 /var/run/docker.sock 驱动宿主的 Docker（docker / docker compose 命令可直接使用）
- HRMS 源码已在宿主 /opt/hrms，挂载为你这里的 /workspace
- 目标：让 HRMS（server/client + postgres/pgvector + redis）以 compose 在宿主跑起来，前端 8081 端口可访问

【步骤】

0. 侦察（只读）
   - `ls /workspace | head -20`：确认 docker-compose.yml、Dockerfile.*、.env.example 存在
   - `docker ps -a`：了解宿主机现有容器（可能有 wekan-*、httpd 等）——**绝不可动它们**
   - `hostname -I`：取内网 IP（后面 CORS 用）

1. 生成 `/workspace/.env`（不存在则生成；不回显密钥）
   ```bash
   cd /workspace
   DB_PASS=$(openssl rand -hex 16)
   JWT1=$(openssl rand -base64 48 | tr '+/' '-_')
   JWT2=$(openssl rand -base64 48 | tr '+/' '-_')
   ENC=$(openssl rand -hex 32)
   IP=$(hostname -I | awk '{print $1}')
   cat > .env <<EOF
   DB_USER=postgres
   DB_PASSWORD=${DB_PASS}
   DB_NAME=hrms
   DB_PORT=5432
   REDIS_PORT=6379
   JWT_SECRET=${JWT1}
   JWT_REFRESH_SECRET=${JWT2}
   JWT_EXPIRES_IN=15m
   JWT_REFRESH_EXPIRES_IN=7d
   ENCRYPTION_KEY=${ENC}
   CORS_ORIGIN=http://${IP}:8081
   CLIENT_PORT=8081
   LLM_PROVIDER=mock
   OCR_PROVIDER=mock
   SMS_PROVIDER=mock
   EOF
   ```
   （完成后只报告键名清单，不打印值）

2. 构建镜像：`cd /workspace && docker compose build`（可能数分钟，耐心等待；失败贴完整日志）

3. 起基础服务并等健康：
   `docker compose up -d postgres redis` → `docker compose ps`（轮询直到 healthy，最多 60s；
   可用 `docker inspect --format '{{.State.Health.Status}}' hrms_postgres hrms_redis`）

4. 数据库迁移（server 镜像内含 prisma schema）：
   `docker compose run --rm --entrypoint sh server -c "cd server && npx prisma migrate deploy"`

5. seed（建 admin/system 用户 + 全部 configs；需源码与 dev 依赖 → 一次性容器挂源码执行）：
   ```bash
   # DB_PASSWORD 从 /workspace/.env 读取传入；值不回显
   docker run --rm --network host -v /opt/hrms:/src -w /src \
     -e DATABASE_URL="postgresql://postgres:<DB_PASSWORD>@127.0.0.1:5432/hrms?schema=public" \
     node:20-alpine sh -lc "corepack enable && corepack prepare pnpm@8.15.0 --activate && pnpm install --no-frozen-lockfile >/dev/null 2>&1 && cd server && pnpm db:seed"
   ```
   （pnpm install 因网络失败可重试 1 次，仍失败则如实报告）

6. 启动全部：`docker compose up -d`（server 启动时自动再跑一次 migrate，幂等）

7. 验证并报告：
   - `docker compose ps`（应全部 healthy）
   - `curl -fsS http://localhost:8081/healthz`（nginx）
   - `curl -fsS http://localhost:8081/api/health`（经反代到 server，期望 {"status":"ok","db":"ok","redis":"ok"}）
   - 记录：容器清单、访问 URL `http://<内网IP>:8081`、admin 账号提示（首次登录强制改密）

8. 输出一份简洁中文总结：每步结果、容器状态表、访问 URL、任何警告/失败与诊断建议。

【红线（必须遵守）】
- 只操作 /workspace 与本次创建的 hrms 相关资源（hrms_* 容器/镜像/网络）；**禁止触碰 wekan-*、httpd、crm、fitness 等任何现有服务**
- 不修改宿主 /opt/hrms 之外的文件；不启动任何非容器进程
- .env 密钥值：生成并写入，**绝不打印/回显/写入日志或报告**（报告只给键名 + "已生成"）
- 不执行 git push/pull/commit；不读取 ~/.ssh
- 任何一步失败：不静默跳过，如实报告错误输出 + 下一步建议

【结束】完成后停下，等进一步指示。
