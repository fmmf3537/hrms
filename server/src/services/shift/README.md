# M2-B1：班次定义与排班（M2 首个切片）

> **范围**：班次模板定义 + 月排班批量分配 + 排班冲突检测  
> **文档**：`docs/HRMS-V1.2.md` §二.3.2 排班管理 + §四.6.1 B1 切片  
> **依赖**：M1 全部 + M0.5-2/6（通知 + 配置中心）

## 业务说明

- **3 类工时制**：standard（标准）/ comprehensive（综合）/ flexible（不定时）
- **班次字段**：名称、上下班时间、午休、有效日期、弹性时间
- **排班粒度**：B1 实现按月模板批量分配（员工 / 部门）
- **冲突检测**：连续工作 ≤6 天、最小休息间隔 ≥12 小时、同范围不可重复分配
- **B1 不做**：打卡（B2）、请假/加班/出差（B3-B5）、月度汇总（B6）、调班申请

## 状态机

```
draft ──(HR 激活)──► active ──(archiveShift)──► archived
  │                      │
  └──── 可编辑 ──────────┘
archived：不可编辑，不可再分配
```

## 数据模型

```
Company ──► ShiftTemplate ──► ShiftAssignment
                  │                  ├── employeeId（互斥）
                  │                  └── departmentId（互斥）
                  └── 3 类 shiftType
Employee / Department（A1+A2 已有，B1 仅 prisma 关联）
```

## 5 端点

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/shifts` | 创建班次模板（draft） |
| GET | `/api/shifts` | 列表（分页 + 过滤） |
| GET | `/api/shifts/:id` | 详情（含 company + assignmentCount） |
| PUT | `/api/shifts/:id` | 更新；`status='archived'` 触发归档 |
| POST | `/api/shifts/assignments` | 批量排班 |

**不暴露端点**：`archiveShift`（经 PUT status）、`cancelAssignment`（留 B6）

## 业务规则（configService）

| key | 默认 | B1 使用 |
|---|---|---|
| shift.types | `['standard','comprehensive','flexible']` | ✓ |
| shift.default_work_hours | `8` | — |
| shift.break_duration | `90` | ✓ |
| shift.flex_minutes | `30` | ✓ |
| shift.assignment_strategy | `department` | — |
| shift.max_consecutive_days | `6` | ✓ |
| shift.min_rest_hours | `12` | ✓ |
| shift.late_threshold | `30` | B2 |
| shift.early_leave_threshold | `30` | B2 |

## 集成（零跨 service import）

仅 import：`audit` / `config` / `notification` + `prisma`（approval 预留未调用）。

- 员工/部门/公司：`prisma.employee.findFirst` / `prisma.department.findUnique` / `prisma.company.findUnique`
- 通知：`bypassTemplate` fallback（同 A4/A5/A6/A7）
- 审计：create / update / archive / assign 全写 audit_logs（actor_type=USER）

## 错误码（71801-71810）

| code | 场景 |
|---|---|
| 71801 | 班次不存在 |
| 71802 | 编码重复 |
| 71803 | 时间/状态非法 |
| 71804 | 午休不在工作时间内 |
| 71805 | 弹性时间 >60 分钟 |
| 71806 | 生效日期非法 |
| 71807 | 归档时仍有 active 分配 |
| 71808 | 同范围重复分配 |
| 71809 | 排班冲突（连续天/休息间隔） |
| 71810 | shiftType / assigneeType 非法 |

## 测试

新建 **17** 用例（`shift.service.test.ts`），合计 **293**（276 旧用例未改）。

覆盖：createShift 校验链、archiveShift、assignShifts、validateShiftAssignmentConflict。

## 已知限制

- **打卡 / 迟到早退判定** → B2（late_threshold / early_leave_threshold 已 seed）
- **BullMQ 每日 02:00 全公司冲突扫描** → 独立任务（B1 仅暴露 `validateShiftAssignmentConflict`）
- **调班申请** → B3 或 B6
- **cancelAssignment** → 内部函数，不暴露端点

## 后续 B2-B6

| 切片 | 集成点 |
|---|---|
| B2 打卡 | 读取 ShiftAssignment 判定应出勤时段 |
| B3 请假 | 调班申请子功能 |
| B6 月度汇总 | 调用 validateShiftAssignmentConflict + cancelAssignment |
