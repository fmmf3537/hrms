# M5-12：CentOS7 远程实例部署后全量功能测试报告

> **被测环境**：http://192.168.9.99:8081（公司内网 CentOS 7.9 + Docker 26，Docker Compose 部署 HRMS）
> **日期**：2026-09-03 ｜ **工具**：Playwright E2E（远程实例回归模式，commit `e7e33df`/`4887dee`）
> **测试账号**：admin（测试口令，测试后已提示改回强口令）

---

## 一、结果总览

| # | 用例 | 结果 | 说明 |
|---|---|---|---|
| 01 | 登录 → 主布局 → 退出 | ✅ PASS | 远程 UI 登录链路 |
| 02 | GPS 打卡 → 列表新记录 | ⏭ **SKIP** | **环境限制**：内网 http（非 https/localhost）浏览器禁用 Geolocation；https 后可测 |
| 03 | 请假申请 → 提交 → 列表可见·已提交 | ✅ PASS | 提交 2xx + 状态机正确 |
| 03b | 请假列表页可访问渲染 | ✅ PASS | |
| 04 | 算薪全链路（发起→draft→locked + 工资单可见） | ✅ PASS | seed 前置补全后通过 |
| 05 | 绩效 周期/指标/方案 创建 | ✅ PASS | UI 全链路 |

**结论：5 PASS / 1 SKIP / 0 FAIL（功能层面 5 条主流程在远程实例上全部可用）**

## 二、过程中发现与处理

| 现象 | 定性 | 处理 |
|---|---|---|
| 04 算薪 400/73408「无生效薪酬方案」 | **部署问题**：远程库 seed 不完整（seed 在 M3-D3 段崩溃，C1 薪酬段未执行） | 服务器补跑 `m5-09-config-fixes.mjs`（ensure 5 员工 plan/reg/finalGrade）→ 04 通过 |
| 03 列表找不到提交行 | 测试脆弱断言（按日期匹配，@db.Date 时区截断在不同部署时区表现不同） | spec 改为按「类型+状态」匹配（提交链路本身正常，API 层复核通过） |
| 02 GPS 超时 | **环境固有限制**：http 非安全上下文无 Geolocation（非功能缺陷） | spec 增加 URL 安全上下文判定 → http 远程自动 skip（https/localhost 照常可测） |
| 登录偶发 429 | 测试连跑 + 手动探测触发 loginLimiter（5min/10 次） | 等待窗口后单次完整跑通过（限流按设计工作） |
| E2E 依赖的 admin 口令被 seed 重置 | seed 幂等 update 会把 admin 重置回默认口令 | 通过登录-改密 API 置为测试口令（说明见遗留项 1） |

**服务端功能确认**（E2E 之外的手工/API 复核均正常）：
- 健康检查 db/redis ok；页面/API 经 nginx 反代正常
- 请假提交 201 + 列表查询（多条件）正常
- admin 登录（含 mustChangePassword 首次改密流程）正常

## 三、遗留项（建议跟进，不阻塞本次验收）

1. **seed 的 D3 demo 存在性检查过窄 bug**（seed.ts M3-D3 段：`d3Exists` 按 finalScore=95 判断，重复跑 seed 时同 (employee, cycle) 撞唯一约束崩溃，导致 C1 段后永不执行）→ 建议修复后回推（本地改 + git pull），届时 seed 可完整重跑。
2. **服务器 server 容器未设 TZ**（当前 UTC）：建议 compose `server` 服务加 `TZ=Asia/Shanghai`（与 postgres 一致）后重建，保证审计/日期逻辑按北京时间。
3. **admin 当前为测试口令 Admin@2026**：试运行正式使用前请改回强口令。
4. **E2E 测试数据残留**（远程库）：
   - 请假数条（reason `E2E-事假-*`）
   - 绩效 周期/指标/方案（code `E2EC*/E2EI*/E2ES*` 前缀）
   - 算薪 payroll run 一条（E2E 期间期间，已 locked）及对应 payslips
   - 导入真实数据前如需清理：
     ```sql
     -- 在 hrms_postgres 执行（按需）
     DELETE FROM leave_requests WHERE reason LIKE 'E2E-%';
     DELETE FROM performance_cycles WHERE code LIKE 'E2EC%';
     -- 绩效指标/方案/结算若引用 cycle 需按顺序清理
     -- payroll：先删 payslips 再删 run（status=locked 直接 SQL 清理即可，测试产物）
     ```
5. **02 GPS 待补测**：上 https（或 localhost 场景）后重跑该用例即可覆盖打卡 GPS 链路。

## 四、可复用资产（本任务产出）

- `playwright.config.ts` / `e2e/helpers.ts`：**E2E 远程实例回归模式**（`E2E_REMOTE=1` + `E2E_CLIENT_BASE`/`E2E_API_BASE`/`E2E_ADMIN_PASSWORD` env），后续云上/其它实例回归直接用
- `e2e/specs/02`：安全上下文 URL 判定自动 skip（环境限制不误报失败）
- `e2e/specs/03`：按类型+状态断言（跨部署时区稳健）
