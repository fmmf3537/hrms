# M1-A6：离职流程

> **范围**：离职申请 → 工作交接 → 审批 → 账号禁用 → 离职证明（mock）  
> **文档**：`docs/HRMS-V1.2.md` §二.2.3 离职 7 步 + SOP  
> **依赖**：M1-A1~A4 + M0.5-1/2/6

## 业务说明（7 步）

1. 提交离职申请（active 员工）→ `handover_pending` + 5 交接任务  
2. 部门负责人确认交接 → 提交审批  
3. 审批通过 → `employee.status=resigned` + 账号禁用策略  
4. 薪资结算 / 社保减员 → **留 M4**  
5. 离职证明 mock HTML+水印 → `certificate_issued`（**不接 e-签宝，留 A7**）  
6. 档案归档元数据（`archiveRetentionYears`）  
7. 离职 1 年后档案访问仅 admin/hr（`checkArchiveAccess`）

## 状态机

```
create → handover_pending → confirmHandover → submitted
                                    ↓
                              confirm / reject
                                    ↓
                         approved → issueCertificate → certificate_issued
                              ↘ rejected
handover_pending / submitted → cancel → cancelled
```

## 数据模型

```
Employee ──► OffboardingRecord 1──* HandoverTask
                    │
                    ├──► User.status=disabled (optional)
                    └──► uploads/.../OFFBOARD-*.html
```

## 6 端点

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/offboarding` | 创建申请 |
| GET | `/api/offboarding` | 列表 |
| GET | `/api/offboarding/:id` | 详情 |
| POST | `/api/offboarding/:id/confirm-handover` | 确认交接 |
| POST | `/api/offboarding/:id/cancel` | 取消 |
| POST | `/api/offboarding/:id/issue-certificate` | 签发证明 |

## 业务规则（configService）

| key | 默认 |
|---|---|
| offboarding.handover_template | 5 项交接 |
| offboarding.approval_flow_key | `offboarding:offboarding_approval` |
| offboarding.account_disable_strategy | `on_resignation_date` |
| offboarding.certificate_number_format | `OFFBOARD-{year}{seq:4}` |
| archive.years | `5` |
| offboarding.archive_access_after_1y | `['admin','hr']` |

## 集成（零跨 service import）

仅 import：`approval` / `audit` / `config` / `notification` + `prisma`。

员工状态 / 账号禁用走 `prisma.employee.update` / `prisma.user.update`。  
通知走 `bypassTemplate` fallback（同 A4）。

## 测试

新建 **21** 用例，合计 **234**。旧用例未改。

## 已知限制

- 薪资结算 / 社保减员 → M4  
- e-签宝正式签章 → A7  
- 邮箱归档 → 独立任务  
- `on_resignation_date` 定时禁用 → BullMQ 独立任务（A6 仅记录）
