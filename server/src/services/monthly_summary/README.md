# M2-B6 月度考勤汇总（Monthly Summary）

> V1.2 §二.3.4 考勤汇总 + §四.6.1 B6 切片 | **M2 收尾切片**

## 业务说明

每月生成上月考勤汇总报表，员工在线确认，HR 锁定后数据进入 M4 薪酬核算流程。

| 阶段 | 规则（configs） | B6 实现 |
|---|---|---|
| 自动生成 | `summary.auto_generate_day`（默认 1 日） | 暴露 `generateMonthlySummary`；**BullMQ 调度留独立任务** |
| 员工确认 | `summary.employee_confirm_deadline`（默认 3 日前） | `confirmMonthlySummary` |
| HR 锁定 | `summary.hr_lock_day`（默认 5 日） | `lockMonthlySummary` |
| 逾期策略 | `summary.default_confirm_strategy` | 配置读取；自动逾期确认留 BullMQ |

## 状态机

```
draft → employee_confirmed → hr_locked
```

不可跳级；锁定后不可修改（72310）。

## 报表字段

| 字段 | 来源 | 聚合规则 |
|---|---|---|
| workDays | attendance_records | status=approved 且 clockInTime 非空，按日去重 |
| lateCount / earlyLeaveCount / missingCount | attendance_records | isLate / isEarlyLeave / isMissing 计数 |
| leaveDays / leaveHours | leave_requests | approved 的 totalDays 求和；hours = days × 8 |
| overtimeHours | overtime_requests | approved 的 totalHours 求和 |
| tripDays | business_trips | approved 的 totalDays 求和 |
| **compBalance** | overtime + leave | **B6 独立 `calculateCompBalance`** |

## B6 关键设计：调休余额

**红线约束**：

- **不 import** `leave.service`
- **不修改** `leave.service.calculateLeaveBalance`
- **不复制** leave 额度逻辑

`calculateCompBalance(employeeId, year, month)`：

1. `overtime_requests`：approved + compensationType=`comp` → 累计 compDays（或 totalHours/8）
2. `leave_requests`：approved + leaveType=`compensatory` → 累计 totalDays
3. balance = (1) - (2)，负数 clamp 到 0

## API 端点（4）

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| POST | `/api/monthly-summaries/generate` | summary:lock | HR 手动生成 |
| GET | `/api/monthly-summaries` | summary:read | 员工查自己 / HR 查公司 |
| POST | `/api/monthly-summaries/:id/confirm` | summary:read | 员工确认 |
| POST | `/api/monthly-summaries/:id/lock` | summary:lock | HR 锁定 |

## 业务规则（configs）

| 键 | 默认 |
|---|---|
| summary.auto_generate_day | 1 |
| summary.employee_confirm_deadline | 3 |
| summary.hr_lock_day | 5 |
| summary.default_confirm_strategy | auto_confirm |
| summary.work_days_per_month | 21.75 |

## 集成点

- M0.5-2 通知：`sendNotification` + bypassTemplate
- M0.5-6 配置：`configService.getValue('summary', *)`
- M0.5-8 审计：generate / confirm / lock
- B1-B5 数据：**仅 prisma 只读**，不 import 跨 service

## 错误码（72301-72310）

见 `docs/error-codes.md` 72 段位 B6 子区。

## 测试

`monthly_summary.service.test.ts` — 22 个用例（378 → 400）。

## 已知限制

- BullMQ 每月 1 日自动生成：留独立任务
- 报表导出 PDF/Excel：二期
- 调休有效期 6 个月：`leave.comp_leave_validity_months` 配置存在，B6 按月聚合未做有效期扣减

## M2 收尾

B6 为 M2 考勤假勤最后切片。下一阶段：**M3 绩效管理**（V1.2 §四.7 D1-D6）。
