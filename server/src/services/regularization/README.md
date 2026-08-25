# M1-A4：转正流程

> **范围**：试用期转正申请 → 3 级审批 → 员工转正 + 薪资历史  
> **文档**：`docs/HRMS-V1.2.md` §二.2.3 / §四.5.1 A4  
> **依赖**：M1-A1+A2 + M1-A3 + M0.5-1/2/6（审批/通知/配置）

## 业务说明

HR 代试用期员工创建转正草稿；提交后走 3 级审批（部门负责人 → HR → 总经理）。审批通过后：

1. `employees.status`：`probation` → `active`（prisma 直接 update）
2. 若有 `newBaseSalary`：写入 `employee_salary_history`（次月 1 日生效）
3. 发送转正确认通知

## 状态机

```
draft ──submit──► submitted ──confirm──► approved
  │                    │
  │                    └──reject──► rejected
  └─cancel─────────────┴──cancel──► cancelled
```

不可跳级（如 draft → approved → 71403）。已批准不可取消（71408）。

## 数据模型（简图）

```
Employee (probation)
    │
    ▼
RegularizationRecord ──approval──► ApprovalInstance
    │
    │ (approved)
    ├──► Employee.status = active
    └──► EmployeeSalaryHistory (optional)
```

无 Prisma 反向 relation（避免改 A1+A2 Employee model）。

## 4 端点

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/regularizations` | 创建草稿 |
| GET | `/api/regularizations` | 列表 |
| GET | `/api/regularizations/:id` | 详情 |
| POST | `/api/regularizations/:id/cancel` | 取消/撤回 |

`submit` / `confirm` / `reject` / `listUpcoming` 为 service 导出（审批回调 / BullMQ 调用），不单独暴露 HTTP。

## 业务规则（configService）

| category.key | 默认 |
|---|---|
| probation.months | `3` |
| probation.remind_days | `15` |
| regularization.approval_flow_key | `regularization:regularization_approval` |
| regularization.salary_effective | `next_month` |
| regularization.approval_nodes | `['department_leader','hr','ceo']` |

## 集成点（零重写）

| 能力 | 调用 |
|---|---|
| 审批 | `approval.submitApproval` / `withdraw` |
| 通知 | `notification.sendNotification`（bypassTemplate fallback） |
| 配置 | `configService.getValue` |
| 审计 | `auditService.auditLog` |
| 员工状态 | `prisma.employee.update`（**不** import employee.service） |
| 薪资历史 | `prisma.employeeSalaryHistory.create` |

## 错误码（714xx）

71401–71409（见 service JSDoc）

## 测试覆盖

新建 **18** 个用例，不改动旧 195 个。合计 **213**。

## 已知限制

- BullMQ 定时提醒不在 A4；仅提供 `listUpcomingRegularizations`
- 自动调薪比例留给 M4
- `notification.service` 无 `TEMPLATE_KEYS`，未改该文件；通知用 bypassTemplate + TODO
- 提交/确认走 service 导出，HTTP 仅 4 端点（按契约）

## 后续

A6 离职 → A5 调动 → A7 合同
