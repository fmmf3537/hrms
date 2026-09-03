# HRMS 审计日志脱敏策略

> **核心原则**：默认安全（基线 mask）+ 按需放开（角色化）+ 二次审计（看明文必留痕）
> **关联文档**：[`HRMS-V1.2.md`](./HRMS-V1.2.md) §2.6.5 审计日志 · [`operations.md`](./operations.md) §2.5 出库审计

---

## 一、为什么需要脱敏策略

### 1.1 现状问题

V1.2 已实现的 `audit_logs` 表的 `old_value` / `new_value` 是 JSON 字段，可写任意 JSON。意味着：
- 用户改了薪资 `{"new_value": {"base_salary": 15000}}` → 审计日志明文存 15000
- 用户改了身份证 → 审计日志明文存完整身份证号
- 任何能看审计日志的人 → 都能看到所有敏感值

### 1.2 风险场景

| 风险 | 后果 |
|---|---|
| 审计日志被越权访问（运维/数据库泄露）| 大批量敏感数据泄露 |
| 内部人员滥用审计查询功能 | 偷看同事薪资/身份证 |
| 第三方审计公司进场 | 看到不应看到的明文 |
| 法规检查 | 违反《个人信息保护法》最小必要原则 |

### 1.3 脱敏目标

1. **默认安全**：审计日志 JSON 中敏感字段**默认不存明文**，只存 mask 形式
2. **可审计**：特殊情况下能还原明文，但**还原行为必留痕**
3. **合规**：符合《个人信息保护法》《数据安全法》对敏感个人信息的要求

---

## 二、基线脱敏规则（强制默认）

所有写入 `audit_logs.old_value` / `new_value` JSON 字段的数据，**必须**经过基线脱敏（除非字段在"白名单"中）。

### 2.1 字段级脱敏规则

| 字段类型 | 识别规则 | 脱敏格式 | 示例 |
|---|---|---|---|
| **身份证号** | 18 位（17 数字 + 1 数字/X），含出生日期特征 | 前 6 位 + `********` + 后 4 位 | `110101********0023` |
| **手机号** | 11 位数字，1 开头 | 前 3 位 + `****` + 后 4 位 | `138****5678` |
| **银行卡号** | 13-19 位数字 | 前 4 位 + `**********` + 后 4 位 | `6228********1234` |
| **邮箱** | 含 `@` | 邮箱名首字母 + `***@` + 域名 | `z***@hrms.com` |
| **薪资金额** | 数字字段 + 字段名含 `salary` / `wage` / `pay` / `bonus` / `allowance` | 四舍五入到 100 元 | `15000` → `15000`（但记录 `_range: "15000-15999"`） |
| **绩效系数** | 数字 0.5-2.0 | 保留 1 位小数 | `1.25` → `1.3`（精度损失避免反推）|
| **密码 / 哈希** | 任何含 `password` / `secret` / `token` 的字段 | 完整替换为 `***REDACTED***` | `bcrypt_hash` → `***REDACTED***` |
| **住址** | 字段名含 `address` | 保留到省/市级 | `陕西省西安市雁塔区xx路xx号` → `陕西省西安市` |
| **紧急联系人** | 字段名含 `emergency_contact` | 完全 mask | `张三` → `***` |
| **IP 地址** | 含 `.` 的 IPv4 | 末段 mask | `192.168.1.100` → `192.168.1.***` |
| **actorType**（V1.2.1 新增） | audit_logs.actor_type 字段，枚举值 | **不脱敏**（USER / AGENT / SYSTEM / INTEGRATION 枚举） | `USER` → `USER` |

### 2.2 基线白名单（不脱敏的字段）

