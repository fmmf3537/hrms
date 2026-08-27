# HRMS 错误码表

> **适用范围**：M0 + M0.5 阶段（基础/通用错误码 + 5 个公共模块错误码）
> **业务模块错误码**（HR/考勤/薪酬/绩效/AI）将在 M1+ 各模块开发时增量补充
> **关联文档**：[`HRMS-V1.2.md`](./HRMS-V1.2.md) · [API Spec](./api-spec.md) · [OpenAPI 规范](./openapi.yaml)

## 一、错误响应格式

所有错误响应统一使用以下 JSON 结构（由 `errorHandler` 中间件返回）：

```json
{
  "success": false,
  "error": "用户名或密码错误",
  "code": 40101,
  "details": [
    { "path": "password", "message": "密码至少 6 位" }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| success | boolean | 是 | 恒为 `false` |
| error | string | 是 | 人类可读的错误信息（中文） |
| code | integer | 是 | 业务错误码（非 HTTP status，HTTP status 在 response status 中） |
| details | array | 否 | 验证错误的详细字段信息（仅 Zod 校验失败时返回） |

## 二、错误码段位规划

业务错误码采用 5 位数字，按段位划分模块：

| 段位 | 模块 | 范围 |
|---|---|---|
| **0xxxx** | 通用 / 框架 | 00001-00999 |
| **1xxxx** | 认证与权限 | 10001-10999 |
| **2xxxx** | 审批流 | 20001-20999 |
| **3xxxx** | 通知 | 30001-30999 |
| **4xxxx** | 字段加密 | 40001-40999 |
| **5xxxx** | 第三方对接 | 50001-50999 |
| **6xxxx** | AI 底座 | 60001-60999 |
| **7xxxx** | 通用业务（HR/考勤/薪酬/绩效共用） | 70001-70999 |
| **8xxxx** | 预留（业务模块细分） | 80001-89999 |
| **9xxxx** | 系统级（不应出现，出现即 bug） | 90001-90999 |

> **重要**：HTTP status 仍按 REST 约定（200/201/400/401/403/404/409/422/500/503），业务错误码 `code` 字段是**额外**的，用于客户端精确定位错误类型。

## 三、错误码详细表

### 0xxxx —— 通用 / 框架

| code | HTTP | 名称 | 触发条件 | 客户端处理建议 |
|---|---|---|---|---|
| 00001 | 500 | INTERNAL_ERROR | 未捕获的服务器内部错误 | 提示用户稍后重试，收集 requestId 上报 |
| 00002 | 503 | SERVICE_UNAVAILABLE | 服务暂时不可用（如维护中） | 提示用户稍后重试 |
| 00003 | 408 | REQUEST_TIMEOUT | 请求超时 | 提示用户重试 |
| 00004 | 413 | PAYLOAD_TOO_LARGE | 请求体过大（>10MB） | 提示用户压缩文件 |
| 00005 | 429 | RATE_LIMITED | 全局限流触发 | 等待后重试，看 `Retry-After` 头 |

### 1xxxx —— 认证与权限

| code | HTTP | 名称 | 触发条件 | 客户端处理建议 |
|---|---|---|---|---|
| 10100 | 400 | INVALID_REQUEST | 请求参数格式错误（登录/刷新 token 格式不对） | 检查请求体 |
| 10101 | 401 | UNAUTHENTICATED | 未提供 Authorization 头 | 跳转登录页 |
| 10102 | 401 | TOKEN_EXPIRED | Access token 已过期 | 自动调用 refresh |
| 10103 | 401 | TOKEN_INVALID | Access token 无效（伪造/篡改） | 清空登录态，跳登录页 |
| 10104 | 401 | REFRESH_TOKEN_EXPIRED | Refresh token 已过期（7 天） | 跳登录页重新登录 |
| 10105 | 401 | REFRESH_TOKEN_INVALID | Refresh token 无效 | 跳登录页 |
| 10106 | 401 | REFRESH_TOKEN_REUSED | **检测到 refresh token 被重用**（安全事件） | 跳登录页 + 提示账号可能被盗 |
| 10110 | 401 | INVALID_CREDENTIALS | 用户名或密码错误（不区分"用户不存在"和"密码错"，防账号枚举） | 提示用户重试 |
| 10111 | 403 | ACCOUNT_DISABLED | 账号已停用 | 联系 HR |
| 10112 | 403 | MUST_CHANGE_PASSWORD | 首次登录/默认口令，必须先改密 | 跳转改密页 |
| 10120 | 403 | FORBIDDEN_ROLE | 角色权限不足 | 提示"无权访问" |
| 10121 | 403 | FORBIDDEN_PERMISSION | 权限点不足 | 提示"无权访问" |
| 10130 | 401 | TWO_FACTOR_REQUIRED | 敏感操作需要二次验证（短信/邮箱验证码） | 弹出二次验证弹窗 |

### 2xxxx —— 审批流（M0.5-1）

| code | HTTP | 名称 | 触发条件 | 客户端处理建议 |
|---|---|---|---|---|
| 20100 | 400 | APPROVAL_FLOW_INVALID_JSON | 审批流 JSON 模板格式错误 | 仅服务端可能触发 |
| 20101 | 404 | APPROVAL_FLOW_NOT_FOUND | 指定的审批流模板不存在 | 提示"流程不存在" |
| 20102 | 409 | APPROVAL_FLOW_DUPLICATE_KEY | 同 category+key 的审批流已存在 | 仅服务端 |
| 20110 | 404 | APPROVAL_INSTANCE_NOT_FOUND | 审批实例不存在 | 提示"流程已结束" |
| 20111 | 409 | APPROVAL_INSTANCE_ALREADY_FINISHED | 审批已结束（重复操作） | 提示"流程已结束" |
| 20112 | 403 | APPROVAL_NOT_YOUR_TURN | 当前不是你的审批节点 | 提示"等待上一节点审批" |
| 20113 | 409 | APPROVAL_PARALLEL_REJECTED | 会签中有人驳回 | 提示"已被驳回" |
| 20114 | 408 | APPROVAL_TIMEOUT | 审批超时未处理（已升级） | 提示"已升级到上级" |
| 20120 | 400 | APPROVAL_CONDITION_NOT_MET | 条件分支不满足（如请假 >3 天但模板要求总经理审批） | 仅服务端 |
| 20130 | 409 | APPROVAL_TRANSFER_SELF | 转交给自己的错误 | 提示"不能转给自己" |

### 3xxxx —— 通知（M0.5-2）

| code | HTTP | 名称 | 触发条件 | 客户端处理建议 |
|---|---|---|---|---|
| 30100 | 400 | NOTIFICATION_TEMPLATE_INVALID | 通知模板格式错误 | 仅服务端 |
| 30101 | 404 | NOTIFICATION_TEMPLATE_NOT_FOUND | 模板不存在 | 仅服务端 |
| 30102 | 400 | NOTIFICATION_RENDER_FAILED | 模板渲染失败（Handlebars 变量缺失） | 仅服务端 |
| 30110 | 502 | SMS_PROVIDER_ERROR | 短信服务商调用失败 | 自动重试 3 次，运维关注 |
| 30111 | 502 | EMAIL_PROVIDER_ERROR | 邮件 SMTP 失败 | 自动重试 3 次 |
| 30112 | 503 | NOTIFICATION_QUEUE_DOWN | BullMQ 队列不可用 | 运维告警 |
| 30120 | 429 | NOTIFICATION_RATE_LIMITED | 通知发送频率超限 | 队列自动降速 |

### 4xxxx —— 字段加密（M0.5-3）

| code | HTTP | 名称 | 触发条件 | 客户端处理建议 |
|---|---|---|---|---|
| 40100 | 500 | ENCRYPTION_KEY_MISSING | 加密密钥未配置 | 仅服务端，运维需配 KMS |
| 40101 | 500 | ENCRYPTION_FAILED | 加密过程失败 | 仅服务端 |
| 40102 | 500 | DECRYPTION_FAILED | 解密失败（密钥不匹配或密文损坏） | 仅服务端 |
| 40103 | 500 | ENCRYPTION_KEY_ROTATION_FAILED | 密钥轮转失败 | 运维告警，暂停轮转 |
| 40110 | 403 | DECRYPT_PERMISSION_DENIED | 当前角色无权限解密该字段 | 客户端按角色显示 mask |
| 40111 | 400 | ENCRYPTED_FIELD_SCHEMA_INVALID | 字段加密 schema 配置错误 | 仅服务端 |

### 5xxxx —— 第三方对接（M0.5-4）

| code | HTTP | 名称 | 触发条件 | 客户端处理建议 |
|---|---|---|---|---|
| 50100 | 400 | INTEGRATION_CONFIG_MISSING | 第三方配置未填写（API Key 等） | 仅服务端，运维配置 |
| 50101 | 404 | INTEGRATION_NOT_FOUND | 指定的集成不存在 | 仅服务端 |
| 50110 | 502 | INTEGRATION_PROVIDER_ERROR | 第三方 API 调用失败 | 自动重试 3 次 |
| 50111 | 503 | INTEGRATION_TIMEOUT | 第三方超时 | 自动重试 |
| 50112 | 429 | INTEGRATION_RATE_LIMITED | 第三方限流（如短信发送过快） | 队列降速 |
| 50120 | 400 | INTEGRATION_PAYLOAD_INVALID | 请求/响应格式与约定不符 | 仅服务端，可能 SDK 升级了 |

### 6xxxx —— AI 底座（M0.5-5）

| code | HTTP | 名称 | 触发条件 | 客户端处理建议 |
|---|---|---|---|---|
| 60100 | 500 | LLM_PROVIDER_ERROR | LLM API 调用失败 | 自动重试 2 次，降级到备用模型 |
| 60101 | 503 | LLM_TIMEOUT | LLM 响应超时 | 自动重试 |
| 60102 | 429 | LLM_RATE_LIMITED | LLM 速率限制 | 队列降速 |
| 60103 | 402 | LLM_QUOTA_EXCEEDED | LLM 配额用尽 | 运维充值 |
| 60110 | 500 | VECTOR_DB_ERROR | 向量数据库错误 | 自动重试 2 次 |
| 60111 | 500 | EMBEDDING_FAILED | 文本嵌入失败 | 仅服务端 |
| 60120 | 400 | OCR_PROVIDER_ERROR | OCR 服务商错误 | 自动重试 2 次 |
| 60121 | 400 | OCR_RECOGNITION_FAILED | OCR 识别失败（图片质量问题） | 客户端提示"请上传更清晰的图片" |
| 60130 | 503 | AI_CAPABILITY_DISABLED | AI 能力未启用（配置关闭） | 客户端显示"该能力暂未开放" |
| 60131 | 402 | AI_QUOTA_EXCEEDED | AI 能力调用次数超限 | 客户端提示"今日次数已用完，明天再试" |
| 60140 | 400 | AI_INPUT_TOO_LONG | 输入文本超长（如 QA 问题太长） | 客户端提示"问题过长，请精简" |

### 7xxxx —— 通用业务（HR/考勤/薪酬/绩效共用）

> 注：本段位为通用业务错误码，各业务模块的具体错误码将在 M1+ 增量补充。下方仅列已在 M0/M0.5 用到的。

| code | HTTP | 名称 | 触发条件 | 客户端处理建议 |
|---|---|---|---|---|
| 70100 | 400 | VALIDATION_FAILED | 业务参数验证失败（Zod） | 显示 details 字段级错误 |
| 70101 | 404 | NOT_FOUND | 资源不存在（通用） | 提示"记录不存在或已删除" |
| 70102 | 409 | DUPLICATE | 唯一性约束冲突（如工号重复） | 提示"该编号已存在" |
| 70103 | 409 | CONFLICT | 资源状态冲突（如重复提交） | 提示"操作冲突，请刷新" |
| 70104 | 422 | UNPROCESSABLE | 业务规则不满足（如试用期未满不能转正） | 提示具体原因 |
| 70110 | 403 | DATA_PERMISSION_DENIED | 数据权限不足（部门负责人看其他部门数据） | 提示"无权查看该数据" |
| 70120 | 400 | BUSINESS_RULE_VIOLATION | 业务规则违反（如调岗必须双方负责人审批） | 提示具体规则 |

### 724xx —— M3 绩效 D1 考核方案配置

| code | HTTP | 名称 | 触发条件 | 客户端处理建议 |
|---|---|---|---|---|
| 72401 | 400 | CYCLE_CODE_DUPLICATE | 周期 code 重复 | 提示更换 code |
| 72402 | 400 | CYCLE_INVALID_DATE_RANGE | startDate ≥ endDate | 提示日期范围错误 |
| 72403 | 400 | CYCLE_TYPE_INVALID | type 不在白名单 | 提示合法 type |
| 72404 | 400 | CYCLE_STATUS_INVALID_TRANSITION | 状态机非法流转 | 提示当前状态 |
| 72405 | 400 | CYCLE_HAS_DEPENDENT_RECORDS | 关闭周期时存在依赖（D2 TODO） | 留 D2 |
| 72406 | 400 | INDICATOR_CODE_DUPLICATE | 指标/方案 code 重复 | 提示更换 code |
| 72407 | 400 | INDICATOR_TYPE_INVALID | 指标 type 不合法 | 提示合法 type |
| 72408 | 400 | INDICATOR_WEIGHT_OUT_OF_RANGE | 权重 ≤0 或 >100 | 提示权重范围 |
| 72409 | 400 | SCHEME_WEIGHT_SUM_NOT_100 | 方案权重和 ≠ 100 | 提示权重和错误 |
| 72410 | 400 | COEFFICIENT_GRADE_INVALID | 等级/系数不合法 | 提示合法 grade/系数 |
| 72411 | 400 | SCHEME_SCOPE_INVALID | 方案适用范围字段不匹配 | 提示范围错误 |
| 72412 | 400 | SCHEME_INDICATOR_INVALID | 指标不存在或已归档 | 提示指标无效 |

### 7.3 M3-D2 考核流程（72501-72520）

| code | HTTP | 名称 | 触发条件 | 客户端处理建议 |
|---|---|---|---|---|
| 72501 | 404 | RECORD_NOT_FOUND | recordId 不存在 | 提示 ID 错误 |
| 72502 | 400 | RECORD_DUPLICATE_EMPLOYEE_CYCLE | 同一 employee+cycle 重复创建 | 提示已存在 |
| 72503 | 400 | RECORD_STATUS_INVALID_TRANSITION | 状态机非法流转 | 提示当前状态 |
| 72504 | 403 | RECORD_NOT_EMPLOYEE_SELF | employee 操作非本人 record | 提示权限 |
| 72505 | 400 | RECORD_ALREADY_ARCHIVED | 归档后再次操作 | 提示已归档 |
| 72506 | 400 | RECORD_REJECT_REASON_REQUIRED | reject 必须传 reason | 提示必填 |
| 72507 | 400 | SCORE_ITEMS_INCOMPLETE | 评分未覆盖所有 scheme indicators | 提示补全 |
| 72508 | 400 | SCORE_OUT_OF_RANGE | score 越界 | 提示分数范围 |
| 72509 | 400 | SCORE_WEIGHT_SUM_NOT_100 | 评分明细权重和 ≠ 100 | 提示权重错误 |
| 72510 | 400 | SCORE_INVALID_STAGE | 当前状态不允许此 stage 评分 | 提示当前状态 |
| 72511 | 400 | SCORE_VERSION_CONFLICT | version 冲突（乐观锁） | 提示重新加载 |
| 72512 | 400 | SCORE_ALREADY_SUBMITTED | 重复提交 | 提示已提交 |
| 72513 | 400 | AI_SUGGESTION_NOT_ALLOWED | 当前状态不允许 AI 建议 | 提示状态 |
| 72514 | 500 | AI_SUGGESTION_FAILED | AI 调用失败且无 fallback | 提示重试 |
| 72515 | 400 | AI_SUGGESTION_HISTORY_EMPTY | 无历史 AI 建议 | 提示暂无 |
| 72516 | 400 | AI_SUGGESTION_COUNT_EXCEEDED | 24h 调用次数超限 | 提示稍后再试 |
| 72517 | 400 | APPROVAL_FLOW_NOT_CONFIGURED | 5 个 flowKey 未 seed | 提示配置审批流 |
| 72518 | 400 | APPROVAL_INSTANCE_CREATE_FAILED | submitApproval 失败 | 提示重试 |
| 72519 | 400 | APPROVAL_REJECT_NOT_AT_SCORING_STAGE | 拒绝时不在评分阶段 | 提示当前状态 |
| 72520 | 400 | APPROVAL_ALREADY_APPROVED | 已审批重复操作 | 提示已审批 |

### 7.4 M3-D3 五档评分 + 系数配置（72601-72610）

| code | HTTP | 名称 | 触发条件 | 客户端处理建议 |
|---|---|---|---|---|
| 72601 | 400 | GRADE_FINALSCORE_MISSING | record.finalScore 为 null | 提示无分数 |
| 72602 | 400 | GRADE_THRESHOLD_INVALID | 阈值越界或顺序错乱 | 提示阈值 |
| 72603 | 400 | GRADE_OUT_OF_RANGE | finalScore 越界 | 提示范围 |
| 72604 | 400 | GRADE_ALREADY_CALCULATED | finalGrade 已存在且未 force | 提示已判定 |
| 72605 | 400 | GRADE_BATCH_EMPTY | 批量入参为空 | 提示入参 |
| 72606 | 400 | GRADE_BATCH_TOO_LARGE | 批量超过上限 | 提示分批 |
| 72607 | 400 | THRESHOLD_GRADE_NOT_FOUND | 阈值缺少某 grade | 提示配置 |
| 72608 | 400 | THRESHOLD_OVERLAPPING | 阈值顺序不严格递减 | 提示区间 |
| 72609 | 400 | CALIBRATION_DEPT_NOT_FOUND | 部门不存在 | 提示部门 |
| 72610 | 400 | CALIBRATION_RATIO_INVALID | 比例和 ≠ 1.0 | 提示比例 |

### 7.5 M3-D4 绩效兑现（72701-72710）

| code | HTTP | 名称 | 触发条件 | 客户端处理建议 |
|---|---|---|---|---|
| 72701 | 400 | PAYOUT_CONFIG_NOT_FOUND | 当前无生效配置 | 提示初始化配置 |
| 72702 | 400 | PAYOUT_MODE_INVALID | mode 不在 direct / pool | 提示合法 mode |
| 72703 | 400 | PAYOUT_PERIOD_INVALID | period 格式错（YYYY-MM） | 提示格式 |
| 72704 | 400 | PAYOUT_CALC_NOT_READY | record 未归档 | 提示归档 |
| 72705 | 400 | PAYOUT_POOL_DEPT_NOT_FOUND | 部门不存在 | 提示部门 |
| 72706 | 400 | PAYOUT_POOL_MEMBER_EMPTY | 部门池成员数 < min_members | 提示最小成员 |
| 72707 | 400 | PAYOUT_PREPAY_NOT_ALLOWED | 非季度前 2 月 | 提示时间 |
| 72708 | 400 | PAYOUT_PREPAY_ALREADY_DONE | 当月已预支 | 提示已预支 |
| 72709 | 400 | PAYOUT_SETTLE_NOT_ALLOWED | 季度末未到 / record 未归档 | 提示时间 |
| 72710 | 400 | PAYOUT_DUPLICATE | 同 employeeId+cycleId+month 重复 | 提示重复 |

### 7.6 M3-D5 销售提成（72801-72810）

| code | HTTP | 名称 | 触发条件 | 客户端处理建议 |
|---|---|---|---|---|
| 72801 | 400 | SALES_PRODUCT_NOT_FOUND | productId 不存在 | 提示 ID 错误 |
| 72802 | 400 | SALES_PRODUCT_DUPLICATE_CODE | 产品 code 重复 | 提示更换 code |
| 72803 | 400 | SALES_PRODUCT_RATE_OUT_OF_RANGE | baseRate ≤0 或 >50% | 提示比例范围 |
| 72804 | 400 | SALES_PAYMENT_NOT_FOUND | paymentId 不存在 | 提示 ID 错误 |
| 72805 | 400 | SALES_PAYMENT_ALREADY_CONFIRMED | 重复确认 / 回款未确认 | 提示已确认 |
| 72806 | 400 | SALES_PAYMENT_AMOUNT_INVALID | amount ≤0 | 提示金额 |
| 72807 | 400 | SALES_PAYMENT_EMPLOYEE_NOT_SALES | 员工非销售岗 | 提示员工类型 |
| 72808 | 400 | SALES_COMMISSION_ALREADY_CALCULATED | 已计算过该 payment | 提示已计算 |
| 72809 | 400 | SALES_COMMISSION_PERIOD_INVALID | period 格式错（YYYY-MM） | 提示格式 |
| 72810 | 400 | SALES_COMMISSION_TARGET_NOT_MET | 目标完成率 < 100% | 提示目标（D5 暂不从销售目标表触发） |

### 7.7 M3-D6 结果应用（72901-72910）

| code | HTTP | 名称 | 触发条件 | 客户端处理建议 |
|---|---|---|---|---|
| 72901 | 400 | ADJUSTMENT_NOT_FOUND | 调薪记录 ID 不存在 | 提示 ID 错误 |
| 72902 | 400 | ADJUSTMENT_PERIOD_INVALID | 调薪周期格式错（YYYY-Qn） | 提示格式 |
| 72903 | 400 | ADJUSTMENT_ALREADY_APPROVED | 重复审批 | 提示已审批 |
| 72904 | 400 | PROMOTION_NOT_FOUND | 晋升记录 ID 不存在 | 提示 ID 错误 |
| 72905 | 400 | PROMOTION_REQUIREMENT_NOT_MET | 不满足晋升要求 | 提示条件 |
| 72906 | 400 | PIP_NOT_FOUND | PIP 记录 ID 不存在 | 提示 ID 错误 |
| 72907 | 400 | PIP_ALREADY_ACTIVE | 员工已有 active PIP | 提示已有 PIP |
| 72908 | 400 | PIP_D_GRADES_INSUFFICIENT | 连续 2 季度 D 档不满足 | 提示条件 |
| 72909 | 400 | PIP_REVIEW_OVERDUE | PIP 期间漏评审 | 提示评审 |
| 72910 | 400 | PIP_STATUS_INVALID_TRANSITION | PIP 状态机非法流转 | 提示状态 |

### 9xxxx —— 系统级（出现即 bug）

| code | HTTP | 名称 | 触发条件 | 客户端处理建议 |
|---|---|---|---|---|
| 90001 | 500 | UNHANDLED_EXCEPTION | 未处理的异常 | 收集上报 |
| 90002 | 500 | UNHANDLED_REJECTION | 未处理的 Promise 拒绝 | 收集上报 |
| 90003 | 500 | MISSING_ENV_VAR | 环境变量未配置 | 仅服务端启动失败 |

## 四、错误码使用规范（开发必读）

### 4.1 抛出错误的规范

```typescript
// ❌ 错误：直接抛字符串
throw new Error('用户不存在');

