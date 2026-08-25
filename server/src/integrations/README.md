# M0.5-4 第三方对接框架

> **阶段**：M0.5（第 2 周）· **工时**：2d
> **依赖**：M0 脚手架 + M0.5-2 通知（替换 mock）+ M0.5-3 字段加密（保护 config 敏感字段）
> **被依赖**：M0.5-5 AI 底座（用 llm adapter）+ M1+ 所有需要外部服务的业务场景
> **关联文档**：[`docs/HRMS-V1.2.md`](../../docs/HRMS-V1.2.md) §四.4.1 M0.5-4 · [`docs/error-codes.md`](../../docs/error-codes.md) §5xxxx · [`docs/openapi.yaml`](../../docs/openapi.yaml) `paths/integrations`

## 一、目标

为所有外部服务（e-签宝 / 短信 / 邮件 / LLM / OCR / 地图）提供**统一接口、可插拔适配器、配置可审计**的对接框架。

**核心问题**：每接一个外部服务都要自己写"凭证管理 + HTTP 调用 + 错误处理 + 同步日志"逻辑，重复且无审计。

**本切片提供**：2 张表 + Adapter 接口 + 4 个 mock adapter（esign/sms/email/llm）+ 9 个 REST API + 6 个默认配置（已 seed）。

## 二、架构

```
业务模块
  ↓ send({ code, payload })
IntegrationService (service 层)
  ↓
AdapterRegistry (按 code 路由)
  ↓
EsignAdapter / SmsAdapter / EmailAdapter / LlmAdapter (实现 IAdapter)
  ↓ 实际调用 fetch / SDK
e-签宝 / 阿里云 / SMTP / OpenAI
  ↓
IntegrationSyncLog (写日志)
```

## 三、Adapter 接口

```typescript
interface IAdapter {
  readonly code: string;        // 必须与 Integration.code 唯一对应
  readonly type: 'http_api' | 'webhook' | 'database' | 'file';

  send(payload, config): Promise<AdapterResult>;     // 调用 / 发送
  testConnection(config): Promise<TestResult>;       // 测连通性（不传业务参数）
  sync(config): Promise<AdapterResult>;              // 主动同步（拉外部数据）
}
```

`AdapterResult`：`{ success, recordCount?, data?, error?, duration? }`
`TestResult`：`{ success, error?, latency? }`

## 四、4 个内置 Adapter（M0.5-4 mock 模式）

| Adapter | code | 用途 | M0.5-4 状态 | 待补 |
|---|---|---|---|---|
| EsignAdapter | `esign` | 合同 / 工资条签署 | mock console.log | 接 e-签宝 SDK |
| SmsAdapter | `sms` | 验证码 / 紧急提醒 | mock console.log | 接阿里云 / 腾讯云 SDK |
| EmailAdapter | `email` | 合同到期 / 工资条推送 | mock console.log | 接 nodemailer + SMTP |
| LlmAdapter | `llm` | AI 智能问答 / 算薪校验 / 评分 | mock 返回固定字符串 | 接 OpenAI 兼容 fetch |

**生产环境**：`config.provider !== 'mock'` 时返回 SDK 未实现错误。运维配置真实凭证后即可用（**无需改代码**）。

## 五、数据模型

2 张表（迁移：`server/prisma/migrations/20260825040000_add_integrations/`）：

```
Integration (集成配置)
├── code (唯一，esign/sms/email/llm/ocr/map)
├── name / type
├── config (JSON，敏感字段走 M0.5-3 加密)
├── enabled / lastSyncAt
└── 1:N → IntegrationSyncLog

IntegrationSyncLog (同步日志)
├── integrationId / status (success/failed/partial)
├── operation (send/sync/test_connection/pull)
├── recordCount / duration (毫秒)
├── errorMessage
└── createdAt
```

## 六、API 端点（9 个）

| Method | Path | 鉴权 | 描述 |
|---|---|---|---|
| GET | `/integrations` | 是 | 列出所有集成 |
| GET | `/integrations/sync-logs` | 是 | 同步日志（分页+过滤）|
| GET | `/integrations/:code` | 是 | 按 code 查 |
| POST | `/integrations` | 是（admin）| 创建 |
| PUT | `/integrations/:id` | 是（admin）| 更新 |
| DELETE | `/integrations/:id` | 是（admin）| 软删除 |
| POST | `/integrations/send` | 是 | 发送（按 code 路由）|
| POST | `/integrations/:code/sync` | 是（admin）| 触发同步 |
| POST | `/integrations/:code/test` | 是 | 测试连通性 |

