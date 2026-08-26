# M2-B2：打卡管理

> **范围**：WiFi/GPS 打卡 + 补卡审批 + 得力 e+ Excel 导入 + 异常判定  
> **文档**：`docs/HRMS-V1.2.md` §二.3.1 打卡管理 + §四.6.1 B2 切片  
> **依赖**：M1 全部 + M0.5-1/2/6 + M2-B1 班次分配

## 业务说明

- **4 打卡方式**：wifi / gps / manual（补卡）/ imported（得力 e+ 导入）
- **异常判定**（service 层 `calculateAnomaly`）：迟到 / 早退 / 缺卡
- **补卡**：每月 ≤3 次，走 M0.5-1 审批流，状态 pending → approved/rejected
- **得力 e+**：一期仅 base64 CSV mock 解析，**不接真实 SaaS API**
- **employees 表未改**：`imported_external_id` 存在 `attendance_records` 表

## 5 端点

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/attendance/clock-in` | WiFi / GPS 打卡 |
| GET | `/api/attendance/records` | 列表（分页 + 过滤） |
| GET | `/api/attendance/records/:id` | 详情 |
| POST | `/api/attendance/manual` | 补卡申请 |
| POST | `/api/attendance/import` | 得力 e+ 导入 |

**不暴露端点**：`confirmManualClock`（审批回调内部调用）

## 业务规则（configService）

| key | 默认 |
|---|---|
| attendance.wifi_ssids | Office WiFi 白名单 |
| attendance.gps_max_distance | `100`（米） |
| attendance.late_threshold | `30`（分钟） |
| attendance.early_leave_threshold | `30` |
| attendance.missing_threshold | `4`（小时） |
| attendance.import_formats | `['deli-e-plus-v1']` |
| attendance.manual_clock_flow_key | 补卡审批流 |
| attendance.monthly_max_manual | `3` |

## 集成（零跨 service import）

仅 import：`approval` / `audit` / `config` / `notification` + `prisma`。

- 员工/部门：`prisma.employee.findFirst`
- 班次：`prisma.shiftAssignment.findFirst` + `prisma.shiftTemplate.findUnique`（**不调 shift.service**）
- 补卡审批：`approvalService.submitApproval`
- 通知：`bypassTemplate` fallback

## 错误码（71901-71910）

| code | 场景 |
|---|---|
| 71901 | 记录不存在 |
| 71902 | 重复打卡 |
| 71903 | WiFi SSID 非法 |
| 71904 | GPS 超距 |
| 71906 | 时间不合法 |
| 71907 | 导入格式不支持 |
| 71908 | 补卡非 pending |
| 71909 | 月补卡上限 |
| 71910 | clockType 非法 |

## 测试

新建 **21** 用例（`attendance.service.test.ts`），合计 **314**（293 旧用例未改）。

## 已知限制

- 得力 e+ **真实 API** → 二期
- 腾讯地图 **GPS 地址反解析** → 二期（B2 mock `gpsAddress`）
- BullMQ **每日 02:00 异常扫描** → 独立任务
- employees **external_id** → 二期（B2 用 `imported_external_id`）

## 后续 B3-B6

| 切片 | 集成点 |
|---|---|
| B3 请假 | 与缺卡/异常联动 |
| B6 月度汇总 | 聚合 attendance_records |
