# M2-B3：请假

> **范围**：8 类假期 + 额度 service 计算 + 2 级审批流 + 余额校验  
> **文档**：`docs/HRMS-V1.2.md` §二.3.3 假勤管理 + §四.6.1 B3 切片  
> **依赖**：M1 全部 + M0.5-1/2/6 + employees.hireDate

## 业务说明

- **8 类假期**：annual / sick / personal / compensatory / marriage / maternity / paternity / bereavement
- **审批流**：≤3 工作日 → `leave:leave_short`；>3 工作日 → `leave:leave_long`
- **余额**：`calculateLeaveBalance` service 函数计算，**不建 leave_balances 表**
- **调休**：B3 返回 0 余额（留 B4 加班累计后接入）

## 状态机

```
draft → createLeaveRequest → submitted → confirmLeaveRequest → approved
                              ↓ reject                    rejected
submitted/draft → cancelLeaveRequest → cancelled
```

## 5 端点

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/leaves/requests` | 提交请假 |
| GET | `/api/leaves/requests` | 列表 |
| GET | `/api/leaves/requests/:id` | 详情 |
| POST | `/api/leaves/requests/:id/cancel` | 撤回 |
| GET | `/api/leaves/balance` | 余额查询 |

## 业务规则（configService）

| key | 默认 |
|---|---|
| leave.types | 8 类枚举 |
| leave.annual_leave_rules | 5/10/15 按工龄 |
| leave.comp_leave_validity_months | 6 |
| leave.approval_flow_short / long | 审批流 key |
| leave.max_consecutive_days | 30 |
| leave.min_advance_days_annual | 7 |
| leave.workday_exclude_weekends | true |

## 集成

仅 import：`approval` / `audit` / `config` / `notification` + `prisma`。

## 错误码（72001-72010）

72001 不存在 / 72002 日期非法 / 72003 类型非法 / 72004 余额不足 / 72005 重叠 / 72006 非 submitted / 72007 不可撤回 / 72008 超长 / 72009 年假未提前 / 72010 余额计算失败

## 测试

新建 **22** 用例，合计 **336**（314 旧用例未改）。

## 已知限制

- 调休余额 → B4
- BullMQ 年假重置 / 调休清理 → 独立任务
- 余额不持久化表

## 后续 B4-B6

B4 加班累计调休 → B6 月度汇总聚合 leave_requests
