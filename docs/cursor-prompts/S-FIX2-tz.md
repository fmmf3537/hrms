# S-FIX2 server 容器时区对齐（TZ=Asia/Shanghai）— 执行提示词

## ⚠️ 强约束（最优先阅读）

1. **纯配置单文件切片**：只允许修改 `docker-compose.yml` 的 **server 服务 environment 段**（约 57-79 行内追加一行）。
   **禁止修改任何其它文件/任何其它行**（postgres/redis/client 段、volumes、Dockerfile.*、nginx 配置一律不动）。
2. **最小 diff**：仅新增一行 `TZ: Asia/Shanghai`（含一行中文注释说明原因），不动其它键值。
3. **禁止**：改镜像/端口/卷/健康检查；加服务；动 .env 引用。
4. **不跑验收命令**（`docker compose config` 等由审核方执行）——你只改 YAML。
5. **headless 无人工确认**：先输出实施计划（一两句），然后动手；最终回复交付报告（§7.2）。

---

## 1. 任务 ID + 目标

### 1.1 任务 ID
**S-FIX2 · server 容器时区对齐**

### 1.2 目标
让 `docker-compose.yml` 中 **server 服务**的容器时区与 postgres 一致（`Asia/Shanghai`），
消除 Node 进程按 UTC 处理日期导致的跨日错位（审计时间、算薪/考勤日期边界、调度任务触发日等）。

---

## 2. 上下文

### 2.1 项目位置
`D:\projects\hrms`，目标文件 `docker-compose.yml`（130 行）

### 2.2 关键已核实事实（起草人已实读，可直接采信）

| 事实 | 证据 |
|---|---|
| postgres 服务已设 `TZ: Asia/Shanghai` | docker-compose.yml 第 18 行（environment 内） |
| server 服务（container `hrms_server`，node:20-alpine）**没有 TZ** | 第 57-79 行 environment 段无 TZ 键 |
| server 是唯一跑业务代码（Express/Prisma/BullMQ）的容器，日期逻辑（`new Date()`、startOfDay、@db.Date 截断、审计时间戳、每日/每月调度触发）按容器本地时区 | M5-12 远程部署实测：server 容器 UTC 导致与 postgres(北京时间)跨日错位（如请假日期 ±1 天问题） |
| node:20-alpine（musl）尊重 `TZ` 环境变量 | 常规事实 |
| 只改 server 足够：client(nginx 静态) 不涉日期；redis 不涉应用日期 | — |

### 2.3 期望行为
server 容器内 `date` 输出北京时间；应用日期边界（当天/本月）与 postgres `Asia/Shanghai` 对齐。

---

## 3. 必读约束

### 3.1 反直觉点
- **不是 .env 变量**：TZ 直接写死 `Asia/Shanghai`（与 postgres 一致、公司统一东八区），不走配置中心/环境注入。
- **位置要对**：只加到 `server` 服务的 `environment:` 下（对齐现有缩进，`TZ: Asia/Shanghai`），不要加到顶层或其它服务。

### 3.2 禁止修改
- 除 6.1 外一切文件/行（尤其 postgres/redis/client 段与注释之外的内容）

### 3.3 风格
- YAML 2 空格缩进；注释用中文；保持该文件既有注释风格（中文注释通常在行后或键上方）

---

## 4. 实施任务（逐文件）

**仅 `docker-compose.yml`，server.environment 段追加一行**：

```yaml
    environment:
      DATABASE_URL: ...
      REDIS_URL: ...
      JWT_SECRET: ${JWT_SECRET:?JWT_SECRET is required}
      ...
      # S-FIX2: 与 postgres 时区对齐（北京时间）——算薪/考勤/审计日期边界依赖容器本地时区
      TZ: Asia/Shanghai
```

要求：
- 追加在 server.environment 键组内任意合理位置（建议靠近文件末尾的其它 environment 键附近或紧随其后，保持字典可读）
- 不重复添加；若已存在 TZ 键则不动（以 grep 为准）
- 保持 YAML 语法正确（缩进对齐 environment 下其它键）

---

## 5. 关键决策点

- **只加 server**：client（nginx）与 redis 无应用日期逻辑，postgres 已有时区——最小改动达成对齐。
- 否决：给 client/redis 也加（无必要，扩大 diff）；改用 .env 注入（配置漂移，得不偿失）。

---

## 6. 修改文件清单

### 6.1 必改文件
| # | 文件 | 操作 | 职责 |
|---|---|---|---|
| 1 | `docker-compose.yml` | 修改（server.environment 加 1 行 TZ） | server 容器时区对齐北京时间 |

### 6.2 禁止修改文件
- 除 6.1 外一切文件；docker-compose.yml 除该新增行外的任何既有行

### 6.3 越界自检命令（你运行并粘贴输出）
```bash
git diff --stat        # 期望：仅 docker-compose.yml，+1/-0
git diff docker-compose.yml   # 期望：仅 1 行新增（+注释行可 2 行）
```

---

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑）
| 验收项 | 方式 | 通过标准 |
|---|---|---|
| 越界 | `git diff --stat` | 仅 docker-compose.yml |
| YAML 语法 | `docker compose config --quiet`（本机 docker 可用） | exit 0，无解析错误 |
| TZ 生效说明 | 报告注明「服务器生效步骤」 | `git pull` 后 `docker compose up -d server` 重建即可生效 |

### 7.2 交付报告模板（最终回复按 8 项）

```
## S-FIX2 交付报告
### 1. 修改文件清单（含行号）
### 2. 改了什么（before → after 片段）
### 3. 越界自检结果（§6.3 输出）
### 4. 未触碰项确认（未动其它服务/卷/端口/镜像/.env/Dockerfile/nginx）
### 5. 逻辑说明（为何加 TZ 能解决跨日错位；生效机制）
### 6. 潜在风险（如有；无写「无」）
### 7. 自测情况（未跑 docker compose config——按约束；如做了 YAML 自查请说明）
### 8. 已知问题与后续建议（含服务器生效步骤）
```

---

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手，最终回复给出完整交付报告。
