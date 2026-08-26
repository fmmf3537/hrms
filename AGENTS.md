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
- [ ] M0-09 Nginx + Docker

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
- 后续：B6（月度汇总，M2 收尾切片）

### 工程强约束（V1.2 时代）

- **不用 class + 静态方法**：统一 `export function` 范式
- **业务规则必走 configs 表**：禁止硬编码（工号/合同预警/试用期/调基月/绩效系数等 12 类）
- **敏感字段必加密**：身份证/银行卡/薪资字段走 M0.5-3 AES-256-GCM
- **审计必写**：增删改 + 关键读 + AI 调用（actor_type 区分 USER/AGENT/SYSTEM/INTEGRATION）
- **AI 调用必审计**：userId / capability / tokens / cost / duration 全留痕
- **后台任务用 BullMQ**：不用 node-cron 裸跑
- **AI Coding 任务强约束**：禁止越界做未授权切片，禁止修改旧测试文件，必须在报告中完整列出变更

### M1-M5 业务模块
- M1 组织人事（第 3-5 周）：A1-A7 切片，含 AI OCR + 电子签（提前到一期）
- M2 考勤假勤（第 6-8 周）：B1-B6
- M3 绩效管理（第 9-11 周）：D1-D6，含 AI 评分建议
- M4 薪酬核算（第 12-15 周）：C1-C8，含 AI 算薪校验摘要（**测试 50+ 场景**）
- M5 联调上线（第 16-18 周）

详见 [`docs/HRMS-V1.2.md`](./docs/HRMS-V1.2.md) §四 阶段与任务。

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

## 参考项目

招聘系统：`C:/Users/fmmf/Kimi/recruiting-system/`（**只读**，仅参考目录结构，不复制范式）