// ❌ 错误：用 HTTP 状态码当业务错误码
throw new AppError('用户不存在', 404);

// ✅ 正确：用 AppError + 业务错误码
import { AppError } from '@/middleware/errorHandler';

throw new AppError('用户不存在', 404, 10110);
```

### 4.2 AppError 三参版本

`errorHandler.ts` 中扩展的 `AppError` 构造函数（V1.2 新增）：

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    statusCode: number = 500,
    public code?: number,    // 业务错误码（V1.2 新增）
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
```

### 4.3 业务码分配原则

1. **5 位数字**，按段位（1xxxx = 认证，2xxxx = 审批...）分配
2. **按需分配，跳号是正常的**（V1.2 明确）—— 不同外部依赖（PG / Redis / LLM / OCR / KMS）的错误码按接入顺序分配，不预留连续号，避免"未用码位膨胀"且更贴近主流大厂错误码规范（Google API / AWS / Azure）
3. **每个段位维护"已用 vs 预留"对照表**（见附录 §六），便于 M0.5+ 业务模块分配新码时查表拿号
4. **新增业务错误码时**：
   - 先在本文档 §六 对照表登记（注明"已用"或"预留"）
   - 提交 PR 时 review 业务码是否冲突
   - 客户端 SDK 也同步更新

