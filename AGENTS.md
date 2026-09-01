# AGENTS.md - HRMS 项目 AI Coding 上下文

## 项目简介

西安辰航卓越科技有限公司员工管理系统（HRMS），一期覆盖组织人事/考勤/薪酬/绩效。

## 技术栈

- pnpm monorepo：client (Vue3) / server (Express+Prisma+PG) / mobile (留空)
- 认证：JWT (access 15min + refresh 7d，已升级 rotation + reuse 检测)
- 权限：RBAC（Role.permissions JSON 数组，5 角色 × 权限点含 M0.5）
- 数据库：PostgreSQL 15+（**锁定，不预留多数据库迁移**，详见 V1.2 §三.1）
- 缓存/队列：Redis + BullMQ
- 字段加密：M0.5-3 AES-256-GCM（含第三方 integration.config）
- 配置中心：M0.5-6 `configs` + `configService`（effective_from/to 版本回溯）
- 移动端：H5 一期 → 小程序/App 二期
- AI 能力（M0.5-5）：LLM 网关（OpenAI 兼容）+ pgvector + OCR（**已落地**，见 `server/src/services/ai/`）

## 命名规范

- 数据库表：snake_case 复数（employees / departments）
- Prisma model：PascalCase 单数（Employee / Department）
- TS 类型：PascalCase
- API 路径：/api/<module>/<resource>，kebab-case
- Vue 组件：PascalCase
- 文件：kebab-case
- **代码范式**：当前 HRMS 已落地 **function 导出**（`export function xxx() {}`），**不用** class + 静态方法

## 业务规则配置化（强约束）

**所有业务规则必须走 `configs` 表 + 版本回溯字段（`effective_from` / `effective_to`）**。禁止硬编码。

详见 [`docs/HRMS-V1.2.md`](./docs/HRMS-V1.2.md) §三.5 + 必读 [`docs/error-codes.md`](./docs/error-codes.md)（5 位段位错误码规范）。

11 类必配置化业务规则：工号 / 合同预警 / 试用期 / 转正提醒 / 离职档案 / 绩效系数 / 固浮比 / 提成比例 / 差旅补助 / 年假额度 / 加班上限 / 排班冲突。详见 V1.2 §三.5.2 完整清单。

## 当前进度

### M0 脚手架（8/9 完成）
- [x] M0-01 pnpm monorepo 初始化
- [x] M0-02 lint 配置
- [x] M0-03 docker-compose
- [x] M0-04 Prisma schema
- [x] M0-05 后端登录接口
- [x] M0-06 前端登录页
- [x] M0-07 RBAC 中间件
- [x] M0-08 审计日志（含失败埋点）
- [x] M0-09 Nginx + Docker（由 M5-1 切片完成，commit f7c3e1a）

### M0 安全基线（已完成）
V1.2 之前的 6 个严重项全部修复：
- [x] JWT 锁定 `algorithms: HS256`（签发/校验）
- [x] Refresh Token rotation + reuse 检测（双层防护）
- [x] Refresh 端点独立限流（1min/30 次）
- [x] Production 拒绝 dev-only 默认 secret
- [x] 登录失败写审计日志（埋点下沉到 service）
- [x] Prisma 类型推导消除 `as UserWithRoles` 强转
- 单测 26/26 通过；lint 0 错；type-check 0 错

### V1.2.1 演进（已完成）
- [x] audit_logs 加 `actor_type` 字段（USER / AGENT / SYSTEM / INTEGRATION）+ 2 个新 index
- [x] PostgreSQL 镜像切到 `pgvector/pgvector:pg16` + 自动启用 vector 扩展
- [x] auth.service 渐进式重哈希（cost 10 → 12 异步升级）
- [x] 修复账号枚举漏洞（账号禁用统一 401+10110）
- [x] 5 处 AppError 升级为 3 参（message, statusCode, code）
- [x] 新增 [`docs/knowledge-base-seed.md`](./docs/knowledge-base-seed.md)（AI 智能问答冷启动 ≥ 28 篇）
- [x] api-spec.md / openapi.yaml / flow-diagrams.md / audit-masking.md 全部同步 actor_type / reveal 接口 / 历史表 ER 图
- 单测 29/29 通过（新增 3 个：账号禁用防枚举 + 渐进式重哈希 2 个）

### M0.5 公共底座 + AI 底座
- [x] M0.5-1 审批流基础设施（approval_flows / approval_instances / approval_records + RBAC）
- [x] M0.5-2 消息通知基础设施（templates / logs + BullMQ；email/sms 经 integration adapters）
- [x] M0.5-3 字段级加密（encrypted_fields + AES-256-GCM）
- [x] M0.5-4 第三方对接框架（integrations + 适配器；config AES 加密 + 脱敏 GET）
- [x] M0.5-5 AI 底座（ai_documents / ai_embeddings / ai_conversations / ai_summaries + LLM 网关 + OCR）
- [x] M0.5-6 配置中心（configs + configService + 内存缓存 + §3.5.2 seed）
- [x] M0.5-7 改密 + 二次验证（change-password / force-change-password / request-2fa / verify-2fa）