| 字段 | 不脱敏原因 |
|---|---|
| `username` | 操作人标识，审计需要 |
| `userId` | UUID，不含敏感信息 |
| `action` | 枚举值（LOGIN/CREATE/UPDATE/DELETE/EXPORT）|
| `resourceType` | 资源类型名 |
| `resourceId` | UUID |
| `status` | SUCCESS / FAILURE |
| `ipAddress` | 已按 §2.1 mask |
| `userAgent` | 浏览器标识，不敏感 |
| `createdAt` / `updatedAt` | 时间戳 |

### 2.3 嵌套 JSON 处理

`old_value` / `new_value` 是 JSON，可能嵌套：

```json
{
  "before": { "base_salary": 15000, "id_card": "110101199003078812" },
  "after": { "base_salary": 18000, "department": "技术部" }
}
```

**处理规则**：
- 递归遍历所有 key-value pair
- 命中 §2.1 表的字段 → 应用对应 mask
- 命中白名单 → 保留原值
- 其他字段 → 默认保留（不主动 mask，因为难以穷举）

### 2.4 数组处理

```json
{
  "education_history": [
    { "school": "西安交大", "degree": "本科" },
    { "school": "清华大学", "degree": "硕士" }
  ]
}
```

数组内每个对象独立按 §2.3 规则处理。

---

## 三、角色化分级（按角色看明文）

### 3.1 角色与可见性

| 角色 | 默认看 | 可申请看明文 | 申请后审计 |
|---|---|---|---|
| **admin** | 全 mask | ✅ 自动（admin 角色默认有权限） | ✅ 留痕 |
| **hr** | 全 mask | ✅ 自动（HR 角色默认有权限） | ✅ 留痕 |
| **dept_head** | 部门内全 mask | ❌ 不允许看明文 | — |
| **executive** | 全 mask | ✅ 自动（高管角色默认有权限） | ✅ 留痕 |
| **employee** | 仅自己相关的 mask | ❌ 不可看他人 | — |
| **auditor**（外部审计） | 全 mask | ⚠️ 需法务 + CTO 审批 | ✅ 留痕 |
| **dba**（运维） | 不应访问审计日志 | ❌ 需走紧急审批 | ✅ 留痕 |

### 3.2 关键设计

#### 3.2.1 admin / hr / executive 默认可看明文

理由：这些角色工作需要看明文（如 HR 核算薪酬、admin 处理权限变更）。但**每次查看都写审计**（"X 于 Y 时间查看了 Z 员工的薪资审计"）。

#### 3.2.2 dept_head 不允许看明文

理由：部门负责人不应看到具体金额（防止部门内薪资不透明引发的矛盾），只能看到"有人调整了薪资"的事实，不看到具体值。

#### 3.2.3 employee 仅自己

员工可查自己的审计记录（如"谁改了我的档案"），但不能看其他人的。

#### 3.2.4 外部 auditor 走法务审批

外部审计公司进场时需走专门流程：
1. 法务发起"外部审计数据访问申请"工单
2. CTO 审批，限定访问时间窗和数据范围
3. 申请通过后开通只读临时账号
4. 审计结束后立即关闭账号
5. 全程留痕，审计公司需签保密协议

### 3.3 角色权限矩阵（实现层）

| 角色 | 读取 audit_logs | 解密敏感字段 | 申请临时解密 | 导出 |
|---|---|---|---|---|
| admin | ✅ 全部 | ✅ 全部 | ✅ 自动 | ✅ 全部（出库审计）|
| hr | ✅ 全部 | ✅ 全部 | ✅ 自动 | ⚠️ 需主管审批（>100 条）|
| dept_head | ✅ 仅本部门员工 | ❌ | ❌ | ❌ |
| executive | ✅ 全部 | ✅ 全部 | ✅ 自动 | ✅ 全部（出库审计）|
| employee | ✅ 仅自己相关 | ❌ | ❌ | ❌ |
| auditor（临时）| ✅ 限定范围 | ⚠️ 需审批 | 走临时流程 | ⚠️ 走临时流程 |
| dba | ❌ 默认无访问 | ❌ | ⚠️ 紧急审批 | ❌ |

