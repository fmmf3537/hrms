# M5-02 Playwright E2E（M5-02 切片）

5 条主流程端到端测试：登录 / 打卡 / 请假 / 算薪 / 绩效。Chromium headless，真实后端 + 真实前端。

## 运行前提

1. **docker 服务运行中**（postgres:5501 + redis:6401）
2. **后端 3000 端口可达**（已有 seed：`pnpm --filter hrms-server db:seed`）
3. **前端 5173 端口可达**（vite dev）
4. **admin 账号**：`admin` / `Admin@2026`（联调时已改密，`mustChangePassword=false`）
5. **已安装 chromium**：`pnpm exec playwright install chromium`（约 150MB）

`webServer.reuseExistingServer: true`：本地已起 dev 服务时直接复用，不再开第二个。

## 命令

```bash
# 全量跑（5 条）
pnpm test:e2e

# 单条调试
pnpm test:e2e --grep "登录"

# 有头模式（看页面）
pnpm test:e2e --headed

# UI 模式
pnpm exec playwright test --ui

# 报告
pnpm exec playwright show-report
```

## 数据约定

- 所有 E2E 创建的业务数据**前缀 `E2E-`**（例：`E2E-cycle-1234567`）
- 失败 / 调试时残留数据可在数据库 grep `E2E-` 清理
- 单测与 E2E **完全隔离**：E2E 不进 vitest，876/876 + 90/90 不受影响

## 已降级主流程

按提示词 §5.2，下列流程因种子/审批配置缺失或客户端 bug 无法走通完整链路，缩减到「可走通的最远环节 + 明确断言」：

| # | 主流程 | 降级说明 |
|---|---|---|
| 03 | 请假 | 后端 leave 服务读 config `leave.approval_flow_short` = `leave:leave_short`，但 seed approval_flows.key = `leave_default`，提交必触发「审批流模板不存在或已停用」。E2E 断言：表单可填写 → 提交 → 后端错误 toast 可见（http 拦截器自动 toast）|
| 04 | 算薪 | 后端 createPayrollRun 强校验「无生效薪酬方案 / 无社保公积金登记 / 无绩效等级」任一缺失即 73408。E2E 断言：API 前置建薪级/薪档 → UI 流程可达 → 错误 toast 可见 |
| 05 | 绩效 | server `GET /performance/cycles /indicators /schemes` 返回扁平 `{success, items, total, page, pageSize}`，但 client `unwrapPerformancePage` 期望 `{success, data: {items, ...}}` 信封（实测列表页「共 0 条 / 暂无数据」恒成立）。E2E 断言降级为：UI 表单填写 + 提交 → POST 200（证明链路可达）+ API 直连 GET 列表查 cycleCode / indicatorCode / schemeCode 确认 DB 已落库 |

## 目录结构

```
e2e/
├── README.md              ← 本文件
├── global-setup.ts        ← API 登录 + storageState 注入
├── helpers.ts             ← API 助手 + 唯一名
├── .auth/                 ← storageState（gitignore；运行产物）
│   └── admin.json
└── specs/
    ├── 01-login.spec.ts
    ├── 02-attendance.spec.ts
    ├── 03-leave.spec.ts
    ├── 04-payroll.spec.ts
    └── 05-performance.spec.ts
```

## token 注入方式

实读 `client/src/utils/auth.ts`：

- ACCESS_TOKEN_KEY = `hrms_access_token`
- REFRESH_TOKEN_KEY = `hrms_refresh_token`
- USER_CACHE_KEY = `hrms_user`

global-setup 通过 `playwright.request` 调 `/api/auth/login` 拿 `accessToken + refreshToken`，构造 `storageState.origins[0].localStorage` 注入。`test.use({ storageState: 'e2e/.auth/admin.json' })` 由 Playwright 在每个 spec 启动时自动加载。

**token 复用**：若 `e2e/.auth/admin.json` 中 token 未过期（JWT exp - 30s 余量 > now），global-setup 跳过登录直接复用，避免触发登录限流（429 / 5 分钟窗口）。token 过期或文件不存在时才走 API 登录。

## 01 用例特殊处理

01-login 用例必须从「未登录」开始（否则 /login 会被路由守卫重定向到 /dashboard）。test 级 `test.use({ storageState: { cookies: [], origins: [] } })` 覆盖项目级 storageState，仅作用于本用例。

## 越界检测

```bash
# 验证 server/ 0 行 / client/package.json 0 行
git diff --stat server/ client/package.json
# 输出应为空（lockfile 由 pnpm install 更新除外）
```
