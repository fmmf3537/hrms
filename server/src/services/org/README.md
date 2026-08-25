# M1-A1 + M1-A2：组织架构与员工档案

> **范围**：法人 / 部门树 / 编制预警 + 员工档案 CRUD + AI OCR  
> **文档**：`docs/HRMS-V1.2.md` §二.2.1 / §二.2.2 / §四.5.1  
> **依赖**：M0.5-2 通知 · M0.5-3 加密 · M0.5-4 LLM · M0.5-6 配置中心

## 业务说明

### A1 组织架构
- 多法人（`companies`）：XACH / XACX / SCXH 等
- 部门树（`departments`）：同法人内编码唯一，**最多 4 级**
- 编制预警：在职人数 > 编制 × `configs.headcount.warning_ratio`（默认 1.1）

### A2 员工档案
- 8 类信息：基础 / 联系 / 教育 / 工作 / 合同 / 资质 / 银行卡 / 社保公积金
- 工号自动生成：`configs.employee_no.format`，fallback `{company_code}{year}{seq:4}`
- 合同到期预警天数：`configs.contract.warning_days`（默认 [30,15,7]）
- 资质预警：`configs.certificate.warning_days`（默认 60）
- 敏感字段加密：`idCard` / `bankCard` / `phone` / `emergencyContactPhone` → `cryptoService.encrypt`

## 数据模型（简图）

```
Company 1──* Department 1──* Employee
                │                 │
                └── parentId      ├── EmployeePositionHistory
                                  └── EmployeeSalaryHistory
```

## API 端点（25）

| 模块 | 前缀 | 数量 |
|---|---|---|
| Company | `/api/companies` | 7 |
| Department | `/api/departments` | 8 |
| Employee | `/api/employees` | 10 |

详见 `docs/api-spec.md` §3.5–3.7 · `docs/openapi.yaml`。

## 业务规则（configService）

| category | key | 默认值 |
|---|---|---|
| employee_no | format | `{company_code}{year}{seq:4}` |
| contract | warning_days | `[30,15,7]` |
| certificate | warning_days | `60` |
| headcount | warning_ratio | `1.1` |
| probation | months | `3` |

读取失败时使用上述 fallback，并带 `TODO: move to configService` 注释路径（值本身已优先走 config）。

## M0.5 集成点

| 能力 | 调用 |
|---|---|
| 加密 | `crypto.service.encrypt/decrypt` |
| 通知 | `notification.service.sendNotification`（合同到期，失败不阻断建档） |
| LLM/OCR | `integration.service.send({ code: 'llm', ... })` |
| 配置 | `config.service.getValue` |
| 审计 | `audit.service.auditLog`（CREATE/UPDATE/DELETE） |

## 错误码（7xxxx）

- Company：71001–71004  
- Department：71101–71106  
- Employee：71201–71206  

## 测试覆盖

新建单测 **38** 个（不改动 M0/M0.5 旧用例）：

| 文件 | 用例数 |
|---|---|
| company.service.test.ts | 8 |
| department.service.test.ts | 10 |
| employee.service.test.ts | 14 |
| employeeAI.service.test.ts | 6 |

合计服务端：**178**（140 旧 + 38 新）。

## 已知限制 / 后续 A3–A7

- 本切片**不做**入职审批流、转正、调动、离职、合同电子签（A3–A7）
- OCR 生产 SDK 仍走 LLM mock；真实腾讯云 OCR 待配密钥
- 编制预警为查询态 API，未挂独立 BullMQ cron（可在 M5 联调补）
- `EmployeePositionHistory` / `EmployeeSalaryHistory` 已建表：A1+A2 创建员工时写入首条；调动/调薪写入留给 A4/A5
