# HRMS API Spec（Markdown 描述）

> **范围**：M0（已实现）+ M0.5（5 个公共模块 + AI 底座，将实现）
> **配套文件**：[`openapi.yaml`](./openapi.yaml) —— OpenAPI 3.0 规范，可加载 Swagger UI
> **关联文档**：[`HRMS-V1.2.md`](./HRMS-V1.2.md) · [错误码表](./error-codes.md) · [Mermaid 流程图](./flow-diagrams.md)

## 一、通用约定

### 1.1 Base URL

- 开发环境：`http://localhost:3000/api`
- 生产环境：`https://hrms.your-domain.com/api`

### 1.2 认证方式

- **除登录/刷新外**，所有接口需要在请求头携带：
  ```
  Authorization: Bearer <accessToken>
  ```
- accessToken 有效期 15 分钟，refreshToken 7 天
- 详见 [OpenAPI yaml SecuritySchemes](./openapi.yaml)

### 1.3 响应格式

**成功**：
```json
{
  "success": true,
  "data": { ... },
  "message": "可选"
}
```

**失败**（详见 [错误码表](./error-codes.md)）：
```json
{
  "success": false,
  "error": "人类可读错误信息",
  "code": 10110,
  "details": [ /* 可选，验证错误详情 */ ]
}
```

### 1.4 分页约定

分页查询统一参数：
- `page`：页码，从 1 开始，默认 1
- `pageSize`：每页条数，默认 20，最大 100

返回：
```json
{
  "success": true,
  "data": [ ... ],
  "total": 123,
  "page": 1,
  "pageSize": 20
}
```

### 1.5 时间格式

所有时间字段使用 ISO 8601：
- `2026-08-25T10:30:00.000Z`（带时区）
- `2026-08-25`（纯日期，无时区）

### 1.6 ID 格式

- 资源 ID：UUID v4（如 `550e8400-e29b-41d4-a716-446655440000`）
- 工号：法人代码 + 年份 + 4 位流水（如 `XACH20260001`）

## 二、模块清单

| # | 模块 | 路径前缀 | 状态 | 阶段 |
|---|---|---|---|---|
| 1 | 健康检查 | `/health` | ✅ 已实现 | M0 |
| 2 | 认证 | `/auth` | ✅ 已实现 | M0 |
| 3 | 审计日志 | `/audit-logs` | ✅ 已实现 | M0-08 |
| 4 | 审批流 | `/approval-flows` + `/approval-instances` | ⏳ M0.5-1 | M0.5 |
| 5 | 通知 | `/notifications` | ⏳ M0.5-2 | M0.5 |
| 6 | 字段加密 | `/encrypted-fields` | ⏳ M0.5-3 | M0.5 |
| 7 | 第三方对接 | `/integrations` | ⏳ M0.5-4 | M0.5 |
| 8 | AI 底座 | `/ai` | ⏳ M0.5-5 | M0.5 |

## 三、已实现接口清单

### 3.1 健康检查

| Method | Path | 鉴权 | 描述 |
|---|---|---|---|
| GET | `/health` | 否 | 健康检查端点 |

**响应**：
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-08-25T10:30:00.000Z",
    "uptime": 3600
  }
}
```

### 3.2 认证模块

| Method | Path | 鉴权 | 限流 | 描述 |
|---|---|---|---|---|
| POST | `/auth/login` | 否 | 5min/10次 | 用户登录 |
| POST | `/auth/refresh` | 否 | 1min/30次 | 刷新 accessToken（**rotation + reuse 检测**） |
| POST | `/auth/logout` | 是 | - | 登出（吊销 refreshToken） |
| GET | `/auth/me` | 是 | - | 获取当前用户信息 |
| GET | `/auth/permission-demo` | 是 | - | 联调演示（需 `salary:read` 权限） |

#### POST /auth/login

**请求体**：
```json
{
  "username": "admin",
  "password": "Admin@123"
}
```

**响应**（成功 200）：
```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "user": {
      "id": "uuid",
      "username": "admin",
      "email": "admin@hrms.local",
      "phone": null,
      "status": "active",
      "mustChangePassword": true,
      "roles": ["admin"],
      "permissions": ["*"],
      "companyId": null,
      "departmentId": null,
      "employee": null
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**错误码**：
- `10110 INVALID_CREDENTIALS`（401）—— 用户名或密码错误
- `10111 ACCOUNT_DISABLED`（403）—— 账号已停用
- `10100 INVALID_REQUEST`（400）—— 请求体格式错误
- `00005 RATE_LIMITED`（429）—— 登录尝试过多

#### POST /auth/refresh

**请求体**：
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**响应**（成功 200）：
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...（新）",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...（新，已 rotation）"
  }
}
```

**重要**：
- 每次刷新都换新 refreshToken（旧 token 立即失效）
- 必须把新 refreshToken 同步存到客户端
- 检测到旧 token 重用 → 吊销该用户所有 refreshToken + 写 FAILURE 审计

**错误码**：
- `10104 REFRESH_TOKEN_EXPIRED`（401）
- `10105 REFRESH_TOKEN_INVALID`（401）
- `10106 REFRESH_TOKEN_REUSED`（401）—— **安全事件**
- `10100 INVALID_REQUEST`（400）
- `00005 RATE_LIMITED`（429）

#### POST /auth/logout

**请求体**：
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..." // 可选
}
```