### M0.5 收尾（已完成）

- 7 个切片全部实现并 commit：M0.5-1 审批流 / M0.5-2 通知 / M0.5-3 字段加密 / M0.5-4 第三方对接 / M0.5-5 AI 底座 / M0.5-6 配置中心 / M0.5-7 改密 + 二次验证
- 累计单测：26 → 51 → 100 → 115 → 140
- 数据库：12+ 张表（user / role / permission / audit / approval × 3 / notification × 2 / encrypted × 2 / integration × 2 / config / ai × 4 / user_position_history / user_salary_history 等）
- 公共底座 5 个切片为 M1-M5 业务模块铺路：审批流 / 通知 / 加密 / 对接 / AI

### M1 组织人事（**已完成** — V1.2 §四.5 A1-A7 全部落地）

- **A1+A2 合并提交**：组织架构 + 员工档案
  - 扩展 companies / departments / employees + 新增 employee_position_history / employee_salary_history
  - 25 个新端点（company 7 + department 8 + employee 10）
  - 38 个新单测（140 → 178）
  - AI OCR 集成（M0.5-4 LLM 网关）+ 字段加密（M0.5-3 AES-256-GCM）+ 合同预警（M0.5-2 通知）+ 业务规则（工号/预警天数走 M0.5-6 configService）
- **A3 入职流程**：onboarding_records + onboarding_tasks 2 张表
  + 状态机 + 工号自动生成 + AI OCR 资料收集（复用 A2 employeeAI 三方法）
  + 审批流 + 通知 + 5 个新端点 + 17 个新单测（178 → 195）
- **A4 转正流程**：regularization_records 1 张表
  + 状态机 + 3 级审批流（部门负责人 → HR → 总经理）
  + 转正后 employee.status probation → active + 薪资历史写入
  + listUpcomingRegularizations 给 BullMQ 调用 + 4 个新端点 + 18 个新单测（195 → 213）
- **A6 离职流程**：offboarding_records + handover_tasks 2 张表
  + 7 步流程（V1.2 §二.2.3）+ 2 级审批流（HR → 总经理）
  + 工作交接清单（5 项模板，configs.offboarding.handover_template）
  + 账号禁用（configs.offboarding.account_disable_strategy）
  + 离职证明 mock PDF（HTML + 水印，configs.offboarding.certificate_*）
  + 档案 1 年后访问 RBAC（configs.offboarding.archive_access_after_1y）
  + 6 个新端点 + 21 个新单测（213 → 234）
- **A5 调动流程**：transfer_records 1 张表
  + 4 级审批流（调出部门 → 调入部门 → HR → 总经理）
  + 调动类型（平调/晋升/降职）+ 联动 employee_position_history + employee_salary_history
  + 立即/次月生效策略（configs.transfer.salary_effective）
  + 5 个新端点 + 21 个新单测（234 → 255）
  + **权限重算留二期，未来生效日 BullMQ 留独立任务**
- **A7 合同管理（M1 收尾）**：contract_records 1 张表
  + 5 类合同模板（formal/intern/consultant/labor/nda）
  + 6 状态机 draft→pending_signature→signing→signed/expired/cancelled
  + 电子签 mock（不接 e-签宝真实 SaaS，留二期）
  + 附件简化处理（attachmentUrl 字符串，不实现 multipart）
  + 合同到期 3 级预警（30/15/7 天，configs.contract.warning_days）
  + 6 个端点（5 用户 + 1 webhook）+ 21 个新单测（255 → 276）

**M1 累计**：140 → 276 测试（+136，97% 增长）/ 7 个业务 commit / 0 越界
**M1 收尾报告**：[`docs/cursor-prompts/M1-wrap-up.md`](./docs/cursor-prompts/M1-wrap-up.md)
**下一阶段 M2 考勤假勤**（V1.2 §四.6 B1-B6 切片）

### M2 考勤假勤（启动，B1 班次定义已完成）

- **B1 班次定义与排班（已完成，M2 首个切片）**：shift_templates + shift_assignments 2 张表
  + 3 类工时制（standard/comprehensive/flexible）+ 5 端点（4 班次 CRUD + 1 批量排班）
  + 排班冲突检测（连续工作 ≤6 天 / 休息间隔 ≥12 小时 / 同员工同范围不可重复）
  + 9 类 configs 业务规则 + 17 个新单测（276 → 293）
  + **B1 不实现打卡 / 请假 / 加班 / 出差 / 月度汇总**（留 B2-B6 切片）
  + **BullMQ 冲突扫描调度留独立任务**
- **B2 打卡管理（已完成）**：attendance_records 1 张表
  + 4 打卡方式（WiFi/GPS/manual/imported）
  + 异常判定（迟到/早退/缺卡，service 层函数）
  + 补卡申请（走 M0.5-1 审批流，月度上限 3 次）
  + 得力 e+ Excel 解析（mock，不接真实 SaaS，留二期）
  + 5 个新端点 + 21 个新单测（293 → 314）
  + **B2 不实现 B3-B6 业务**
