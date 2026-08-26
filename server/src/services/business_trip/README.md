# M2-B5：出差管理

> **范围**：出差申请 + 差旅补助计算 + 审批流  
> **文档**：`docs/HRMS-V1.2.md` §二.3.3 出差管理 + §四.6.1 B5 切片  
> **依赖**：M1 全部 + M0.5-1/2/6 + employees 表

## 业务说明

- **出差申请**：地点、起止日期、事由、关联项目（projectCode 字符串，**不建 projects 表**）
- **差旅补助**：`baseAmount × cityRate × levelRate × totalDays`，写入 `allowance_amount` 字段
- **M4 薪酬**：B5 仅写字段，**不调 M4 service**；工资条聚合留 M4 切片
- **GPS 打卡**：B2 `attendance_records` 已有，**B5 不联动**

## 状态机

```
draft → createBusinessTrip → submitted → confirmBusinessTrip → approved
                              ↓ reject                    rejected
submitted/draft → cancelBusinessTrip → cancelled
```

## 3 端点

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/business-trips/requests` | 提交出差 |
| GET | `/api/business-trips/requests` | 列表 |
| POST | `/api/business-trips/requests/:id/cancel` | 撤回 |

## 差旅补助公式

`allowanceAmount = allowance_standard × city_tier_rates[tier] × level_tier_rates[level] × totalDays`

## 业务规则（configService）

| key | 默认 |
|---|---|
| trip.allowance_standard | 200 元/天 |
| trip.city_tier_rates | tier1:1.5 / tier2:1.2 / tier3:1.0 |
| trip.level_tier_rates | executive:1.5 / manager:1.2 / employee:1.0 |
| trip.city_tier_mapping | 北京/上海/深圳/广州→tier1 等 |
| trip.approval_flow_key | trip:trip_approval |
| trip.min_advance_days | 3 |
| trip.weekend_inclusive | false |

## 集成

仅 import：`approval` / `audit` / `config` / `notification` + `prisma`。

## 错误码（72201-72210）

72201 不存在 / 72202 日期非法 / 72203 未提前 / 72204 非 submitted / 72205 不可撤回 / 72206 城市非法 / 72207 项目代码非法 / 72208 重叠 / 72209 补助计算失败 / 72210 城市必填

## 测试

新建 **19** 用例，合计 **378**（359 旧用例未改）。

## 已知限制

- 不联动 B2 GPS 外勤打卡
- 不调 M4 薪酬发放
- 不创建 projects 表
- BullMQ 出差预警 / 自动销差 → 独立任务

## 后续 B6

B6 月度汇总聚合 business_trips.allowance_amount
