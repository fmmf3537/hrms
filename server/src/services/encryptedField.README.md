# M0.5-3 字段级加密

> **阶段**：M0.5（第 2 周）· **工时**：2d
> **依赖**：M0 脚手架（已完成）
> **被依赖**：M1+ 所有需要存敏感字段的业务（员工档案、工资单、合同）
> **关联文档**：[`docs/HRMS-V1.2.md`](../../../docs/HRMS-V1.2.md) §四.4.1 M0.5-3 · [`docs/audit-masking.md`](../../../docs/audit-masking.md) §2 基线脱敏 · [`docs/error-codes.md`](../../../docs/error-codes.md) §4xxxx

## 一、目标

为所有敏感字段（身份证 / 银行卡 / 薪资 / 手机号等）提供**AES-256-GCM 加密存储 + 按角色解密授权 + 完整访问审计**。

**核心问题**：HR 系统存身份证 / 银行卡 / 薪资等敏感信息，明文存储 = 等于把客户隐私放裸奔。

**本切片提供**：2 张表 + 1 crypto service + 1 字段 service + 6 个 REST API + 5 个默认加密字段（已 seed）。

## 二、加密方案

### 算法：AES-256-GCM（认证加密）
- 同时保证**机密性**（confidentiality）和**完整性**（integrity）
- IV（nonce）每条记录随机生成，12 字节
- Auth tag 16 字节，篡改密文会触发 GCM 验证失败

### 主密钥管理
- 从 `env.ENCRYPTION_KEY` 读取（64 个 hex 字符 = 32 字节）
- **生产环境必须从 KMS 注入**（阿里云 KMS / 腾讯云 KMS）
- 验证：zod regex 强制 64 字符，prod 禁止 dev-only 默认值

### 多版本密钥
- v1 = 主密钥本身（兼容老数据）
- v2+ = `HMAC-SHA256(masterKey, "vN")` 派生
- 同一主密钥支持多个版本，无需多套主密钥
- 轮转时 `keyVersion` 字段递增，旧版本密文仍能解密

### 密文格式
```
base64(iv).base64(ciphertext).base64(authTag)
例: "3q2+rw==.SGVsbG8gd29ybGQ=.ABCDEFGHIJKLMNOP"
```

## 三、数据模型

2 张表（迁移：`server/prisma/migrations/20260825030000_add_encrypted_fields/`）：

```
EncryptedField (字段配置)
├── tableName + columnName (唯一)
├── encryptionAlgo (默认 aes-256-gcm)
├── keyVersion (当前密钥版本)
├── accessRoles (JSON 数组)
│   - 'admin' / 'hr' / 'dept_head' 等角色
│   - 'self' 表示员工本人可查
├── enabled
└── 1:N → EncryptedFieldAudit

EncryptedFieldAudit (访问审计)
├── fieldId / userId / operation (encrypt/decrypt/rotate_key)
├── recordId (哪条记录的字段被操作)
├── ipAddress
└── createdAt
```

## 四、解密授权

`canDecrypt(field, ctx)` 决策表：

| accessRoles 含 'self' | recordId === userId | userRoles 与 accessRoles 有交集 | 结果 |
|---|---|---|---|
| 否 | 任意 | 否 | ❌ 拒绝 |
| 是 | 是 | 任意 | ✅ 允许（self 命中）|
| 任意 | 任意 | 是 | ✅ 允许（角色命中）|
| 是 | 否 | 否 | ❌ 拒绝（既不是本人，角色也不对）|

## 五、API 端点（6 个）

| Method | Path | 鉴权 | 描述 |
|---|---|---|---|
| GET | `/encrypted-fields` | 是 | 列出所有加密字段（可按 enabledOnly 过滤）|
| POST | `/encrypted-fields` | 是（admin）| 注册新字段 |
| DELETE | `/encrypted-fields/:id` | 是（admin）| 软删除（禁用）|
| POST | `/encrypted-fields/:id/decrypt` | 是 | 解密单条（按 accessRoles 授权）|
| POST | `/encrypted-fields/decrypt-batch` | 是 | 批量解密（一次权限检查）|
| POST | `/encrypted-fields/:id/rotate-key` | 是（admin）| 触发密钥轮转 |

详细请求/响应：[`openapi.yaml`](../../../docs/openapi.yaml) `paths/encrypted-fields`

