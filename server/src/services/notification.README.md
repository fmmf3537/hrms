# M0.5-2 消息通知基础设施

> **阶段**：M0.5（第 2 周）· **工时**：2.5d
> **依赖**：M0 脚手架（已完成）+ M0.5-1 审批流（已实现，联动使用）
> **被依赖**：M0.5-3/4/5 公共切片 + M1-M4 所有需要发送通知的业务场景
> **关联文档**：[`docs/HRMS-V1.2.md`](../../../docs/HRMS-V1.2.md) §四.4.1 M0.5-2 · [`docs/error-codes.md`](../../../docs/error-codes.md) §3xxxx · [`docs/openapi.yaml`](../../../docs/openapi.yaml) `paths/notifications`

## 一、目标

为 M1-M4 业务模块（合同到期 / 审批待办 / 审批通过 / 审批驳回 / 工资条 / 调基提醒 / 等）提供**统一、可配置、异步重试**的通知发送能力。

**核心问题**：每个业务模块都自己写"发邮件/短信"逻辑，重复且无法保证可靠性（发送失败无人重试）。

**本切片提供**：2 张表 + 3 通道 adapter + BullMQ 队列 + 11 个 REST API，业务模块只调 `sendNotification()`，不用关心底层。

## 二、数据模型

2 张表（迁移：`server/prisma/migrations/20260825020000_add_notifications/`）：

```
NotificationTemplate (模板)
├── key + channel（唯一）
├── subject / contentTemplate (Handlebars)
├── variables (JSON schema 描述)
├── enabled / deletedAt
└── 1:N → NotificationLog

NotificationLog (发送日志)
├── templateId / templateKey (冗余)
├── userId / channel
├── status: pending | sent | failed
├── subject / content (渲染后)
├── retryCount / lastError
├── sentAt / readAt
└── data (JSON: 渲染时使用的变量)
```

## 三、三种通道

| 通道 | 实现 | 适用 |
|---|---|---|
| `in_app`（站内信）| 写 notification_log 即为发送成功 | 默认通道，所有应用内提醒 |
| `email`（邮件）| M0.5-2: console.log 模拟 / M0.5-4: nodemailer + SMTP | 合同到期、调薪通知、工资条 |
| `sms`（短信）| M0.5-2: console.log 模拟 / M0.5-4: 阿里云/腾讯云 SMS SDK | 验证码、紧急提醒 |

**M0.5-2 阶段**：邮件/短信走 `console.log` mock（仅 dev/test 生效）；生产环境 `NODE_ENV=production` 时直接抛错（强制要求 M0.5-4 接入真实服务）。

## 四、Handlebars 模板

支持：
- `{{name}}` 变量替换
- `{{#if}}` 条件
- `{{#each}}` 循环
- `{{> partial}}` 引用子模板（**生产禁用**）
- 所有 Handlebars 内置 helper

M0.5-2 阶段仅实现基本用法，复杂逻辑 M3+ 再扩展。

## 五、API 端点（11 个）

### 用户侧（4）
| Method | Path | 描述 |
|---|---|---|
| GET | `/notifications` | 我的通知列表（支持 unreadOnly / channel / 分页）|
| GET | `/notifications/unread-count` | 未读数 |
| POST | `/notifications/:id/read` | 标记已读 |
| POST | `/notifications/read-all` | 全部已读 |

### 主动发送（1）
| Method | Path | 描述 |
|---|---|---|
| POST | `/notifications/send` | 主动发送（admin/HR，模板或 bypass）|

### 模板管理（4）
| Method | Path | 描述 |
|---|---|---|
| GET | `/notifications/templates` | 模板列表 |
| POST | `/notifications/templates` | 创建模板 |
| PUT | `/notifications/templates/:id` | 更新模板 |
| DELETE | `/notifications/templates/:id` | 软删除模板 |

详细请求/响应：[`openapi.yaml`](../../../docs/openapi.yaml) `paths/notifications`

## 六、失败重试机制

- BullMQ 默认 3 次重试（`attempts: 3`）
- 指数退避：`2s → 4s → 8s`（`backoff: { type: 'exponential', delay: 2000 }`）
- 重试过程：
  1. 第 1 次失败 → 写 `retryCount=1, lastError=xxx`，BullMQ 等 2s 重试
  2. 第 2 次失败 → 写 `retryCount=2`，BullMQ 等 4s 重试
  3. 第 3 次失败 → 写 `retryCount=3, status=failed`，不再重试