---

## 四、实施细节

### 4.1 在哪一层脱敏

**应用层 service 写入 audit_log 时脱敏**，数据库只存脱敏后的值。

```
Controller → Service → 业务逻辑 → auditLog({oldValue, newValue}) → 脱敏中间件 → Prisma.auditLog.create
```

**理由**：
- 数据库存脱敏后值，物理泄露也是安全的
- 应用层是唯一脱敏点，避免散落
- 反序列化时（如 BI 报表）直接读脱敏值即可

### 4.2 还原接口（仅限 admin / hr / executive）

API：
```
POST /api/audit-logs/:id/reveal
```

**请求体**：
```json
{
  "fields": ["before.base_salary", "after.base_salary"],
  "reason": "处理员工投诉，需要核对调薪记录"
}
```

**响应**（仅返回请求的字段，其他仍 mask）：
```json
{
  "success": true,
  "data": {
    "before.base_salary": 15000,
    "after.base_salary": 18000
  }
}
```

**错误码**（reveal 接口专用）：
- 请求的字段不存在或不在脱敏白名单内 → 返回 `400` + `40110 DECRYPT_PERMISSION_DENIED`（V1.2 错误码规范对齐：40110 即 §4xxxx 段）
- 角色无权限（如 dept_head） → 返回 `403` + `40110 DECRYPT_PERMISSION_DENIED`
- auditLog 不存在 → 返回 `404` + `70101 NOT_FOUND`

**二次审计**：
- 写一条 `AUDIT_REVEAL` action 的审计日志
- 包含：操作人、reveal 的 logId、reveal 的字段、reason
- 字段敏感度 + 操作人角色 → 触发不同级别告警（如 admin reveal 大量薪资字段 → CTO 邮件告警）

### 4.3 数据库字段类型不变

`old_value` / `new_value` 仍是 JSON 字段，但内部约定：
- 写入值已脱敏
- 不在数据库层做脱敏（性能开销大）
- 在应用层 audit.service 入口处脱敏（统一拦截）

> **M5-04 实现注记（2026-09-03 生效）**：写入侧升级为**加密而非纯脱敏**——`audit.service.protectAuditValue`
> 对命中 §2.1 规则的字段自动 AES-256-GCM 加密为 `{"__enc":"<密文>"}`（数据库物理泄露亦安全）；
> `GET /audit-logs` 返回前 `maskAuditValue` 解密并打码展示（绝不回传明文）；
> `POST /audit-logs/:id/reveal` 由 admin/hr/executive 二次授权还原明文并写 `AUDIT_REVEAL` 审计。
> 历史明文行不回改（按 §7.1 从生效日起执行）。

### 4.4 API 返回值脱敏

`GET /api/audit-logs` 返回前再过一次脱敏（防止 service 漏写）：

```typescript
// audit.service.ts
export async function listAuditLogs(query) {
  const logs = await prisma.auditLog.findMany(...);
  // 二次脱敏 + 角色化过滤
  return logs.map(log => maskForRole(log, currentUser));
}
```

`maskForRole(log, user)` 逻辑：
- admin / hr / executive：返回脱敏前值（如有）或 mask 后值
- dept_head：仅返回本部门员工 + 仅 mask
- employee：仅返回自己相关

---

## 五、二次审计（看明文必留痕）

### 5.1 写什么

| 字段 | 内容 |
|---|---|
| action | `AUDIT_REVEAL` |
| userId | 操作人 ID |
| resourceType | `AuditLog` |
| resourceId | 被 reveal 的 auditLog.id |
| description | `reveal fields: [before.base_salary, after.base_salary] reason: 投诉核对` |
| newValue | `{"revealed_fields": [...], "reason": "..."}` |
| status | SUCCESS |
| ipAddress / userAgent | 自动记录 |

### 5.2 告警规则