**响应**：成功 200 `{ "success": true, "message": "登出成功" }`

#### GET /auth/me

**响应**（成功 200）：
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "admin",
      "roles": ["admin"],
      "permissions": ["*"],
      ...
    }
  }
}
```

**错误码**：
- `10101 UNAUTHENTICATED`（401）
- `10102 TOKEN_EXPIRED`（401）
- `10103 TOKEN_INVALID`（401）
- `10111 ACCOUNT_DISABLED`（403）—— 禁用用户不能查自己

#### GET /auth/permission-demo

**权限要求**：`salary:read`（admin 通配符自动放行）

**响应**（成功 200）：
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "username": "admin",
    "permissions": ["*"]
  }
}
```

**错误码**：
- `10120 FORBIDDEN_ROLE`（403）
- `10121 FORBIDDEN_PERMISSION`（403）

### 3.3 审计日志模块

| Method | Path | 鉴权 | 权限 | 描述 |
|---|---|---|---|---|
| GET | `/audit-logs` | 是 | `audit:read` | 分页查询审计日志 |

#### GET /audit-logs

**查询参数**：
- `page`（默认 1）
- `pageSize`（默认 20，最大 100）
- `userId`（可选，UUID）
- `action`（可选，如 `LOGIN` / `CREATE` / `UPDATE` / `DELETE` / `EXPORT`）
- `resourceType`（可选，如 `Auth` / `Employee`）
- `from`（可选，ISO datetime）
- `to`（可选，ISO datetime）

