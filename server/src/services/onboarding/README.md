# M1-A3：入职流程

> **范围**：入职草稿 → 审批 → 建档开户  
> **文档**：`docs/HRMS-V1.2.md` §二.2.3 / §四.5.1 A3  
> **依赖**：M1-A1+A2 + M0.5-1/2/3/5/6/7（OCR/审批/通知/加密/配置）

## 业务说明

HR 发起入职登记（草稿），OCR 收集身份证/银行卡/资质，材料齐全后提交审批；审批通过后自动：

1. 生成工号（与 A2 算法一致）
2. 创建 `employees` 档案（敏感字段已加密）
3. 创建 `users` 账号（`mustChangePassword=true`）
4. 写入岗位/薪资历史首条
5. 发送入职确认通知

## 状态机

```
draft ──submit──► submitted ──confirm(approved)──► approved
  │                    │
  └─cancel─────────────┴──reject/cancel──► cancelled
```

不可跳级（如 draft → approved → 71303）。

## 数据模型（简图）

```
Company / Department
        │
        ▼
OnboardingRecord 1──* OnboardingTask
        │
        │ (approved)
        ▼
   Employee + User
```

## 5 端点

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/onboarding` | 创建草稿 + 4 引导任务 |
| GET | `/api/onboarding` | 列表 |
| GET | `/api/onboarding/:id` | 详情 |
| POST | `/api/onboarding/:id/parse-ocr` | OCR 三合一 |
| POST | `/api/onboarding/:id/confirm` | 提交审批；`approved` 时为回调 |

取消/驳回为 service 内部能力，不单独暴露端点。

## 业务规则（configService）

| category.key | 默认 |
|---|---|
| onboarding.required_materials | `['idCard','bankCard','degreeCert']` |
| onboarding.checklist | `['设备发放','工位安排','导师分配','培训安排']` |
| onboarding.default_role | `employee` |
| onboarding.default_password_pattern | `Welcome@{seq4}` |
| employee_no.format | `{company_code}{year}{seq:4}` |
| probation.months | `3` |

## M0.5 + A1+A2 集成（零重写）

| 能力 | 调用 |
|---|---|
| OCR | `employeeAI.parseIdCard / parseBankCard / parseCertificate` |
| 审批 | `approval.submitApproval` / `withdraw`（flowKey=`onboarding:onboarding_approval`） |
| 通知 | `notification.sendNotification` |
| 加密 | `crypto.encrypt` |
| 配置 | `configService.getValue` |
| 审计 | `auditService.auditLog` |

## 错误码（713xx）

71301–71310（见 `docs/error-codes.md` / service JSDoc）

## 测试覆盖

新建 **17** 个用例（`onboarding.service.test.ts`），不改动旧 178 个。合计 **195**。

## 已知限制 / 后续

- 不做 A4 转正 / A5 调动 / A6 离职 / A7 合同
- 审批模板需 seed `onboarding:onboarding_approval`（测试 mock）
- 工号生成与 A2 各自一份实现，后续可抽 util
