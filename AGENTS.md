# AGENTS.md - HRMS 项目 AI Coding 上下文

## 项目简介

西安辰航卓越科技有限公司员工管理系统（HRMS），一期覆盖组织人事/考勤/薪酬/绩效。

## 技术栈

- pnpm monorepo：client (Vue3) / server (Express+Prisma+PG) / mobile (留空)
- 认证：JWT (access 15min + refresh 7d，已升级 rotation + reuse 检测)
- 权限：RBAC（Role.permissions JSON 数组，5 角色 × 32 权限点）
- 数据库：PostgreSQL 15+（**锁定，不预留多数据库迁移**，详见 V1.2 §三.1）
- 缓存/队列：Redis + BullMQ
- 字段加密：M0.5-3 AES-256-GCM
- 移动端：H5 一期 → 小程序/App 二期
- AI 能力（M0.5-5）：LLM 网关（OpenAI 兼容） + pgvector + OCR

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

### M0.5 公共底座 + AI 底座（第 2 周，规划中）
- [ ] M0.5-1 审批流基础设施（approval_flows / approval_instances / approval_records）
- [ ] M0.5-2 消息通知基础设施（notification_templates / notification_logs + BullMQ）
- [ ] M0.5-3 字段级加密（encrypted_fields + AES-256-GCM + KMS）
- [ ] M0.5-4 第三方对接框架（external_integrations + 适配器接口）
- [ ] M0.5-5 AI 底座（ai_documents / ai_embeddings / ai_conversations / ai_summaries + LLM 网关 + pgvector + OCR）

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