**响应**（成功 200）：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "action": "LOGIN",
      "resourceType": "Auth",
      "resourceId": "uuid",
      "description": "用户 admin 登录成功",
      "oldValue": null,
      "newValue": null,
      "ipAddress": "127.0.0.1",
      "userAgent": "Mozilla/5.0 ...",
      "status": "SUCCESS",
      "createdAt": "2026-08-25T10:30:00.000Z"
    }
  ],
  "total": 123,
  "page": 1,
  "pageSize": 20
}
```

## 四、M0.5 即将实现接口

### 4.1 审批流（M0.5-1）

#### 4.1.1 审批流模板管理

| Method | Path | 鉴权 | 权限 | 描述 |
|---|---|---|---|---|
| GET | `/approval-flows` | 是 | admin | 列出所有审批流模板 |
| GET | `/approval-flows/:id` | 是 | admin | 获取单个模板 |
| POST | `/approval-flows` | 是 | admin | 创建审批流模板 |
| PUT | `/approval-flows/:id` | 是 | admin | 更新模板 |
| DELETE | `/approval-flows/:id` | 是 | admin | 删除模板（软删除） |

**审批流 JSON 模板示例**（请假审批）：
```json
{
  "category": "leave",
  "key": "leave_default",
  "name": "请假审批（默认）",
  "version": 1,
  "nodes": [
    {
      "id": "step1",
      "type": "sequential",
      "approverRole": "direct_leader",
      "condition": null
    },
    {
      "id": "step2",
      "type": "sequential",
      "approverRole": "hr",
      "condition": "always"
    },
    {
      "id": "step3",
      "type": "sequential",
      "approverRole": "ceo",
      "condition": "leave_days > 3"
    }
  ]
}
```

#### 4.1.2 审批实例管理

| Method | Path | 鉴权 | 描述 |
|---|---|---|---|
| POST | `/approval-instances` | 是 | 提交审批（业务侧发起） |
| GET | `/approval-instances` | 是 | 列出我的审批（待办/已办/我发起） |
| GET | `/approval-instances/:id` | 是 | 获取审批详情 |
| POST | `/approval-instances/:id/approve` | 是 | 审批通过 |
| POST | `/approval-instances/:id/reject` | 是 | 审批驳回 |
| POST | `/approval-instances/:id/transfer` | 是 | 转交他人 |
| POST | `/approval-instances/:id/withdraw` | 是 | 发起人撤回 |

**POST /approval-instances 提交审批请求体**：
```json
{
  "flowKey": "leave_default",
  "businessType": "leave",
  "businessId": "uuid",
  "title": "请假申请 - 2026-08-30",
  "data": {
    "leave_type": "annual",
    "start_date": "2026-08-30",
    "end_date": "2026-08-31",
    "leave_days": 2,
    "reason": "家中有事"
  }
}
```

### 4.2 通知（M0.5-2）

| Method | Path | 鉴权 | 描述 |
|---|---|---|---|
| GET | `/notifications` | 是 | 我的通知列表 |
| GET | `/notifications/unread-count` | 是 | 未读数 |
| POST | `/notifications/:id/read` | 是 | 标记已读 |
| POST | `/notifications/read-all` | 是 | 全部已读 |
| POST | `/notifications/send` | 是 | admin/HR 主动发通知 |
| GET | `/notification-templates` | 是 | 通知模板列表（admin） |
| PUT | `/notification-templates/:id` | 是 | 更新模板（admin） |

**POST /notifications/send 主动发通知请求体**：
```json
{
  "templateKey": "contract_expiring",
  "channels": ["email", "sms", "in_app"],
  "recipients": [
    { "userId": "uuid" },
    { "userId": "uuid" }
  ],
  "data": {
    "employee_name": "张三",
    "contract_end_date": "2026-09-15",
    "days_remaining": 21
  }
}
```

### 4.3 字段加密（M0.5-3）

| Method | Path | 鉴权 | 描述 |
|---|---|---|---|
| GET | `/encrypted-fields` | 是 | 列出已加密字段配置（admin） |
| POST | `/encrypted-fields` | 是 | 注册加密字段（admin） |
| DELETE | `/encrypted-fields/:id` | 是 | 注销加密字段（admin） |
| POST | `/encrypted-fields/:id/decrypt` | 是 | 解密单个字段（按角色授权） |
| POST | `/encrypted-fields/decrypt-batch` | 是 | 批量解密（按角色授权） |
| POST | `/encrypted-fields/rotate-key` | 是 | 触发密钥轮转（admin） |

**POST /encrypted-fields 注册加密字段请求体**：
```json
{
  "tableName": "employees",
  "columnName": "id_card",
  "encryptionAlgo": "aes-256-gcm",
  "keyVersion": 1,
  "accessRoles": ["admin", "hr", "self"]
}
```

### 4.4 第三方对接（M0.5-4）

| Method | Path | 鉴权 | 描述 |
|---|---|---|---|
| GET | `/integrations` | 是 | 列出所有集成（admin） |
| GET | `/integrations/:id` | 是 | 单个集成详情 |
| POST | `/integrations` | 是 | 注册集成（admin） |
| PUT | `/integrations/:id` | 是 | 更新配置（admin） |
| DELETE | `/integrations/:id` | 是 | 注销集成（admin） |
| POST | `/integrations/:id/sync` | 是 | 手动触发同步 |
| POST | `/integrations/:id/test` | 是 | 测试连通性 |

**POST /integrations 注册集成请求体**：
```json
{
  "code": "esign",
  "name": "e-签宝",
  "type": "http_api",
  "config": {
    "appId": "xxx",
    "appSecret": "yyy",
    "endpoint": "https://openapi.esign.cn"
  },
  "enabled": true
}
```

### 4.5 AI 底座（M0.5-5）

| Method | Path | 鉴权 | 描述 |
|---|---|---|---|
| POST | `/ai/ocr` | 是 | OCR 识别（身份证/银行卡/证书） |
| POST | `/ai/qa` | 是 | 智能问答（HR Q&A） |
| POST | `/ai/summarize` | 是 | 文本摘要（算薪异常摘要等） |
| POST | `/ai/score-suggest` | 是 | 绩效评分建议 |
| GET | `/ai/documents` | 是 | 知识库文档列表 |
| POST | `/ai/documents` | 是 | 上传文档到知识库 |
| DELETE | `/ai/documents/:id` | 是 | 删除文档 |
| GET | `/ai/conversations` | 是 | 我的对话历史 |
| GET | `/ai/quota` | 是 | 我的 AI 配额 |

#### POST /ai/ocr

**请求体**（multipart/form-data）：
- `file`：图片文件（jpg/png/pdf）
- `documentType`：`id_card` | `bank_card` | `certificate`

**响应**（成功 200）：
```json
{
  "success": true,
  "data": {
    "documentType": "id_card",
    "fields": {
      "name": "张三",
      "id_card_number": "110101199003078812",
      "gender": "male",
      "birth_date": "1990-03-07",
      "address": "北京市东城区...",
      "issue_authority": "北京市公安局",
      "valid_period": "2010.03.07-2030.03.07"
    },
    "confidence": 0.987,
    "cost": 0.05
  }
}
```

#### POST /ai/qa

**请求体**：
```json
{
  "question": "年假怎么请？",
  "context": {
    "userRole": "employee",
    "departmentId": "uuid"
  }
}
```

**响应**（成功 200）：
```json
{
  "success": true,
  "data": {
    "answer": "请年假流程：1. 登录系统 → 2. 进入『考勤假勤』→ 3. 点击『请假申请』...",
    "sources": [
      { "title": "员工手册-考勤假勤", "url": "/docs/employee-handbook/attendance", "score": 0.92 },
      { "title": "FAQ-年假", "url": "/docs/faq/annual-leave", "score": 0.88 }
    ],
    "confidence": 0.94,
    "cost": 0.012,
    "tokens": 456
  }
}
```

#### POST /ai/summarize

**请求体**：
```json
{
  "type": "payroll_diff",
  "data": {
    "employee": { "id": "uuid", "name": "张三" },
    "currentMonth": { ...工资单... },
    "lastMonth": { ...工资单... },
    "attendance": { "leave_days": 2, "absent_days": 0 },
    "performance": { "grade": "C", "previous_grade": "B" }
  }
}
```

**响应**（成功 200）：
```json
{
  "success": true,
  "data": {
    "summary": "张三本月工资 8500 元，比上月少 1500 元。原因：1) 事假 2 天扣款 800 元；2) 绩效 B→C 影响 700 元。建议：HR 与员工沟通绩效改进。",
    "highlights": [
      "事假扣款 800 元",
      "绩效降级影响 700 元"
    ],
    "cost": 0.08
  }
}
```

#### POST /ai/score-suggest

**请求体**：
```json
{
  "employeeId": "uuid",
  "cycleId": "uuid",
  "selfEvaluation": { "...": "员工自评文本" },
  "historicalPerformance": [
    { "cycle": "2026-07", "grade": "B" },
    { "cycle": "2026-06", "grade": "B" }
  ],
  "attendance": { "absent_days": 0, "late_times": 1 },
  "projectDeliveries": [
    { "name": "项目A", "onTime": true, "quality": "good" }
  ]
}
```

**响应**（成功 200）：
```json
{
  "success": true,
  "data": {
    "suggestions": [
      {
        "grade": "A",
        "confidence": 0.62,
        "reasons": [
          "近 3 个月绩效稳定在 B 档",
          "项目 A 提前 5 天交付，质量评价为 good",
          "本月无缺勤"
        ]
      },
      {
        "grade": "B",
        "confidence": 0.28,
        "reasons": [
          "本月迟到 1 次",
          "OKR 自评中提到部分目标未达预期"
        ]
      }
    ],
    "cost": 0.15
  }
}
```

## 五、变更记录

| 版本 | 日期 | 变更说明 | 变更人 |
|---|---|---|---|
| V1.0 | 2026-08-25 | 初稿，覆盖 M0 + M0.5 | WorkBuddy AI |

---

**— 文档结束 —**
