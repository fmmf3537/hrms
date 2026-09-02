# M5-05: 并发压测 | HRMS | 2026-09-02

> **M5-05 切片交付**：Artillery 压测框架，5 个核心 GET 端点 × 100 VU 混合场景。
> **性质**：测试基建型切片，**本切片破例授权修改根 `package.json` + `.gitignore`**（见 §修改文件清单）。

## 1. 目的

验证 PRD §8.1 性能指标中两项可 HTTP 验证项：

| 指标 | 达标线 | 本切片验证 |
|---|---|---|
| 并发用户 ≥100 | 100 VU 持续 2 分钟，错误率 < 1% | ✅ |
| 核心页面响应 <2s | 各场景 p95 延迟 < 2000ms | ✅ |
| 月度算薪 200 人 <30s | 算薪性能项 | ❌ 见 §5 已知限制 |

## 2. 运行前提

- **后端**：`http://localhost:3000`（docker postgres:5501 + redis:6401 已起；dev server 由 `scripts/start-dev-server.cmd` 维持）
- **账号**：`admin` / `Admin@2026`（mustChangePassword 已清除）
- **Node**：≥18（使用全局 `fetch`，不引依赖）
- **首次运行**：`pnpm install`（安装根 devDep `artillery@2.0.34`）

## 3. 使用方法

```bash
# 一次命令：auth-setup → artillery run
pnpm test:load

# 分步：先生成/复用 token + 再压测
node loadtest/auth-setup.mjs
pnpm exec artillery run loadtest/load-test.yml

# 输出 json 报告（可选）
pnpm exec artillery run loadtest/load-test.yml \
  --output loadtest/reports/report-$(date +%Y%m%d-%H%M%S).json

# json → html（可选）
pnpm exec artillery report loadtest/reports/report-XXX.json
```

## 4. 场景设计

### 4.1 端点清单（实读 `server/src/routes/` + 实测 200 确认）

| # | 路径 | 方法 | 权限点 | 响应结构 |
|---|---|---|---|---|
| 1 | `/api/employees` | GET | `EMPLOYEE_READ` | `{success, data:[], total, page, pageSize}` |
| 2 | `/api/attendance/records` | GET | `ATTENDANCE_READ` | `{success, data:[], total, page, pageSize}` |
| 3 | `/api/leaves/requests` | GET | `LEAVE_READ` | `{success, data:[], total, page, pageSize}` |
| 4 | `/api/salary/payrolls/runs` | GET | `SALARY_PAYROLL_RUN_READ` | `{success, data:{items, total, page, pageSize}}` |
| 5 | `/api/performance/cycles` | GET | `PERFORMANCE_CYCLE_READ` | `{success, items, total, page, pageSize}` |

admin 角色 `permissions=["*"]` 全部放行，不会因权限失败。

### 4.2 权重与理由

`30 / 20 / 20 / 15 / 15` —— 反映 HRMS 真实访问频次：

- **员工列表 30%**：HR 日常最高频（入职 / 转正 / 离职 / 调动都从员工列表发起）
- **考勤 + 请假 各 20%**：日常并列（班次关联 + 假期审批）
- **算薪 + 绩效 各 15%**：月末 / 季末 / 年末峰值，平时低频

### 4.3 阶段设计（总约 4 分钟）

| 阶段 | 时长 | 速率 | 用途 |
|---|---|---|---|
| warm-up | 30s | 5 VU | 预热 JIT / DB pool |
| ramp-up | 60s | 5→100 VU | 平滑爬坡，避开突发拥塞 |
| **sustain-100VU** | **120s** | **100 VU** | **达标线判定** |
| cool-down | 30s | 100→0 VU | 平滑收尾，避免关停时 5xx |

### 4.4 断言

每个场景：HTTP 200 + 响应 JSON 包含 `success: true`。未通过断言 → 该请求计入失败，但不阻断场景（artillery 持续打满 100 VU 直到阶段结束）。

## 5. 已知限制

1. **登录接口不压**：`POST /api/auth/login` 有 `loginLimiter`（短时多次 → 429）。本切片用 `auth-setup.mjs` 前置拿 token，压测全程不再碰登录。
2. **JWT 15 分钟过期**：超过 15 分钟后压测会 401。复用 `auth-setup.mjs` 的"过期前 30s 复用 + 过期重新登录"逻辑：删 `loadtest/.auth/admin-token.json` 或等 token 失效后重跑。
3. **算薪性能项待 M5-07**：当前库仅 5 名 seed 员工 + 无完整薪酬档案，`POST /api/salary/payrolls/runs` 必报 `73408`（档案缺失）。本切片仅测 `GET /api/salary/payrolls/runs` 列表读取。算写性能由 M5-07 并行核算期验证。
4. **dev 模式与生产差异**：dev server 用 `tsx watch` 单进程；生产为 `node dist/server.js` + 4 worker cluster。压测数字反映 dev 模式基线，生产预期更优（待 M5-08 压测复测）。

## 6. 数据卫生

- **只读场景**：5 个端点全是 GET，理论上**不产生业务数据残留**
- 若调试需写操作（**不建议**），数据前缀必须为 `LOAD-`，并在交付报告中列残留清单与清理 SQL

## 8. 修改文件清单

| # | 路径 | 性质 |
|---|---|---|
| 1 | `package.json`（根） | **授权修改**：+ `artillery@2.0.34` devDep + `test:load` script |
| 2 | `.gitignore` | + 3 行（`loadtest/reports/` / `.auth/` / `tmp/`） |
| 3 | `loadtest/auth-setup.mjs` | 新增 |
| 4 | `loadtest/load-test.yml` | 新增 |
| 5 | `loadtest/processor.mjs` | 新增 |
| 6 | `loadtest/README.md` | 新增（本文件） |
| 7 | `pnpm-lock.yaml` | 仅依赖安装自动更新（**禁止手编**） |

## 9. 红线自检

- `server/**` 0 行改动
- `client/**` 0 行改动
- `e2e/**` 0 行改动
- 不 `git add / commit`（由 M5-05 切片持有）
- 未触碰既有 vitest 876 / client 90 / playwright 6