- **B3 请假（已完成）**：leave_requests 1 张表
  + 8 类假期 + 假期额度 service 函数计算（**不存表**）
  + 2 级审批流（≤3 天 short / >3 天 long）
  + 余额校验 + 工作日计算（排除周末）
  + 5 个新端点 + 22 个新单测（314 → 336）
  + **调休余额留 B4** / **B3 不实现 B4-B6**
- **B4 加班管理（已完成）**：overtime_requests 1 张表
  + 加班补偿二选一（pay 加班费 / comp 调休 1:1）
  + 加班上限（单日 ≤3h / 单月 ≤36h，劳动法）
  + 加班费倍数（工作日 1.5x / 周末 2.0x，**法定假日 3.0x 留二期**）
  + 至少提前 4h 申请
  + 3 个新端点 + 23 个新单测（336 → 359）
  + **B4 不实现调休余额累计**（B6 月度汇总或独立任务）
  + **未修改 leave.service.ts 的 calculateLeaveBalance 函数**
- **B5 出差管理（已完成）**：business_trips 1 张表
  + 出差申请（地点/起止日期/事由/项目）
  + 差旅补助计算（城市 tier × 职级系数，写 allowance_amount 字段）
  + 走 M0.5-1 审批流 + 至少提前 3 天申请 + 区间重叠校验
  + 3 个新端点 + 19 个新单测（359 → 378）
  + **B5 不联动 B2 GPS 打卡** / **B5 不联动 M4 薪酬** / **不创建 projects 表**
  + **B5 不实现月度汇总**（B6 范围）
- **B6 月度考勤汇总（已完成，M2 收尾切片）**：monthly_summaries 1 张表
  + 报表生成（聚合 B1 attendance + B3 leave + B4 overtime + B5 trip 数据）
  + 员工确认（draft → employee_confirmed）
  + HR 锁定（employee_confirmed → hr_locked，**M4 薪酬读取**）
  + **【B3 调休余额承诺】** 调休余额聚合（B6 自己实现 calculateCompBalance 函数）
  + 4 个新端点 + 22 个新单测（378 → 400）
  + **未修改 leave.service.ts 的 calculateLeaveBalance 函数**（红线 6 强约束）
  + **未 import leave.service**（红线 5 强约束）
  + **未实现 BullMQ 每月 1 日自动生成**（留独立任务）
- **M2 阶段全部完成**（V1.2 §四.6 B1-B6 全部落地，0 越界，0 旧测试改动）
- **M2 累计**：276 → 400 测试（+124 / +45%）；一期累计 26 → 400（+374 / +1439%）
- **M2 收尾报告**：[`docs/cursor-prompts/M2-wrap-up.md`](./docs/cursor-prompts/M2-wrap-up.md)
- **下一阶段 M3 绩效管理**（V1.2 §四.7 D1-D6 切片，约 19d）

### M3 绩效管理（**已完成** — V1.2 §四.7 D1-D6 全部落地）

- **D1 考核方案配置**（a445938 提示词 + 77e927b 业务 + b8978ce §3.3 finance 修正）
  - 5 张表：performance_cycles / indicators / schemes / scheme_indicators / coefficients
  - 10 端点 + 8 权限点 + 12 错误码（72401-72412）+ 12 项 configs
  - 30 个新单测（276→430，+21%）
- **D2 考核流程**（1c1756d 提示词 + acbfcb9 业务）
  - 4 张表：performance_records / scores / score_items / ai_suggestions
  - 13 状态状态机 + 5 级审批流（5 flowKey 走 M0.5-1）
  - **直接复用 M0.5-5 `aiScoreService.suggestScore`**（D2 严禁重写）
  - 16 端点 + 8 权限点 + 20 错误码（72501-72520）+ 16 项 configs
  - 33 个新单测（430→463，+8%）
- **D3 五档评分**（cdb0709 提示词 + 24efc4a 业务）
  - **0 新表**（M2-wrap-up 误写"季度校准会议"已修正为"五档评分"，V1.2 §四.7.1 D3 实际范围）
  - 软警告 warn_only（V1.2 §二.5.1 比例仅供参考，不强制）
  - 5 端点 + 3 权限点 + 10 错误码（72601-72610）+ 4 项 configs
  - 28 个新单测（463→491，+6%）
- **D4 绩效兑现**（45cfa29 提示词 + 672bb9e 业务）
  - 2 张表：performance_payout_configs / payouts
  - **双轨制**：直乘（baseAmount × coefficient，D 档 0）+ 部门池（部门池 × 个人系数 / 部门成员系数总和）
  - **预支 + 清算**：季度前 2 月按 1.0 × 50% 预支 + 季度末按实际系数多退少补（仅 audit + 标记，**不联动 M4 薪酬**）
  - 8 端点 + 4 权限点 + 10 错误码（72701-72710）+ 8 项 configs
  - 22 个新单测（491→511，+5%）
  - **D4 验收发现 2 个 B3/B5 跨 UTC 边界旧测** → 955b119 fix commit 用 `vi.useFakeTimers` 锁日期（沿用 B6 红线 6 模式）
