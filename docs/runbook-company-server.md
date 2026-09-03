# HRMS 公司自建服务器上线 Runbook（M5-11）

> 适用范围：**公司自有服务器（不上云）**。配套：`docker-compose.yml` / `deploy.sh` /
> `server/scripts/backup/backup-db.sh` / `.env.production`。
> 关联：V1.2 §6 运维与交付、docs/operations.md（成本/数据 SOP/Bug SLA）。

---

## 0. 前置（一次性）

| 项 | 说明 |
|---|---|
| OS | Ubuntu 22.04+ / 同系 Linux，x86_64；已装 Docker Engine + compose v2 |
| 时间 | `timedatectl set-timezone Asia/Shanghai` + NTP（否则 JWT/审计时间戳错乱） |
| 域名/网络 | 内网可只 http；公网访问需域名 + 443（Let's Encrypt 或云证书） |
| 端口 | 预检 80/443/5432/6379/3001 未被占用（与既有系统协调） |
| 目录 | `/opt/hrms`（代码 + compose + server/uploads + server/logs 卷） |
| git 凭据 | 服务器上配置可拉取私有仓库的 SSH key / token |

---

## 1. 初始化部署（首次）

```bash
# 1) 拉代码
sudo mkdir -p /opt/hrms && sudo chown -R $USER /opt/hrms
cd /opt/hrms && git clone <repo> . && git checkout <v1.0.0 tag>

# 2) 生成并填写生产密钥（见 §2 配置）
#    cp .env.production .env && vi .env   ← 只在此改，不进 git

# 3) 启动 DB/Redis → 等健康 → 首次迁移 + seed
docker compose up -d postgres redis
docker compose run --rm server npx prisma migrate deploy
docker compose run --rm server pnpm --filter hrms-server db:seed   # 建 admin/system + 全部 configs
docker compose ps                                                      # postgres/redis healthy

# 4) 构建镜像并全量起
docker compose build
docker compose up -d

# 5) 健康检查 + seed 账号改密
curl http://localhost:3001/api/health          # {"status":"ok","db":"ok","redis":"ok"}
#   首次登录 admin（默认口令见 seed 说明）→ 强制改密
```

> 镜像 tag：`deploy.sh` 支持 `IMAGE_TAG`（默认 1.0.0）。**上线打 tag 发布**（见 §4 回滚）。

## 2. 生产配置要点（.env）

| 键 | 要求 |
|---|---|
| `ENCRYPTION_KEY` | **64 位 hex（32B）**：`openssl rand -hex 32`；一旦启用不可改（改=无法解密存量） |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | ≥32 字符随机：`openssl rand -base64 48` |
| `CORS_ORIGIN` | 前端真实来源（http(s)://<域名或IP>），多个用逗号 |
| `LLM/OCR/SMS_*` | 接真实服务填 key；先 mock 上线则保持 `mock`（AI 功能降级） |
| `LOG_FILE` | 设 `/app/server/logs/app.log`（compose 已挂 `server_logs` 卷） |

> 校验工具：`pnpm --filter hrms-server exec tsx scripts/ops/ensure-production-env.mjs --check`（在 server/ 下执行）。

## 3. 日常发布（增量）

```bash
cd /opt/hrms
git fetch && git checkout <新tag>          # 或 deploy.sh 内 git pull 分支
docker compose build server client          # 只重建变更镜像
# DB 变更时：
docker compose run --rm server npx prisma migrate deploy
docker compose up -d                        # 滚动/重建受影响服务
curl -f http://localhost:3001/api/health && curl -f http://localhost/    # 双健康检查
```

## 4. 备份与恢复（V1.2 §6.3：RPO≤1h / RTO≤4h）

```bash
# —— 备份（crontab）——
# 每日 03:00 全量（DB+uploads），保留 30 天
0 3 * * * /opt/hrms/server/scripts/backup/backup-db.sh >> /var/log/hrms-backup.log 2>&1
# 每小时增量档（小库全量即增量），保留 48 小时 → RPO≈1h
0 * * * * /opt/hrms/server/scripts/backup/backup-db.sh --hourly >> /var/log/hrms-backup.log 2>&1

# —— 恢复演练（每季度，验证 RTO）——
docker compose stop server
gunzip -c /var/backups/hrms/daily/hrms-<最新>.sql.gz | docker exec -i hrms_postgres psql -U postgres -d hrms
docker compose start server
curl -f http://localhost:3001/api/health
# 恢复完成后建议立即再做一次全量备份（基线对齐）

# 建议：备份目录每日同步到公司备份盘/NAS（异地副本，防单机磁盘故障）
```

## 5. 回滚

| 场景 | 动作 |
|---|---|
| 代码回滚 | `git checkout <上个 tag>` → `docker compose build && docker compose up -d`（DB 无迁移则秒回） |
| 已跑 DB 迁移的代码回滚 | 先用 §4 恢复迁移前 dump，再回代码（migrate 不做向下回退） |
| 数据损坏 | §4 全量/小时档恢复（≤1h 丢失窗口） |

## 6. 上线前 Checklist（M5-08 前置）

- [ ] staging 同机双栈（或本机）全量回归：`pnpm lint / type-check / test`、E2E 指向 staging、压测复跑
- [ ] `.env` 密钥全部真值且经 `ensure-production-env.mjs --check`
- [ ] 真实 40 人数据导入（M5-03 工具）完成，敏感演示数据清理
- [ ] 压测 `perf_0001..0100` 账号删除
- [ ] `system` 用户 + `salary.scheduler.*` configs 已在库（seed 后核对）
- [ ] 备份 crontab 已装 + 一次恢复演练通过（RTO 实测）
- [ ] 监控接入（服务器资源 + 应用日志）与告警通道（群机器人）就绪
- [ ] Bug SLA / 值班联系人（operations.md §三）公布

## 7. 健康与监控提示

- 应用日志：`docker compose logs -f server`（JSON）；落盘文件在 `server/logs`（LOG_FILE 开启时）
- 资源：`docker stats` / 自建 node_exporter + Prometheus + Grafana（或复用公司监控）
- 数据库：`docker exec hrms_postgres pg_stat_activity`（连接数/慢查询线索）
- Redis：`docker exec hrms_redis redis-cli info`（memory / connected_clients）

---
**— 文档结束 —**
