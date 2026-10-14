# HRMS 运维手册（本机运行篇）

> 适用环境：`/opt/hrms` 所在生产/准生产主机（CentOS 7.9）
> 最近核对：2026-10-14（对应 commit `69dc5ec`）

---

## 一、总体概览

| 项 | 值 |
|---|---|
| 项目根目录 | `/opt/hrms`（git 仓库，远程 `git@github.com:fmmf3537/hrms.git`） |
| 操作系统 | CentOS Linux 7.9.2009 |
| 硬件 | 32G 内存（可用 ~25G）/ 3.7T 磁盘（已用 20%） |
| Docker | Docker Engine + Compose v2（插件形式，命令为 `docker compose`，**无** `docker-compose` v1） |
| 访问地址 | **http://192.168.9.99:8081**（`CLIENT_PORT=8081`，与 `CORS_ORIGIN` 一致） |
| 数据库 | PostgreSQL 16 + pgvector 扩展（66 张业务表） |
| 时区 | `Asia/Shanghai`（postgres 与 server 容器均已对齐，S-FIX2） |

**同机其他容器**（非 HRMS，运维时勿混淆）：`wekan-app`（8080 端口看板）、`wekan-db`（mongo）、`opencode`（已退出）。

---

## 二、架构与端口

```
浏览器 ──:8081──▶ hrms_client (nginx:alpine, hrms-client:1.0.0)
                      │  /api/* 反代到 server:3001
                      ▼
              hrms_server (Express+Prisma, hrms-server:1.0.0, 仅内网 3001)
                 │                    │
                 ▼                    ▼
        hrms_postgres            hrms_redis
        (pgvector:pg16,          (redis:7-alpine,
         127.0.0.1:5432)          127.0.0.1:6379)
```

| 容器 | 镜像 | 端口映射 | 说明 |
|---|---|---|---|
| hrms_client | `hrms-client:1.0.0` | `0.0.0.0:8081→80` | 唯一对外入口；nginx 反代 `/api/`→server、SPA fallback |
| hrms_server | `hrms-server:1.0.0` | 无外部映射（内网 3001） | 健康检查 `GET /api/health` 返回 `{status, uptime, db, redis}` |
| hrms_postgres | `pgvector/pgvector:pg16` | `127.0.0.1:5432→5432` | 数据卷 `hrms_postgres_data`；启动脚本 `01-pgvector.sql` 自动启用 vector 扩展 |
| hrms_redis | `redis:7-alpine` | `127.0.0.1:6379→6379` | 数据卷 `hrms_redis_data`；用于 BullMQ + JWT 黑名单 + 缓存 |

**数据卷**（`docker volume inspect` 可查实际路径 `/var/lib/docker/volumes/...`）：
- `hrms_postgres_data` — 数据库（**最重要，必须备份**）
- `hrms_redis_data` — 队列/缓存（可重建）
- `hrms_server_uploads` — 上传文件
- `hrms_server_logs` — 应用日志

**外部服务现状**：`LLM_PROVIDER` / `OCR_PROVIDER` / `SMS_PROVIDER` 均为 `mock`（AI/短信走模拟，接真实 SaaS 属二期）。

---

## 三、日常运维命令

所有命令在 `/opt/hrms` 下执行。

### 3.1 状态检查

```bash
docker ps --filter name=hrms          # 容器状态（4 个均应 healthy / Up）
docker compose ps                     # compose 视角
curl -s http://192.168.9.99:8081/api/health    # 期望 {"status":"ok",...,"db":"ok","redis":"ok"}
curl -s -o /dev/null -w '%{http_code}' http://192.168.9.99:8081/   # 期望 200
docker stats --no-stream              # 资源占用（历史常态：全系统 <400MB，CPU 近 0）
```

### 3.2 日志

```bash
docker logs -f hrms_server            # 应用日志（JSON，含请求/响应/耗时/安全头）
docker logs -f hrms_client            # nginx 访问日志
docker logs --since 1h hrms_server    # 最近 1 小时
docker compose logs -f server client  # 一键部署脚本末尾默认挂此日志
```

### 3.3 数据库操作

```bash
# 进入 psql
docker exec -it hrms_postgres psql -U postgres -d hrms

# 常用查询
docker exec hrms_postgres psql -U postgres -d hrms -c "select count(*) from information_schema.tables where table_schema='public';"
```

### 3.4 重启 / 启停

```bash
docker compose restart server         # 单服务重启（滚动修应用层问题）
docker compose restart                # 全量重启
docker compose stop && docker compose start
```

### 3.5 更新发布（发新版标准流程）

```bash
cd /opt/hrms
git pull                              # 拉取最新代码（部署密钥已具备写权限）
./deploy.sh                           # 一键：down → build（--no-cache）→ up -d → 健康检查 → 跟日志
```