- **D5 销售提成**（af4ff69 提示词 + 7146be7 业务）
  - 3 张表：performance_sales_products / payments / commissions
  - 财务确认自动触发 commission 计算（auto_on_confirm 策略）
  - **无 finance 角色**（hr 兼任财务确认，D1 教训延续）
  - 8 端点 + 7 权限点 + 10 错误码（72801-72810）+ 8 项 configs
  - 35 个新单测（511→548，+7%）
- **D6 结果应用**（b1b93f9 提示词 + 830e600 业务，**M3 收尾**）
  - 2 张表：performance_pips / pip_reviews
  - **调薪 / 晋升用 audit_logs**（0 新表）→ 实际写入 employee_salary_history / position_history 留 M4 联调
  - **PIP 状态机**：4 状态（active / completed / failed / cancelled）+ 3 月改进期 + 月度评审
  - **PIP 失败仅 audit + 标记**，**不调 A6 离职 service**
  - 8 端点 + 8 权限点 + 10 错误码（72901-72910）+ 11 项 configs
  - 33 个新单测（548→581，+6%）

**M3 累计**：430 → 581 测试（+181 / +42%）；一期累计 26 → 581（+555 / +2135%）
**M3 收尾报告**：[`docs/cursor-prompts/M3-wrap-up.md`](./docs/cursor-prompts/M3-wrap-up.md)
**遗留任务**（M3 收尾时）：D6 调薪/晋升实际写入 employee_salary_history / position_history 留 M4 联调 / D4 payout 实际扣工资留 M4 / D5 提成发放联动 M4 / PIP 失败启动离职流程留独立任务 / 培训管理模块留二期

### M4 薪酬核算（**已完成** — V1.2 §四.8 C1-C8 全部落地 + 任务 ID 错位专题）