- 失败记录保留 5000 条用于排查（`removeOnFail: { count: 5000 }`）

## 七、错误码

详见 [`error-codes.md`](../../../docs/error-codes.md) §3xxxx 段位：

| 错误码 | 含义 |
|---|---|
| 30101 | NOTIFICATION_TEMPLATE_NOT_FOUND（模板不存在或停用）/ NOTIFICATION_TEMPLATE_INVALID（语法错）|
| 30102 | NOTIFICATION_RENDER_FAILED（Handlebars 渲染失败）|
| 30110 | SMS_PROVIDER_ERROR（短信服务商失败，已自动重试）|
| 30111 | EMAIL_PROVIDER_ERROR（邮件 SMTP 失败，已自动重试）|
| 30112 | NOTIFICATION_QUEUE_DOWN（BullMQ 队列不可用）|
| 30120 | DATA_PERMISSION_DENIED（标记他人通知为已读）|

## 八、业务联动示例

**合同到期预警**（M1 A2 员工档案会用到）：

```typescript
// 1. 每天 02:00 BullMQ 定时任务扫描 contracts
const expiringContracts = await prisma.contract.findMany({
  where: { endDate: { lte: addDays(new Date(), 30) } },
});

// 2. 批量发送合同到期提醒
for (const contract of expiringContracts) {
  const daysRemaining = differenceInDays(contract.endDate, new Date());
  await notificationService.sendNotification({
    templateKey: 'contract_expiring:email',
    userId: contract.employee.userId,
    data: {
      employee_name: contract.employee.name,
      contract_type: contract.type,
      end_date: formatDate(contract.endDate),
      days_remaining: daysRemaining,
    },
  });
}
```

**审批通过/驳回通知**（M0.5-1 + M0.5-2 联动，M1 A6 请假会用到）：

```typescript
// approval.service.ts 的 approve/reject 流程末尾
await notificationService.sendNotification({
  templateKey: 'approval_approved:in_app', // 或 ':email'
  userId: instance.initiatorId,
  data: {
    title: instance.title,
    approved_by: req.user.username,
    approved_at: new Date().toISOString(),
  },
});
```

## 九、Seed 默认模板

7 个默认模板（已在 `prisma/seed.ts`）：

| Key | Channel | 用途 |
|---|---|---|
| contract_expiring | email | 合同到期邮件 |
| contract_expiring | in_app | 合同到期站内信 |
| approval_pending | in_app | 审批待办 |
| approval_approved | in_app | 审批通过站内信 |
| approval_approved | email | 审批通过邮件 |
| approval_rejected | in_app | 审批驳回站内信 |
| approval_rejected | email | 审批驳回邮件 |

## 十、测试覆盖（20 个新增）

| 场景 | 测试数 |
|---|---|
| 模板发送（合法 / channel 解析 / 模板不存在 / 语法错 / bypass）| 5 |
| 标记已读（基本 / 幂等 / 非本人 / log 不存在）| 4 |
| 全部已读 | 1 |
| 列表（基本 / unreadOnly / channel 过滤）| 3 |
| 未读数 | 1 |
| 模板 CRUD（create / 语法错 / list / update / delete）| 5 |
| 批量发送 | 1 |
| **合计** | **20** |

`pnpm --filter hrms-server test`：71/71 通过

## 十一、已知限制 / 后续 M0.5 切片

| 限制 | 后续切片 | 优先级 |
|---|---|---|
| 邮件/短信 console.log 模拟（生产抛错）| M0.5-4 接入 nodemailer / 阿里云短信 | P0 |
| 没有"定时任务"自动发（如合同到期）| M0.5-4 BullMQ scheduler 集成 | P1 |
| 模板不支持"循环 + 条件 + 中文变量"等高级 Handlebars | 已支持（Handlebars 完整功能）| ✓ |
| 没有模板预览接口 | M5 联调时按需加 | P3 |
| 用户偏好（关闭某类通知）| 二期 ESS | P3 |

## 十二、版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| V1.0 | 2026-08-25 | 初稿，2 张表 + 1 queue + 3 adapter + 11 API + 20 测试 |
