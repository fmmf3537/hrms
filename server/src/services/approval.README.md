# M0.5-1 审批流基础设施

> **阶段**：M0.5（第 2 周）· **工时**：2.5d
> **依赖**：M0 脚手架（已完成）· **被依赖**：M1~M5 所有业务模块的审批场景
> **关联文档**：[`docs/HRMS-V1.2.md`](../../../docs/HRMS-V1.2.md) §四.4.1 M0.5-1 · [`docs/error-codes.md`](../../../docs/error-codes.md) §2xxxx · [`docs/openapi.yaml`](../../../docs/openapi.yaml) `paths/approvals`

## 一、目标

为 M1-M5 所有业务模块（请假/加班/出差/入转调离/绩效/薪酬）提供**统一、可复用、可视化配置**的审批流基础设施。

**核心问题**：每加一个业务模块都要重新写一套"审批节点流转 + 状态机 + 审批人解析 + 记录"逻辑，**重复且易错**。

**本切片提供**：3 张表 + 1 个 service + 9 个 REST API，业务模块只调 service，不用关心底层。

## 二、数据模型

3 张表（迁移：`server/prisma/migrations/20260825010000_add_approval_flows/`）：

```
ApprovalFlow (模板)
├── category + key + version（唯一索引）
├── nodes (JSON)
├── enabled / deletedAt
└── 1:N → ApprovalInstance

ApprovalInstance (实例)
├── flowId / flowKey (冗余)
├── businessType + businessId (挂任意业务)
├── initiatorId / currentNodeId
├── status: pending | approved | rejected | withdrawn
├── data (JSON: 条件分支用)
└── 1:N → ApprovalRecord

ApprovalRecord (节点操作流水)
├── instanceId / nodeId / approverId
├── action: approve | reject | transfer | withdraw
├── fromUserId / toUserId (transfer 用)
└── comment
```

## 三、JSON 节点模板格式

每节点：

```typescript
interface ApprovalNode {
  id: string;                    // 节点唯一 ID
  type: 'sequential';            // M0.5-1 仅支持依次审批
  approverType: 'role' | 'user' | 'direct_leader' | 'department_leader';
  approverValue: string;         // 角色名 / userId / 字段名
  condition: string | null;      // 简单表达式，如 "data.leave_days > 3"
}
```

**条件表达式**支持：
- `null` / `"always"` → 永远进入
- `data.leave_days > 3`（数字大于）
- `data.leave_days < 3`（数字小于）
- `data.leave_type == 'annual'`（字符串等于）
- `data.leave_type != 'sick'`（字符串不等于）

M3+ 升级为 jsonata 或 jmespath 支持复杂表达式。

## 四、API 端点（9 个）

| Method | Path | 鉴权 | 描述 |
|---|---|---|---|
| GET | `/approvals/flows` | 是 | 列出模板（可按 category 过滤）|
| GET | `/approvals/flows/by-key?category=&key=` | 是 | 按 category+key 查模板 |
| POST | `/approvals/flows` | 是（admin）| 创建模板 |
| POST | `/approvals/instances` | 是 | 提交审批（业务侧发起）|
| GET | `/approvals/instances` | 是 | 我的审批列表（待办/已办/我发起）|
| GET | `/approvals/instances/:id` | 是 | 审批详情 |
| POST | `/approvals/instances/:id/approve` | 是 | 审批通过 |
| POST | `/approvals/instances/:id/reject` | 是 | 审批驳回 |
| POST | `/approvals/instances/:id/transfer` | 是 | 转交他人 |
| POST | `/approvals/instances/:id/withdraw` | 是 | 发起人撤回 |

详细请求/响应：[`openapi.yaml`](../../../docs/openapi.yaml) `paths/approvals`

## 五、状态机

```
                    ┌──────────────┐
                    │   pending    │
                    └──┬───────┬───┘
                       │       │
                  approve    reject (任一节点)
                       │       │
                       ▼       ▼
            ┌──────────────┐  ┌──────────────┐
            │  next node   │  │  rejected    │
            │ (条件过滤)  │  └──────────────┘
            └──────┬───────┘
                   │ (无下一节点)
                   ▼
            ┌──────────────┐
            │  approved    │
            └──────────────┘

发起人随时可 withdraw：
pending → withdrawn（仅 initiatorId 允许）
```