### 4.4 客户端处理模式

```typescript
// Vue 3 + Pinia 拦截器示例
axios.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const { code, error: msg, details } = error.response?.data || {};
    
    switch (code) {
      case 10102:  // TOKEN_EXPIRED
        return refreshAndRetry(error.config);
      case 10106:  // REFRESH_TOKEN_REUSED
        ElMessageBox.alert('账号可能在其他设备登录，请重新登录', '安全提示');
        redirectToLogin();
        break;
      case 10112:  // MUST_CHANGE_PASSWORD
        router.push('/change-password');
        break;
      case 10120:  // FORBIDDEN_ROLE
      case 10121:  // FORBIDDEN_PERMISSION
        router.push('/403');
        break;
      case 70100:  // VALIDATION_FAILED
        showFieldErrors(details);
        break;
      default:
        ElMessage.error(msg || '请求失败');
    }
    return Promise.reject(error);
  }
);
```

## 五、变更记录

| 版本 | 日期 | 变更说明 | 变更人 |
|---|---|---|---|
| V1.0 | 2026-08-25 | 初稿，覆盖 M0 + M0.5 基础/公共错误码（0xxxx-6xxxx + 7xxxx 通用业务） | WorkBuddy AI |

## 六、附录：错误码使用统计（M0 + M0.5 预估）