## 六、错误码

详见 [`error-codes.md`](../../../docs/error-codes.md) §4xxxx：

| 错误码 | 含义 |
|---|---|
| 40100 | ENCRYPTION_KEY_MISSING（环境变量未配置）|
| 40101 | ENCRYPTION_FAILED（加密过程失败）|
| 40102 | DECRYPTION_FAILED（密文损坏 / 密钥不匹配 / 篡改）|
| 40103 | ENCRYPTION_KEY_ROTATION_FAILED（轮转参数错）|
| 40110 | DECRYPT_PERMISSION_DENIED（角色无权解密）|
| 40111 | ENCRYPTED_FIELD_SCHEMA_INVALID（字段配置错 / 已存在）|

## 七、Seed 默认加密字段

5 个默认字段（已在 `prisma/seed.ts`）：

| tableName | columnName | accessRoles | 用途 |
|---|---|---|---|
| employees | id_card | admin / hr / self | 员工身份证号 |
| employees | bank_card | admin / hr | 员工银行卡号 |
| employees | phone | admin / hr / self | 员工手机号 |
| payslips | base_salary | admin / hr | 工资单基本工资 |
| payslips | bonus | admin / hr | 工资单奖金/津贴 |

## 八、密钥轮转 SOP

**M0.5-3 阶段提供 API + 审计标记，但密文批量重加密待 M3+ 写批量任务**：

1. **更新配置**：`POST /encrypted-fields/:id/rotate-key { newKeyVersion: 2 }`
   - field.keyVersion 标记为 2
   - 写 1 条 rotate_key 审计
2. **新数据**：自动用 v2 加密（业务模块集成时）
3. **旧数据批量重加密**（M3+ 任务）：
   - 查所有 v1 密文
   - 逐条 `decrypt(v1)` → `encrypt(v2)` → 写回
   - 业务侧可灰度：新数据 v2，老数据 v1（仍可读）

## 九、测试覆盖（29 个新增）

| 文件 | 场景 | 数量 |
|---|---|---|
| crypto.service.test.ts | 加密/解密基本流程 + IV 唯一性 + 三段格式 | 3 |
| crypto.service.test.ts | 多版本密钥（v1/v2/v3 互不通用）| 3 |
| crypto.service.test.ts | 篡改检测（GCM auth tag）| 3 |
| crypto.service.test.ts | isEncrypted 工具 | 3 |
| crypto.service.test.ts | reencrypt 密钥轮转 | 1 |
| encryptedField.service.test.ts | 列表（基本 / enabledOnly）| 2 |
| encryptedField.service.test.ts | 创建（合法 / accessRoles 空 / 重复）| 3 |
| encryptedField.service.test.ts | 解密（admin 角色 / 失败 / self 授权）| 6 |
| encryptedField.service.test.ts | 批量解密 | 2 |
| encryptedField.service.test.ts | 密钥轮转 | 2 |
| encryptedField.service.test.ts | 软删除 | 1 |
| **合计** | | **29** |

`pnpm --filter hrms-server test`：100/100 通过

## 十、与审计脱敏的关系

详见 [`audit-masking.md`](../../../docs/audit-masking.md)。

- **基线脱敏**：写 `audit_logs.oldValue` / `newValue` 时，敏感字段（身份证/银行卡/薪资）自动 mask
- **角色化分级**：admin / hr / executive 默认可看明文，dept_head / employee 仅看 mask
- **二次审计**：`POST /audit-logs/:id/reveal` 调用前必须看明文时使用，本切片的 `decrypt` 接口与 `reveal` 接口行为类似（都需二次审计）

## 十一、已知限制 / 后续切片

| 限制 | 后续切片 | 优先级 |
|---|---|---|
| 密文批量重加密（轮转 SOP 步骤 3）| M3+ 批量任务（BullMQ）| P1 |
| 真实 KMS 集成（生产环境）| M0.5-4 第三方对接 | P0 |
| 没有 ORM 中间件自动加密（业务模块需手动调 service）| M5 联调时按需加 | P2 |
| 没接"操作人 userRoles 实时查询"（现在用 req.user.roles 缓存）| 性能可接受 | — |

## 十二、版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| V1.0 | 2026-08-25 | 初稿，2 张表 + 1 crypto + 1 字段 service + 6 API + 29 测试 |
