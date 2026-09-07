# S-FIX3 服务器侧应用 TZ/seed 修复（git pull + 重建 server + 验证）— 执行提示词

## ⚠️ 强约束（最优先阅读）

1. **运维切片，不改任何代码/配置**：本切片**只执行 shell 命令**，不得修改、创建、删除任何源码/配置文件/docker compose / `.env` / git 引用。
2. **工作区**：`/opt/hrms`（HRMS 仓库根，git clone 自 github，部署 deploy key 已配置）。
3. **必须步骤**（按顺序，不要跳）：
   - 步骤 ① git pull（拉本仓库 main 的最新提交）
   - 步骤 ② `docker compose up -d server`（重建 server 容器使 TZ 生效）
   - 步骤 ③ `docker exec hrms_server date` 验证时区（期望 `CST`/`+0800` 等亚洲北京时间字符串）
4. **禁止**：
   - 不要 `git commit` / `git push`（本次无代码改动提交）
   - 不要 `docker compose down` 或重启 postgres/redis（破坏线上）
   - 不要 `prisma migrate` / `pnpm db:seed`（**不在本次范围**，避免对正在运行的数据做修改）
   - 不要修改 compose / Dockerfile / .env / 任何文件
5. **headless 无人工确认**：先输出执行计划（3 步），然后逐步执行并捕获输出，最终给出完整报告。
6. 如遇错误不要重试或乱猜：把错误原文贴进报告，停下等指令。

---

## 1. 任务 ID + 目标

### 1.1 任务 ID
**S-FIX3 · 服务器侧应用 S-FIX1/S-FIX2 修复（git pull + 重建 server + 时区验证）**

### 1.2 目标
把本仓库 `main` 分支已 commit 的两个修复（**S-FIX1 seed M3-D3 demo P2002 修复** / **S-FIX2 server 容器 TZ=Asia/Shanghai**）同步到公司内网 CentOS7 服务器，并重建 server 容器使 TZ 修复立即生效；输出三步执行结果与时区验证结论。

---

## 2. 上下文

### 2.1 工作区
```
/opt/hrms/   （git 仓库根，已用 deploy key clone 出 github.com:fmmf3537/hrms.git）
当前 main 已含但**未拉取**的提交：
- 1648606 S-FIX1: seed M3-D3 demo 改为逐员工 ensure，消除 P2002
- 54e50ed S-FIX2: server 容器时区对齐 TZ=Asia/Shanghai
- 57c9b0e S-FIX2 切片提示词
- 55469c6 S-FIX1 切片提示词
- 582107b 之前 M5-12 远程 E2E 测试报告
- 等等（main 上的所有新 commit 一起拉）
```

### 2.2 已核实事实（可直接采信）

| 事实 | 证据 |
|---|---|
| 仓库当前 main 含 S-FIX1 + S-FIX2（commit 1648606 / 54e50ed 等） | DSH 本地 git log 已确认 |
| 服务器 `/opt/hrms` 是 clone 自 github（SSH + deploy key） | 之前 git ls-remote / git clone 成功 |
| `docker compose` 命令在该服务器可用（docker 26.1.4 + compose v5.5.1） | 之前探测确认 |
| HRMS compose 容器：`hrms_postgres` / `hrms_redis` / `hrms_server` / `hrms_client`（已跑） | 之前 docker ps 确认 |
| server 容器当前 TZ=UTC（修复后应为 Asia/Shanghai） | 之前 issue 记录 |
| S-FIX2 修复是 compose environment 增加 `TZ: Asia/Shanghai`，需重建 server 容器生效（环境变量只在容器启动时读取） | docker compose 行为 |
| S-FIX1 改的是 `server/prisma/seed.ts`，**不影响当前运行**（server 不会自动 seed；只有手动跑 `pnpm db:seed` 或新库首 seed 才用）——本切片**不**验证 S-FIX1，仅拉取生效为后续手动 seed 准备好 | 工程事实 |

### 2.3 期望结果
- `git pull` exit 0；输出显示拉到了 S-FIX1/S-FIX2 系列 commit
- `docker compose up -d server` exit 0；server 容器被**重新创建**（容器 ID 变化表示真重建；不变可能仅重启）
- `docker exec hrms_server date` 输出含 `CST` 或 `+0800` 或 `Asia/Shanghai` 字样（中国时间）

---

## 3. 必读约束