| 段位 | 已用码位 | 预留码位（≥10） | 合计规划 | 备注 |
|---|---|---|---|---|
| 0xxxx 通用 | 00001-00005（5 个）| 00006-00099 | 5 | 全部已实现 |
| 1xxxx 认证 | 10100-10112 + 10120-10121 + 10130（11 个）| 10122-10129 + 10131-10199 | 11 | 已实现（含 rotation/reuse + 必须改密 + 二次验证） |
| 2xxxx 审批流 | 20100-20102 + 20110-20114 + 20120 + 20130（10 个）| 20131-20199 | 10 | M0.5-1 全部要实现 |
| 3xxxx 通知 | 30100-30102 + 30110-30112 + 30120（7 个）| 30121-30199 | 7 | M0.5-2 全部要实现 |
| 4xxxx 加密 | 40100-40103 + 40110-40111（6 个）| 40112-40199 | 6 | M0.5-3 全部要实现 |
| 5xxxx 第三方 | 50100-50101 + 50110-50112 + 50120（6 个）| 50121-50199 | 6 | M0.5-4 全部要实现 |
| 6xxxx AI | 60100-60103 + 60110-60111 + 60120-60121 + 60130-60131 + 60140（11 个）| 60141-60199 | 11 | M0.5-5 全部要实现 |
| 7xxxx 通用业务 | 70100-70104 + 70110 + 70120（7 个）| 70121-70999 | 7+ | M0/M0.5 用到的，业务模块的留给 M1+ |
| 8xxxx 预留 | 0 | 80001-89999 | 0 | 业务模块细分（HR / 考勤 / 薪酬 / 绩效 分别占段） |
| 9xxxx 系统级 | 90001-90003（3 个）| 90004-90999 | 3 | 出现即 bug |
| **合计** | **66** | — | **66+** | 覆盖率达 100%（M0 + M0.5） |

**业务模块细分建议**（8xxxx 段位，M1+ 启用）：
- `80xxxx`：HR / 组织人事
- `81xxxx`：考勤假勤
- `82xxxx`：薪酬核算
- `83xxxx`：绩效管理
- `84xxxx`：合同管理
- `85xxxx`：报表 / BI
- `86xxxx`：ESS / 员工自助
- `87xxxx-89xxxx`：未来扩展预留

---

**— 文档结束 —**