> ⚠️ **任务 ID 与 V1.2 切片表错位**（M4 阶段重大决策，详见 [§任务 ID 错位专题](#m4-任务-id-与-v12-切片表错位专题)）

- **C1 薪级薪档 + 员工薪酬方案**（d1e2504 提示词 + 265316b 业务）
  - 3 张表：salary_grades / salary_grade_levels / employee_salary_plans
  - 7 端点 + 4 权限点 + 10 错误码（73001-73010）+ 5 项 salary.* configs
  - 31 个新单测（581→612）
  - **首次非 performance 路由**：独立 `server/src/routes/salary.ts`，C2-C8 全部追加同文件
- **C2 社保公积金方案**（623a9ae 提示词 + 5704c0b 业务）
  - 3 张表：social_insurance_schemes / housing_fund_schemes / employee_insurance_registrations
  - 9 端点 + 4 权限点 + 10 错误码（73101-73110）+ 6 项 salary.insurance.* / housing_fund.* configs
  - 29 个新单测（612→641）
  - **不实现实际算扣**（留 C3）
- **C3 个税引擎**（0f44c32 提示词 + 92406f1 业务）
  - **0 新表** + 工资薪金累计预扣简化版 / 年终奖按月换算 / 劳务报酬 3 级超额累进
  - 6 端点 + 3 权限点 + 10 错误码（73201-73210）+ 10 项 salary.tax.* configs
  - 40 个新单测（641→681）
  - **已知问题**：提示词 §5.1.4 / §5.3.3 部分"预期税额"与 §3.7 实际税率表算术不一致，Cursor 按 §3.7 实际算法实现（**更准确**）
- **C4 算薪引擎 + 算薪流程 + AI 算薪校验摘要**（fb54c52 提示词 + a71f7c9 业务，**M4 核心**）
  - 3 张表：payroll_runs / payslips / payslip_items
  - 12 端点 + 5 权限点 + 10 错误码（73401-73410）+ 6 项 salary.payroll.* configs
  - 3 级审批（HR→财务 hr 兼任→CEO）+ **复用 M0.5-5 aiSummarizeService**（C4 仅调用，不重写）
  - 44 个新单测（681→725）
  - **已知问题**：年终奖未在 12 月自动调用 C3 累计预扣法（`yearEndBonusAmount` 默认 0，留二期）
- **C5 工资条 + 银企代发 + 个税申报 + 工资表导出**（dc510b3 提示词 + 8485d08 业务）
  - **0 新表** + 7 端点 + 4 权限点 + 10 错误码（73501-73510）+ 6 项 salary.payslip / banking / report configs
  - **mock 模式**：`salary.banking.mock_mode = true` 强制 true，**不接真实银行 / 税务局 API**
  - 复用 M0.5-2 notification.sendNotification（**仅调用**，bypassTemplate fallback）
  - 3 银行格式（icbc CSV / ccb TXT / cmb XLS）+ Excel / PDF mock
  - 28 个新单测（725→753）
  - **任务 ID 错位**：实际实现 V1.2 §四.8.1 切片表 C6 范围（工资条+银企+ESS 自助），V1.2 切片表 C5 劳务费**未实现，留二期**
- **C6 销售提成季度结算**（08b2980 提示词 + 99c1297 业务）
  - 1 张表：commission_settlements（季度结算单 + 状态机 draft → pending_confirm → confirmed / cancelled）
  - 8 端点 + 4 权限点 + 10 错误码（73601-73610）+ 6 项 salary.commission.* configs
  - 4 维度汇总（employee / department / product / report）+ 财务确认（hr 兼任）+ 失败回滚
  - **D5 联动**：仅 prisma 读 D5 `performance_sales_commissions` 表，**不调用 D5 service**
  - **不联动 C4 算薪**：`payroll_calculation.service.ts` 的 `salesCommissionAmount` 字段继续默认 0（季度结算→工资条合并留二期）
  - 32 个新单测（753→785）
- **C7 人力成本预警**（d3973b6 提示词 + 250ab06 业务）
  - 1 张表：hr_cost_alerts + 3 个 enum（Type / Severity / Status）
  - 6 端点 + 4 权限点 + 10 错误码（73701-73710）+ 5 项 salary.cost_alert.* configs
  - 2 项预警：**加班费占比**（读 C4 payslips + B4 overtime_requests）+ **离职率**（读 A6 offboarding_records + M1 employees）
  - 严重度（warning 5-10% / critical >10%）+ 按部门聚合
  - **不创建 BullMQ 队列**：仅暴露 `scanOvertimeRatioAlerts` + `scanAttritionAlerts` 函数，调度由 M0.5 独立任务接入
  - 31 个新单测（785→816）
  - **任务 ID 错位**：实际实现 V1.2 §四.8 C4 行"2 项高频预警"（C4 业务 commit 未实现 BullMQ 调度，C7 兜底），V1.2 切片表 C7 薪酬审批流**已 M4-C4 实现**
- **C8 调薪实际执行**（d8b85e6 提示词 + 6313766 业务，**M4 收尾**）
  - 1 张表：salary_adjustments + 2 个 enum（Type / Status）+ 6 状态机
  - 8 端点 + 5 权限点 + 10 错误码（73801-73810）+ 6 项 salary.adjustment.* configs
  - 4 种调薪类型：promotion / annual_adjust / performance / market_adjustment
  - 3 级审批走 M0.5-1 approval（hr → 财务 hr 兼任 → CEO，require_ceo_approval > 5000 元）
  - **调薪实际执行**（M3-wrap-up §7 遗留 D6 联动兜底）：
    - 写 `EmployeeSalaryHistory`（prisma 写）
    - 同步 `EmployeeSalaryPlan`（旧 plan 设 `effectiveTo` + 新 plan 创建）
    - 联动 `EmployeePositionHistory`（**仅 promotion 类型 + position_change_link=true**）
  - 联动 D6 audit_logs（**prisma 读 + 写新 audit 行**，**不调用** D6 service）
  - **不更新 `employees.baseSalary`**（**该字段不存在，**严禁** 给 employees 表加字段**）
  - **不创建 BullMQ 队列**：暴露 `executePendingAdjustments(actorId, asOfDate)` 函数，调度由 M0.5 独立任务接入
  - 39 个新单测（816→855）

**M4 累计**：581 → 855 测试（+274 / +47%）；一期累计 26 → 855（+829 / +3188%）
**M4 收尾报告**：[`docs/cursor-prompts/M4-wrap-up.md`](./docs/cursor-prompts/M4-wrap-up.md)

**M4 阶段关键纪律**：
- **0 修复 commit**（M3 阶段 2 个修复在 M4 全程未复发，**纪律最稳的阶段**）
- **0 越界连续 28 次**（M0.5-5 教训后 → M4 收尾累计 33 切片）
- **36 service 0 行改动**（D 14 + C 18 + M0.5 4 = 36，C7 首次含 M0.5 红线）
- **100% 5 角色 RBAC 无 finance**（D1 教训延续 → M3 → M4 8 切片）

**M4 阶段暴露 8 个 BullMQ 待接入函数**（M0.5 独立任务接入）：
- C4：`generateMonthlyPayroll` / `aiSummarize`（每月 25 日 + 每日 02:00）
- C6：`createSettlement`（季度末自动）/ `listPendingSettlements`（季度末自动）
- C7：`scanOvertimeRatioAlerts`（每日 02:00，V1.2 §四.8 明确）/ `scanAttritionAlerts`（每日 02:00，V1.2 §四.8 明确）
- C8：`executeAdjustment`（手动触发）/ `executePendingAdjustments`（每日 02:00 扫描 effective_date <= today 的 approved 调薪）

**M4 阶段已建 12 张表**（C1 3 + C2 3 + C4 3 + C6 1 + C7 1 + C8 1 = 12 张）；一期累计 40 张业务表（M1 7 + M2 7 + M3 14 + M4 12）

**M4 阶段已配置 50 项 configs**（C1 5 + C2 6 + C3 10 + C4 6 + C5 6 + C6 6 + C7 5 + C8 6 = 50）；一期累计 109 项 configs（D 59 + C 50）

**M4 阶段已分配 80 个错误码**（73001-73810，**有意跳过 733xx 留给 C3.x 扩展**）；一期累计 152 个错误码（D 72 + C 80）

**M4 阶段已追加 33 个权限点**（C1 4 + C2 4 + C3 3 + C4 5 + C5 4 + C6 4 + C7 4 + C8 5 = 33）；一期累计 71 个权限点（D 38 + C 33）

**M4 阶段 0 越界连续 28 次**（M0.5-5 教训后）：M0.5 6 + M1 7 + M2 6 + M3 6 + M4 8 = **33 切片**

**M4 阶段 16 个 commit**（8 业务 + 8 提示词，业务 commit 模式与 M3 一致）

### 工程强约束（V1.2 时代）

- **不用 class + 静态方法**：统一 `export function` 范式
- **业务规则必走 configs 表**：禁止硬编码（工号/合同预警/试用期/调基月/绩效系数等 12 类）
- **敏感字段必加密**：身份证/银行卡/薪资字段走 M0.5-3 AES-256-GCM
- **审计必写**：增删改 + 关键读 + AI 调用（actor_type 区分 USER/AGENT/SYSTEM/INTEGRATION）
- **AI 调用必审计**：userId / capability / tokens / cost / duration 全留痕
- **后台任务用 BullMQ**：不用 node-cron 裸跑
- **AI Coding 任务强约束**：禁止越界做未授权切片，禁止修改旧测试文件，必须在报告中完整列出变更
- **M4 阶段新增强约束**：
  - **任务 ID 优先，不与 V1.2 切片表强对齐**（详见 [§任务 ID 错位专题](#m4-任务-id-与-v12-切片表错位专题)）
  - **不更新 `employees.baseSalary`**（**该字段不存在**，C8 严禁添加，员工实际薪资走 `employee_salary_plans` + `employee_salary_history` 两表协作）
  - **5 角色 RBAC 不含 finance**（D1 教训延续 → M3 → M4 8 切片，hr 兼任财务复核 / 银行代发 / 个税申报 / 调薪审批）

### M1-M5 业务模块
- ✅ **M1 组织人事（第 3-5 周，已完成）**：A1-A7 切片（276 测试）
- ✅ **M2 考勤假勤（第 6-8 周，已完成）**：B1-B6 切片（400 测试）
- ✅ **M3 绩效管理（第 9-11 周，已完成）**：D1-D6 切片（581 测试）
- ✅ **M4 薪酬核算（第 12-15 周，已完成）**：C1-C8 切片（855 测试）
- ⏳ **M5 联调上线（第 16-18 周，进行中）**：M5-1 Nginx+Docker ✅ → M5-2 前端（0 基础设施 ✅ / A1 ✅ / A2 ✅ / B 考勤 ✅，C 薪酬 / D 绩效待做）→ M5-01~08 联调任务（接口联调 / E2E / 数据迁移 / 渗透 / 压测 / 培训 / 并行核算 / 上线）
- ✅ **前端测试脚手架（2026-09-01 补建）**：client 接入 vitest 3 + happy-dom（`client/vitest.config.ts`），`tests/run-all.test.ts` 聚合执行 `src/**/__tests__/` 23 个自包含用例文件的 `run*Tests` 导出，`pnpm test` 替换 placeholder，46/46 通过；此前 23 个文件从未真正运行（M5-2 各切片"单测"仅为静态文件）

详见 [`docs/HRMS-V1.2.md`](./docs/HRMS-V1.2.md) §四 阶段与任务。

### M4 任务 ID 与 V1.2 切片表错位专题

> **M4 阶段重大决策**（避免后续 M5+ 误读）

M4 阶段 8 个业务 commit（任务 ID「M4-C1」~「M4-C8」）与 V1.2 §四.8.1 切片表（C1~C8）**部分错位**。原因：
- M4 任务 ID 沿用 M1-M3 习惯（按业务模块顺序递增）
- V1.2 切片表 C1~C8 范围来自 §四.8 业务设计
- 部分 V1.2 切片表范围已被 M0.5 公共底座 + C1-C4 业务 commit 实现

**错位总览**：

| 任务 ID | V1.2 切片表范围 | 实际实现 | 状态 |
|---|---|---|---|
| M4-C1 | V1.2 切片表 C1 薪级薪档 | ✅ 实际实现 V1.2 C1 | 一致 |
| M4-C2 | V1.2 切片表 C2 社保公积金 | ✅ 实际实现 V1.2 C2 | 一致 |
| M4-C3 | V1.2 切片表 C3 个税引擎 | ✅ 实际实现 V1.2 C3 | 一致 |
| M4-C4 | V1.2 切片表 C4 算薪引擎 + AI 摘要 | ✅ 实际实现 V1.2 C4 + C7 薪酬审批流 | 范围超出 |
| M4-C5 | V1.2 切片表 C5 劳务费 | ❌ 实际实现 V1.2 C6 工资条+银企+ESS | **错位** |
| M4-C6 | V1.2 切片表 C6 工资条+ESS | ❌ 实际实现销售提成季度结算（V1.2 未列）| **新增切片** |
| M4-C7 | V1.2 切片表 C7 薪酬审批流 | ❌ 实际实现 2 项人力成本预警（V1.2 §四.8 C4 行）| **错位** |
| M4-C8 | V1.2 切片表 C8 薪酬数据加密+二次授权 | ❌ 实际实现调薪实际执行（V1.2 §二.4.5 + M3-wrap-up §7 遗留 D6 联动）| **错位** |

**处理原则**：
1. **任务 ID 优先，不与 V1.2 切片表强对齐**（不重命名任务 ID，避免破坏 commit 链一致性）
2. **V1.2 未实现范围留二期**：
   - V1.2 切片表 C5 劳务费结算通道 → 留二期 BI
   - V1.2 切片表 C8 ESS 员工自助最小集 → 工资条已 C5 实现，调休/假期查询 tab 留前端
3. **业务 commit 透明报告**：每个 M4 业务 commit 在交付报告"已知问题"段透明标注"V1.2 切片表 X 行追加：本切片由 M4-Cn 业务 commit 实现"
4. **M5 阶段需规范化**：V1.2 §四.8.1 切片表加"实际 commit"列 + AGENTS.md / api-spec.md 端点标注"对应 V1.2 切片表 X 行"

**业务 commit 标注记录**：
- C5 报告："V1.2 切片表 C6 行 标注已实现"
- C6 报告："V1.2 §四.8.1 C5 行追加：销售提成核算联动（**未实现**），劳务费通道留二期"
- C7 报告："V1.2 §四.8.1 C7 行追加：本切片由 M4-C4 业务 commit 实现（3 级审批），M4-C7 业务 commit 实现 2 项人力成本预警"
- C8 报告："V1.2 §四.8.1 C8 行追加：本切片由 M0.5-3 + M0.5-7 业务 commit 实现（薪酬数据加密 + 改密 + 2FA），M4-C8 业务 commit 实现调薪实际执行"

### 红线升级（service 0 行改动，V1.2 时代）

| 阶段 | 红线 service 数 | 范围 | 累计 0 越界 |
|---|---|---|---|
| M0.5 | 5 service（M0.5-1/2/5/6 + M0.5-8 audit）| M0.5 公共底座 | M0.5-5 教训后 |
| M1 | 8 service（D 0 + M0.5 4 + 1 加密）| A1-A7 仅 prisma 联动 M0.5 | 7 切片 |
| M2 | 14 service（D 0 + M0.5 4 + 1 加密 + M1 7 + M2 0 自身不写 6 service）| B1-B6 仅 prisma 读 M1 | 6 切片 |
| M3 | 14 service（D1-D6 14）+ 0 M0.5 红线（M3 自身 14 service）| D1-D6 仅 prisma 联动 M0.5-5 | 6 切片 |
| M3 收尾 | **D1-D5 = 11 service**（D3 → D4 9 → D5 11）| D3-D5 红线升级 | 6 切片 |
| M4 C1 | 17 service（D 14 + C1 3）| C1 仅 prisma 联动 M0.5 | 7 切片 |
| M4 C2 | 20 service（D 14 + C1 3 + C2 3）| C2 不写 employee_salary_history | 7 切片 |
| M4 C3 | 23 service（D 14 + C1-C3 9）| C3 0 新表 | 7 切片 |
| M4 C4 | 23 service（D 14 + C1-C3 9）| C4 复用 M0.5-5 aiSummarizeService | 7 切片 |
| M4 C5 | **32 service**（D 14 + C1-C5 18，**修正 C3 = 3 / C5 = 5**）| C5 银企/个税/报表留 mock | 7 切片 |
| M4 C6 | 32 service | C6 D5 联动 + 不联动 C4 算薪 | 7 切片 |
| M4 C7 | **36 service（D 14 + C 18 + M0.5 4）** | **C7 首次含 M0.5 红线** | 8 切片 |
| **M4 C8** | **36 service（沿用 C7）** | **C8 联动 D6 audit + 不更新 employees.baseSalary** | **8 切片** |

**M4 收尾最终红线**：**36 service 0 行改动**（D 14 + C 18 + M0.5 4 = 36），5 角色 RBAC 无 finance，详尽模式 50-80KB（提示词平均 61KB）。

### 关键经验（Cursor 主动识别 + 修正能力）

> 沿用 M1 + M2 + M3 经验，M4 阶段 4 起主动识别 + 修正：

1. **C3 提示词 §5.1.4 / §5.3.3 算术不一致**（预期税额与 §3.7 实际税率表算术不一致）→ Cursor 按 §3.7 实际算法实现（**更准确**）
2. **C4 主动识别"年终奖未在 12 月自动调用 C3"** → 标记为已知问题，留二期或 C8 收尾（C8 收尾**未实现此联动**）
3. **C5 已知问题"V1.2 切片表 C5=劳务费/C6=工资条"任务 ID 错位** → C6 / C7 / C8 沿用此范式，**M4 阶段"任务 ID vs V1.2 切片表错位"专题**
4. **C8 "employees 表无 baseSalary 字段" 强约束** → 验证 10 处 baseSalary 字段分布（M1 onboarding/转正/调动/离职 + C1 薪级/薪档/员工方案 + C4 工资单明细 + C8 新表，**唯独 employees 表无 baseSalary**），C8 严禁添加

**5 角色 RBAC 无 finance 教训**（D1 起延续 4 阶段）：D1 提示词 §3.3 误列 finance → Cursor 主动识别 + 修正 → D2-D6 + C1-C8 100% 遵守 → M4 阶段 hr 兼任财务复核 / 银行代发 / 个税申报 / 调薪审批。

**详情见**：
- [`docs/cursor-prompts/M3-wrap-up.md`](./docs/cursor-prompts/M3-wrap-up.md)（M3 收尾报告 28KB / 10 节）
- [`docs/cursor-prompts/M4-wrap-up.md`](./docs/cursor-prompts/M4-wrap-up.md)（M4 收尾报告 43KB / 10 节）

## 📁 文档结构（V1.2 时代）

### 主文档（唯一权威）
- **`docs/HRMS-V1.2.md`** —— 三份历史文档（需求/PRD/开发计划 V1.1）已合并
- 旧 .md 顶部带 `V1.1.archived` 标记，旧 .docx/.html 已加 `.archived` 后缀

### 独立配套文档（AI Coding 直接引用）
- **`docs/api-spec.md`** + **`docs/openapi.yaml`** —— M0 + M0.5 接口规范（OpenAPI 3.0 可加载 Swagger UI）
- **`docs/error-codes.md`** —— 64 个错误码（5 位段位规划 0xxxx-9xxxx）
- **`docs/flow-diagrams.md`** —— 7 业务流程 + 1 架构图 + 2 ER 图（Mermaid）
- **`docs/e-sign-cost.md`** —— 电子签成本评估（推荐 e-签宝）
- **`docs/operations.md`** —— 成本估算 + 数据生命周期 SOP + Bug SLA
- **`docs/audit-masking.md`** —— 审计日志脱敏策略（基线 + 角色化 + 二次审计）

### AI Coding Prompt 模板

每个任务的 Prompt **必须**显式引用 V1.2 章节号 + 配套文档：

```
【任务 ID】M0.5-1-3
【任务目标】实现 approval.service.ts

【上下文】
- 主文档：docs/HRMS-V1.2.md §四.4 M0.5 切片
- API 契约：docs/api-spec.md §4.1 + docs/openapi.yaml paths/approval-flows
- 错误码：docs/error-codes.md §2xxxx
- 数据模型：docs/flow-diagrams.md §3.2 ER 图

【要求】
1. 严格遵循当前 HRMS 代码范式（function 导出，不要 class）
2. 所有方法含 JSDoc
3. 错误统一抛 AppError(message, statusCode, code)，code 用错误码表
4. 所有业务规则走 configService 读取
5. 不实现 controller，只做 service

【验收】
- pnpm vitest run tests/services/approval.test.ts 全通过
- 至少 10 个测试用例（CRUD + 节点流转 + 超时升级 + 撤回 + 转交）
```

## ⚠️ 关键约束

- **不用 class + 静态方法**（与原招聘系统不一致，已统一）
- **敏感字段必加密**（身份证/银行卡/薪资，详见 V1.2 §三.4.2）
- **审计日志必写**（增删改 + 关键读，详见 audit-masking.md §2）
- **配置项必走 configs 表**（V1.2 强约束，详见 §三.5）
- **错误码必查表**（不要写 magic number，详见 error-codes.md §4.1）
- **后台任务用 BullMQ**（不用 node-cron 裸跑，详见 V1.2 §六.2）
- **不 import 跨业务 service**（A4 起源 → M1 7 切片 → M2 6 切片 → M3 6 切片 → M4 8 切片，**100% 遵守 33 切片**）
- **不修改旧测试文件**（M0.5-5 起源 → M3 阶段 955b119 修复 2 个 B3/B5 跨 UTC 边界旧测 → M4 8 切片 **0 修复 commit**）
- **5 角色 RBAC 不含 finance**（D1 教训 → M3 → M4 8 切片，**hr 兼任**）
- **不更新 `employees.baseSalary`**（**该字段不存在**，C8 严禁添加）
- **任务 ID 优先，不与 V1.2 切片表强对齐**（M4 阶段重大决策，详见 [§任务 ID 错位专题](#m4-任务-id-与-v12-切片表错位专题)）
- **不创建 BullMQ 队列（M4 阶段）**：C7 + C8 仅暴露扫描函数，调度由 M0.5 独立任务接入
- **36 service 0 行改动（M4 红线）**：D1-D6 14 + C1-C8 18 + M0.5-1/2/5/6 4 = 36 service 严禁修改（详见 [§红线升级](#红线升级service-0-行改动v12-时代)）

## 参考项目

招聘系统：`C:/Users/fmmf/Kimi/recruiting-system/`（**只读**，仅参考目录结构，不复制范式）