### 3.1 反直觉点
- **`docker compose up -d server` 在 compose 中实际效果是 recreate 而非 start**（因为 docker-compose.yml 已变：server.environment 新增 TZ；compose 检测到 env 变化 → recreate 容器）——所以你会看到 server 容器 ID 变化，这是正确的。
- **S-FIX1（seed.ts 改动）不在本切片验证范围**——它只在你下次手动跑 `pnpm db:seed` 时生效；当前服务器数据不需要重新 seed。
- **不要动 postgres/redis 容器**——线上数据，切勿触发迁移/删除。

### 3.2 禁止操作
- 一切写操作（commit/push/文件修改/容器删除）
- `prisma migrate`、`db:seed`、`docker compose down`、`docker system prune`

---

## 4. 实施任务（逐步）

按顺序执行 3 步，每步捕获 stdout+stderr 与 exit code：

### 步骤 ① 拉取最新代码
```bash
cd /opt/hrms && git status -sb && git pull
```
**期望**：`git status` clean 或 ahead/behind=0；`git pull` exit 0，输出 `Fast-forward`/`Already up to date`/`X files changed, Y insertions` 等；列出最近几个 commit（应含 S-FIX1 / S-FIX2）。
**异常**：网络/密钥/syntax — 把完整输出贴报告，停下。

### 步骤 ② 重建 server 容器（TZ 修复生效）
```bash
cd /opt/hrms && docker compose up -d server
```
**期望**：exit 0；可能打印 `Container hrms_server  Started`（或 recreated）；可加 `docker compose ps | grep hrms_server` 确认 `Up` + 健康检查通过（`Status` 含 `healthy`）。
**异常**：若 `docker-compose.yml` 拉取/构建失败或 server 启动后 healthcheck 不通过，截图完整错误停下。

### 步骤 ③ 验证 TZ（北京时间生效）
```bash
docker exec hrms_server date
# 同时验证 Node 也读到了 TZ（Node new Date().toString() 会含时区）
docker exec hrms_server node -e "console.log(new Date().toString())"
```
**期望**：`date` 输出含 `CST` / `+0800` / `Asia/Shanghai` 字样的北京时间字符串；`node new Date()` 也输出 CST/中国时间。
**异常**：若仍是 UTC（`UTC`/`+0000`），说明 TZ 未生效（容器未真正重建，或 docker-compose.yml 未拉到），把输出贴报告。

---

## 5. 关键决策点

- 顺序执行，不要并行——git pull 失败要先停，避免在旧代码上重建容器。
- 每步失败立即停并报告，不要继续往下做（防止半生不熟状态）。
- 验证步骤 ③ 必须看 Node 的输出（不只 OS date）——确认应用进程读到了北京时间。

---

## 6. 修改文件清单

### 6.1 必改文件
- **无**（纯运维切片，不改任何文件）

### 6.2 禁止修改文件
- **一切文件**（不得 git commit、不得改源码/compose/.env）

### 6.3 越界自检
```bash
# 最后做一次自检：除 git pull 导致的 working tree 变化（不应有），应该仍 clean
cd /opt/hrms && git status -sb
# 期望：clean（无 M/A/D ??）
```

---

## 7. 验收标准

### 7.1 硬性验收（你执行并逐项汇报）
| 步骤 | 通过标准 |
|---|---|
| ① `git pull` | exit 0，输出含 S-FIX1/S-FIX2 相关 commit |
| ② `docker compose up -d server` | exit 0，server 容器被 recreate |
| ③ `docker exec hrms_server date` | 输出含 `CST` / `+0800` / `Asia/Shanghai` |
| ③ `docker exec hrms_server node -e "console.log(new Date().toString())"` | 输出含 `China Standard Time`/`GMT+0800` 等亚洲时区 |
| 越界自检 `git status -sb` | clean（仅有 untracked skills/、.env 等无关文件；无 M/A） |

### 7.2 交付报告模板（最终回复按顺序贴 5 项）

```
## S-FIX3 交付报告（服务器侧应用）

### 1. 步骤 ① 输出（git pull + git status -sb）
（粘贴 stdout+stderr）
### 2. 步骤 ② 输出（docker compose up -d server + ps 状态）
（粘贴输出）
### 3. 步骤 ③ 输出（date + node 时间）
（粘贴输出，重点高亮含 CST/+0800 的行）
### 4. 越界自检（git status -sb 最终状态）
（粘贴）
### 5. 结论
- TZ 修复是否生效：✅/❌
- S-FIX1 已拉取但**未生效**（待后续手动 seed 验证）—— 备注
- 是否需要重试或后续操作：…
```

---

按本提示词直接执行（headless 无人工确认）：先输出 3 步执行计划，然后逐步执行并捕获输出，最终回复给出完整交付报告。
