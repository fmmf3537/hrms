# M1-A7：合同管理（M1 收尾）

> **范围**：合同草稿 → 审批 + 电子签 mock → 签署完成 / 到期 / 作废  
> **文档**：`docs/HRMS-V1.2.md` §二.2.4 合同管理  
> **依赖**：M1-A1~A6 + M0.5-1/2/3/6

## 业务说明

- 5 类合同模板：劳动合同 / 实习 / 顾问 / 劳务 / 保密协议
- 附件：JSON 数组 `attachmentUrl`（**不实现 multipart 上传**）
- 电子签：mock 模式（`configs.contract.esign_provider='mock'`），**不接 e-签宝真实 SaaS**
- 到期预警：30/15/7 天三级（`configs.contract.warning_days`，BullMQ 调度留独立任务）

## 状态机

```
draft → submitContract → pending_signature → signing
                              ↓ callback
                           signed → expireContract → expired
signing → rejected callback → cancelled
draft / pending_signature / signing → cancel → cancelled
```

## 数据模型

```
Employee ──► ContractRecord
                  ├── attachments (JSON URL)
                  ├── signatories (JSON)
                  └── esignFlowId (mock-*)
```

## 6 端点（5 用户 + 1 webhook）

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/contracts` | 创建草稿 |
| GET | `/api/contracts` | 列表 |
| GET | `/api/contracts/:id` | 详情 |
| POST | `/api/contracts/:id/update` | 更新草稿；`submit:true` 发起电子签 |
| POST | `/api/contracts/:id/cancel` | 取消 |
| POST | `/api/contracts/webhook/e-sign` | e-签宝 webhook（HMAC 验签） |

## 业务规则（configService）

| key | 默认 |
|---|---|
| contract.warning_days | `[30,15,7]` |
| contract.esign_provider | `mock` |
| contract.esign_api_key | 加密存储 |
| contract.esign_webhook_secret | 加密存储 |
| contract.attachment_max_size | `10485760` |
| contract.attachment_allowed_types | pdf/jpeg/png |
| contract.approval_flow_key | `contract:contract_approval` |
| contract.templates | 5 类 HTML 路径 |
| contract.expire_check_days | `7` |
| contract.test_mode | `true` |

## 集成（零跨 service import）

仅 import：`approval` / `audit` / `config` / `notification` / `crypto` + `prisma`。

- 员工查询：`prisma.employee.findFirst`
- 敏感配置：`cryptoService.decrypt`（esign_api_key / esign_webhook_secret）
- 通知：`bypassTemplate` fallback（同 A4/A5/A6）

## 测试

新建 **21** 用例，合计 **276**（255 旧用例未改）。

## 已知限制

- e-签宝真实 SaaS / SDK / OAuth → 二期
- multipart 附件上传 → 二期
- BullMQ 到期预警调度 → 独立任务（`listExpiringContracts` 仅暴露查询）

## 下一阶段

- M2 考勤假勤（V1.2 §四.6）
