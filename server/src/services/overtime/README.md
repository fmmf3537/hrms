# M2-B4：加班管理

> **范围**：加班申请 + 补偿二选一（pay/comp）+ 上限校验 + 审批流  
> **文档**：`docs/HRMS-V1.2.md` §二.3.3 加班管理 + §四.6.1 B4 切片  
> **依赖**：M1 全部 + M0.5-1/2/6 + employee_salary_history（加班费计算）

## 业务说明

- **事前申请**：注明加班事由 + 预计时长，至少提前 4 小时
- **补偿二选一**：`pay`（加班费按倍数）/ `comp`（调休 1:1，totalHours/8 天）
- **上限**：单日 ≤3h / 单月 ≤36h（configs.overtime）
- **审批流**：`overtime:overtime_approval`（config 可配，seed 默认 `overtime:overtime_default`）

## 状态机

```
draft → createOvertimeRequest → submitted → confirmOvertimeRequest → approved
                              ↓ reject                    rejected
submitted/draft → cancelOvertimeRequest → cancelled
```

## 3 端点

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/overtime/requests` | 提交加班 |
| GET | `/api/overtime/requests` | 列表 |
| POST | `/api/overtime/requests/:id/cancel` | 撤回 |

## 业务规则（configService）

| key | 默认 |
|---|---|
| overtime.max_daily_hours | 3 |
| overtime.max_monthly_hours | 36 |
| overtime.pay_multiplier_weekday | 1.5 |
| overtime.pay_multiplier_weekend | 2.0 |
| overtime.pay_multiplier_holiday | 3.0 |
| overtime.approval_flow_key | overtime:overtime_approval |
| overtime.min_advance_hours | 4 |

## 加班费公式

`baseSalary / 21.75 / 8 * totalHours * multiplier`

## 集成

仅 import：`approval` / `audit` / `config` / `notification` + `prisma`。  
**不 import leave.service**，**不实现调休余额累计**（留 B6 或独立任务）。

## 错误码（72101-72110）

72101 不存在 / 72102 时间非法 / 72103 超日上限 / 72104 超月上限 / 72105 非 submitted / 72106 不可撤回 / 72107 补偿非法 / 72108 未提前 / 72109 重叠 / 72110 加班费计算失败

## 测试

新建 **23** 用例，合计 **359**（336 旧用例未改）。

## 已知限制

- 调休余额累计 → B6 月度汇总或独立任务
- 法定假日判定 → 二期（B4 仅 weekday/weekend）
- BullMQ 加班预警 → 独立任务
- **未修改 leave.service.ts calculateLeaveBalance**

## 后续 B5-B6

B5 出差 → B6 月度汇总（从 overtime_requests 聚合 comp 调休）
