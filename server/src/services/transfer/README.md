# M1-A5：调动流程

> **范围**：调动申请 → 4 级审批 → 部门/岗位/薪资联动  
> **文档**：`docs/HRMS-V1.2.md` §二.2.3 调动流程  
> **依赖**：M1-A1~A4 + A6 + M0.5-1/2/6

## 业务说明

- 调动类型：平调（`transfer`）/ 晋升（`promote`）/ 降职（`demote`）
- 4 级审批：调出部门负责人 → 调入部门负责人 → HR → 总经理
- 生效日到达后更新：部门、岗位历史、薪资历史（**权限重算留二期**）

## 状态机

```
draft → submitTransfer → submitted
              ↓
        confirm / reject
              ↓
         approved / rejected
draft / submitted → cancel → cancelled
```

## 数据模型

```
Employee ──► TransferRecord
     │
     ├──► employee_position_history（changeType: transfer/promote/demote）
     └──► employee_salary_history（changeType: transfer，可选）
```

## 5 端点

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/transfers` | 创建调动草稿 |
| GET | `/api/transfers` | 列表 |
| GET | `/api/transfers/:id` | 详情 |
| POST | `/api/transfers/:id/update` | 更新草稿 |
| POST | `/api/transfers/:id/cancel` | 取消 |

审批通过/拒绝由 `approval` 回调触发 `confirmTransfer` / `rejectTransfer`（无独立 HTTP 端点）。

## 业务规则（configService）

| key | 默认 |
|---|---|
| transfer.approval_flow_key | `transfer:transfer_approval` |
| transfer.approval_nodes | `['from_dept_leader','to_dept_leader','hr','ceo']` |
| transfer.salary_effective | `immediate` |
| transfer.requires_salary_for_promote | `true` |
| transfer.max_future_days | `90` |

## 集成（零跨 service import）

仅 import：`approval` / `audit` / `config` / `notification` + `prisma`。

- 员工部门变更：`prisma.employee.update`
- 岗位历史：`prisma.employeePositionHistory.create`
- 薪资历史：`prisma.employeeSalaryHistory.create`
- 通知：`bypassTemplate` fallback（同 A4/A6）

## 测试

新建 **21** 用例，合计 **255**（234 旧用例未改）。

## 已知限制

- **权限重算留二期**（ESS 或独立任务）
- **未来生效日 BullMQ 调度留独立任务**（`listUpcomingTransfers` 仅暴露查询）
- `effectiveDate > today` 时部门更新写 audit `expectedUpdateAt`，不立即改 employee
- `salary_effective=next_month` 时仅写薪资历史，不更新 employee 表（员工表无薪资字段）

## 后续

- A7 合同管理（电子签集成）