详细请求/响应：[`openapi.yaml`](../../docs/openapi.yaml) `paths/integrations`

## 七、错误码

详见 [`error-codes.md`](../../docs/error-codes.md) §5xxxx：

| 错误码 | 含义 |
|---|---|
| 50100 | INTEGRATION_CONFIG_MISSING（集成已禁用）|
| 50101 | INTEGRATION_NOT_FOUND（按 code 找不到）|
| 50110 | INTEGRATION_PROVIDER_ERROR（外部服务失败）|
| 50111 | INTEGRATION_TIMEOUT（外部超时）|
| 50112 | INTEGRATION_RATE_LIMITED（外部限流）|
| 50120 | INTEGRATION_PAYLOAD_INVALID（adapter 未注册）|

## 八、Seed 默认集成（6 个）

| code | name | type | 说明 |
|---|---|---|---|
| esign | e-签宝 | http_api | 电子签（合同 / 工资条签署）— 见 docs/e-sign-cost.md |
| sms | 短信网关（阿里云/腾讯云）| http_api | 替换 M0.5-2 的 console.log mock |
| email | SMTP 邮件 | http_api | 替换 M0.5-2 的 console.log mock |
| llm | LLM 网关（OpenAI 兼容）| http_api | 大模型（智能问答 / 算薪校验 / 评分建议）|
| ocr | OCR 服务（腾讯云）| http_api | V1.2 §四.4.1 M0.5-5 集成（待 M0.5-5 接）|
| map | 腾讯地图 API | http_api | V1.2 §二.3.1 考勤打卡（待 M0.5-5 接）|

## 九、Adapter 实现指南（新增 Adapter 时）

1. 在 `server/src/integrations/adapters/` 下新建 `xxx.adapter.ts`
2. 实现 `IAdapter` 接口（3 个方法）
3. 在 `adapters/register.ts` 的 `registerAllAdapters()` 注册
4. seed.ts 加默认配置
5. env.ts 加相关配置（如有）

## 十、测试覆盖（15 个新增）

| 场景 | 数量 |
|---|---|
| 创建集成（合法 / code 重复）| 2 |
| 列出 | 1 |
| 按 code 查（找到 / 不存在 / 软删除）| 3 |
| 发送（成功 / 禁用 / 不存在 / adapter 未注册 / adapter 失败）| 5 |
| 同步 + 测试连通性 | 2 |
| 同步日志列表 | 1 |
| 软删除 | 1 |
| **合计** | **15** |

`pnpm --filter hrms-server test`：115/115 通过

## 十一、与 M0.5-2 通知的联动

M0.5-4 上线后，`notification.queue.ts` 的 `sendViaEmail` / `sendViaSms` 应当改为调 `integrationService.send`（按 code 路由）：
- 减少重复实现
- 走统一的 sync log 审计
- 失败重试仍由 BullMQ 控制（V1.2 §四.4.1 M0.5-2 行为保持）

> **M0.5-4 阶段暂未串联**，待 M5 联调时改写 notification.queue.ts 调用 integration service。

## 十二、已知限制 / 后续切片

| 限制 | 后续切片 | 优先级 |
|---|---|---|
| ocr / map adapter 未实现 | M0.5-5 AI 底座 | P0 |
| LLM adapter mock（无真实 API）| M0.5-5 接 OpenAI / DeepSeek | P0 |
| SMS / Email adapter mock | M0.5-5 接真实 SDK | P0 |
| e-签宝 mock | M0.5-5 接 e-签宝 SDK | P1 |
| Adapter 未提供超时配置（默认无限等待）| M0.5-5 增强 | P2 |
| 没有"重试 + 指数退避"机制（依赖调用方 BullMQ）| 已统一 | ✓ |
| config 字段未自动加密（需 M0.5-3 调用方配合）| M5 联调 | P2 |

## 十三、版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| V1.0 | 2026-08-25 | 初稿，2 张表 + IAdapter 接口 + 4 mock adapter + 9 API + 15 测试 |