| 触发条件 | 告警 |
|---|---|
| 任何 AUDIT_REVEAL 记录 | 通知审计员群组（每日摘要） |
| 同一用户 24h 内 reveal > 10 次 | 通知 CTO + 自动冻结账号 1h |
| 同一用户 reveal 涉及 > 5 个不同员工 | 通知 CTO |
| dba / auditor reveal 任意字段 | 立即通知 CTO + 法务 |

### 5.3 审计员审阅

- 每月由内部审计员（可由 admin 兼任）审阅 AUDIT_REVEAL 记录
- 季度输出"审计日志访问报告"给总经理
- 异常访问（无合理理由 / 高频）触发调查流程

---

## 六、客户端处理

### 6.1 默认显示

```vue
<el-descriptions :title="`审计日志 ${log.id}`">
  <el-descriptions-item label="操作人">{{ log.userId }}</el-descriptions-item>
  <el-descriptions-item label="操作">{{ log.action }}</el-descriptions-item>
  <el-descriptions-item label="对象">{{ log.resourceType }} / {{ log.resourceId }}</el-descriptions-item>
  <el-descriptions-item label="前后值">
    <pre>{{ log.oldValue }}</pre>  <!-- 已脱敏 -->
    →
    <pre>{{ log.newValue }}</pre>  <!-- 已脱敏 -->
  </el-descriptions-item>
</el-descriptions>
```

### 6.2 申请看明文按钮

```vue
<el-button
  v-if="canReveal"
  type="primary"
  @click="onReveal"
>
  申请查看明文
</el-button>
```

```typescript
async function onReveal() {
  const { value: reason } = await ElMessageBox.prompt('请输入查看明文的原因（必填）', '敏感操作', {
    confirmButtonText: '提交',
    cancelButtonText: '取消',
  });
  
  await request.post(`/audit-logs/${log.value.id}/reveal`, {
    fields: ['before.base_salary', 'after.base_salary'],
    reason,
  });
  
  // 重新加载日志
  await loadLog();
  
  // 提示"您的查看行为已被记录"
  ElMessage.warning('您的查看行为已被记录到审计日志');
}
```

### 6.3 角色化显示控制

- dept_head 用户看不到"申请查看明文"按钮（按钮 v-if 控制）
- employee 用户只能看自己的审计日志
- auditor 临时账号界面带红色横幅"外部审计账号 - 您的所有操作已被记录"

---

## 七、迁移与上线

### 7.1 迁移策略

一期上线前：
1. 已有 audit_logs 表的 `old_value` / `new_value` 字段数据**全部视为已泄露**
2. 不做历史脱敏（成本高、价值低）
3. 从上线日起，所有新写入按脱敏策略执行
4. 历史数据如需查阅，走"导出审批流"

### 7.2 上线步骤

1. 部署新代码（含脱敏中间件 + reveal 接口）
2. 配置角色权限（admin/hr/executive 默认有 reveal 权限）
3. 培训：给 admin / hr / executive 培训"reveal 操作会留痕"
4. 灰度：先在 audit-logs 列表开启 reveal 按钮，验证正常后全面开放
5. 监控：第一周每天审计 AUDIT_REVEAL 记录

### 7.3 验证清单

- [ ] 创建测试用户，触发 UPDATE 操作，检查 audit_log 的 old_value 已脱敏
- [ ] 验证 admin 可通过 reveal 接口看明文
- [ ] 验证 dept_head 看不到 reveal 按钮
- [ ] 验证 employee 只能看自己的日志
- [ ] 验证 reveal 操作本身写了一条新的审计
- [ ] 验证 24h reveal 10 次的告警

---

## 八、变更记录

| 版本 | 日期 | 变更说明 | 变更人 |
|---|---|---|---|
| V1.0 | 2026-08-25 | 初稿，基线 + 角色化 + 二次审计策略 | WorkBuddy AI |

---

**— 文档结束 —**