> `deploy.sh` 会自动校验 `JWT_SECRET / JWT_REFRESH_SECRET / ENCRYPTION_KEY / DB_*` 必填项；
> 完整重建镜像约需数分钟（Vite 前端构建 + Prisma + pnpm 安装）。

---

## 四、配置说明（`.env`）

位置：`/opt/hrms/.env`（**不入 git，严禁外泄**）。当前关键值：

| 变量 | 当前值 | 说明 |
|---|---|---|
| `CLIENT_PORT` | `8081` | 前端对外端口 |
| `CORS_ORIGIN` | `http://192.168.9.99:8081` | 必须与浏览器访问地址完全一致，改了端口/域名要同步改 |
| `DB_USER/DB_NAME/DB_PORT` | `postgres / hrms / 5432` | 仅本机回环可达 |
| `JWT_EXPIRES_IN / JWT_REFRESH_EXPIRES_IN` | `15m / 7d` | access/refresh 有效期 |
| `ENCRYPTION_KEY` | 已设置 | AES-256-GCM 字段加密根密钥（**丢失=加密数据无法解密**） |

改 `.env` 后需 `docker compose up -d` 重建相关容器生效。

---

## 五、备份与恢复（当前为空白项，建议尽快落地）

**现状：本机无 crontab、无任何备份脚本**——数据库仅存在于 Docker 卷中，属单点风险。

### 5.1 建议的备份命令

```bash
# 每日数据库备份（建议加入 crontab：0 3 * * *）
docker exec hrms_postgres pg_dump -U postgres -d hrms -Fc -f /tmp/hrms.dump
docker cp hrms_postgres:/tmp/hrms.dump /opt/hrms-backup/hrms-$(date +%F).dump

# 上传文件备份
docker run --rm -v hrms_server_uploads:/data -v /opt/hrms-backup:/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

### 5.2 恢复

```bash
docker cp /opt/hrms-backup/hrms-XXXX.dump hrms_postgres:/tmp/restore.dump
docker exec hrms_postgres pg_restore -U postgres -d hrms --clean -v /tmp/restore.dump
```

> 备份目录建议挂载到宿主机独立磁盘或 rsync 到异机。

---

## 六、故障排查速查

| 现象 | 排查路径 |
|---|---|
| 页面打不开 | ① `docker ps` 看 client 是否 Up；② `curl http://192.168.9.99:8081/`；③ `docker logs hrms_client` |
| 登录 403 / CORS 报错 | 浏览器地址必须与 `.env` 的 `CORS_ORIGIN` 完全一致（含端口） |
| API 429 限流 | `apiLimiter` 为 1min/100 次/IP（压测/批量请求会触发，属设计行为） |
| 打卡/算薪日期差一天 | 检查容器时区：`docker exec hrms_server date`、`docker exec hrms_postgres date`，应为 CST |
| 服务起不来 | `docker compose ps` 看健康检查；`docker logs hrms_server`；常见为 DB 未 ready（depends_on 已设 healthy 条件，一般自愈） |
| 数据库连不上 | `docker exec hrms_postgres pg_isready -U postgres -d hrms`；`docker logs hrms_postgres` |
| 队列任务不跑 | 确认 `hrms_redis` 健康；BullMQ 调度函数见 AGENTS.md「M4 阶段暴露 8 个 BullMQ 待接入函数」 |

---

## 七、安全注意事项

1. **SSH 部署密钥**：`~/.ssh/id_hrms_deploy_write`（GitHub Deploy Key，已开写权限）用于 `git pull/push`；旧只读密钥 `id_hrms_deploy` 仍保留；旧 ssh 配置备份在 `~/.ssh/config.bak`。
2. **密钥文件**：`.env` 中 `JWT_SECRET / JWT_REFRESH_SECRET / ENCRYPTION_KEY` 泄露 = 全线失守，轮换需同步重启 server。
3. **网络**：postgres/redis 仅绑定 `127.0.0.1`；server 不对外；唯一入口 8081。当前为 HTTP 明文，**正式对外发布前应启用 HTTPS**（nginx 配置已预留 443 模板，见 `nginx-client.conf` 尾部注释）。
4. **上传文件**在 `hrms_server_uploads` 卷，nginx `client_max_body_size 10M`。
5. 本机以 root 运行 Docker，其他租户容器（wekan 等）与 HRMS 共享内核，注意资源隔离。

---

## 八、已知事项 / 遗留

- AI 能力（LLM/OCR）与短信均为 mock 模式。
- 8 个 BullMQ 调度函数（算薪生成/预警扫描/调薪执行等）已在代码层暴露，尚未接调度器——当前由手动触发或后续 M0.5 独立任务接入。
- 年终奖未在 12 月自动并入累计预扣（留二期）。
- 无监控告警（建议后续加容器/磁盘/健康检查巡检）。

---

*本手册基于 2026-10-14 实际环境核对生成；环境变更后请同步更新。*