## 六、错误码

详见 [`error-codes.md`](../../../docs/error-codes.md) §2xxxx 段位：

| 错误码 | 含义 |
|---|---|
| 20101 | APPROVAL_FLOW_NOT_FOUND（模板不存在或停用）|
| 20102 | APPROVAL_INSTANCE_NOT_FOUND（实例不存在 / 转交目标用户不存在）|
| 20103 | APPROVAL_INSTANCE_ALREADY_FINISHED（已结束的实例）|
| 20104 | APPROVAL_NOT_YOUR_TURN（非当前节点审批人）|
| 20106 | APPROVAL_TRANSFER_SELF（转给自己）|
| 20107 | APPROVAL_CONDITION_NOT_MET（条件分支全过滤）|
| 20108 | INVALID_NODE_STRUCTURE（节点结构不合法）|

## 七、业务联动示例

**请假场景（M1 A6 切片会用到）**：

```typescript
// 1. 员工提交请假
const instance = await approvalService.submitApproval({
  flowKey: 'leave:leave_default',
  businessType: 'leave',
  businessId: leaveApplication.id,
  title: `请假申请 - ${leaveApplication.startDate}`,
  initiatorId: employee.userId,
  data: { leave_days: 3, leave_type: 'annual' },
});

// 2. 直属上级通过
await approvalService.approve({
  instanceId: instance.id,
  approverId: directLeaderUserId,
  comment: '同意',
});

// 3. 后续节点 HR / 总经理依次处理 ...

// 4. 发起人撤回
await approvalService.withdraw({
  instanceId: instance.id,
  initiatorId: employee.userId,
});
```

**请假超过 3 天自动加 CEO 审批（条件分支）**：

模板节点配置（已 seed 进数据库）：

```json
[
  { "id": "step1", "type": "sequential", "approverType": "role", "approverValue": "direct_leader", "condition": null },
  { "id": "step2", "type": "sequential", "approverType": "role", "approverValue": "hr", "condition": "always" },
  { "id": "step3", "type": "sequential", "approverType": "role", "approverValue": "ceo", "condition": "data.leave_days > 3" }
]
```

- 提交 `data: { leave_days: 2 }` → 跳过 step3
- 提交 `data: { leave_days: 5 }` → 走 step3 (ceo)

## 八、测试覆盖（23 个测试）

| 场景 | 测试数 |
|---|---|
| 模板 CRUD（create / 节点空 / 节点缺字段）| 3 |
| 提交审批（条件分支 / 节点激活 / flow 不存在 / flowKey 格式错）| 4 |
| 审批通过（推进下一节点 / 全通过→approved / 5 天激活 ceo / 错审批人 / 已结束）| 5 |
| 审批驳回（驳回成功 / 流程立即结束）| 2 |
| 转交（成功写 record / 转给自己 / 目标用户不存在 / 非审批人转交）| 4 |
| 撤回（成功 / 非发起人）| 2 |
| 列表（按 role / 分页）| 2 |
| 条件求值（间接通过 submitApproval / approve 测）| 1 |

`pnpm --filter hrms-server test`：51/51 通过

## 九、已知限制 / 后续 M0.5 切片要做的事

| 限制 | 后续切片 | 优先级 |
|---|---|---|
| `direct_leader` / `department_leader` 审批人解析返回 null | M1 接 employee 表后实现 | P1 |
| `approver` 解析取"该角色的第一个 user"（多人同角色场景）| M2+ 加"或签"支持 | P2 |
| 转交后 `currentNodeId` 不变（无 `pendingApproverId` 字段）| M2+ 加字段 | P2 |
| 审批超时（24h 提醒 / 48h 升级）| M0.5-2 通知基础设施 | P0 |
| 会签 / 并行审批 | M3+ 扩展 | P3 |
| 审批驳回后的"重新发起" | M2+ 加 `reSubmit` API | P2 |

## 十、版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| V1.0 | 2026-08-25 | 初稿，3 张表 + 1 service + 9 API + 23 测试 |
