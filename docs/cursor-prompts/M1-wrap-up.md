# M1 收尾报告：组织人事模块 7 个切片全部完成

> **报告日期**：2026-08-26
> **报告人**：WorkBuddy（HRMS 项目 AI 助手）
> **报告范围**：M1 组织人事模块（V1.2 §四.5）A1-A7 全部 7 个切片
> **报告类型**：阶段收尾 + 经验沉淀 + 下阶段衔接

---

## 1. M1 阶段完成度

### 1.1 切片清单（V1.2 §四.5.1）

| 切片 | 范围 | commit | 单测增量 | 状态 |
|---|---|---|---|---|
| A1+A2 合并 | 组织架构 + 员工档案（25 端点） | `df59b94` | 140→178（+38） | ✅ |
| A3 | 入职流程（5 端点） | `e00ba90` | 178→195（+17） | ✅ |
| A4 | 转正流程（4 端点） | `34bf28d` | 195→213（+18） | ✅ |
| A5 | 调动流程（5 端点） | `a51ede5` | 213→234（+21） | ✅ |
| A6 | 离职流程（6 端点） | `bdb60b7` | 234→255（+21） | ✅ |
| A7 | 合同管理（6 端点：5 用户 + 1 webhook） | `949daf3` | 255→**276**（+21） | ✅ |

**测试演进**：M0.5 收尾 140 → M1 收尾 276（**+136，97% 增长**）

### 1.2 M1 业务代码 commit（7 个 + 6 个提示词 = 13 个 commit）

```
业务代码（7 个，按 commit 时间顺序）：
  df59b94 feat(hr): M1-A1+A2 组织架构 + 员工档案合并切片
  e00ba90 feat(onboarding): M1-A3 入职流程
  34bf28d feat(regularization): M1-A4 转正流程
  a51ede5 feat(transfer): M1-A5 调动流程
  bdb60b7 feat(offboarding): M1-A6 离职流程
  949daf3 feat(contract): M1-A7 合同管理

提示词（6 个，独立 commit 库）：
  f22c146 docs(prompts): M1-A3 入职流程 Cursor 提示词
  57578a0 docs(prompts): M1-A4 转正流程 Cursor 提示词
  a844ff7 docs(prompts): M1-A5 调动流程 Cursor 提示词
  956fdc0 docs(prompts): M1-A6 离职提示词反向优化（45KB 详尽模式）
  4496404 docs(prompts): M1-A6 离职流程 Cursor 提示词（15KB 瘦身版，已被反向优化覆盖）
  c1fc3ff docs(prompts): M1-A7 合同管理 Cursor 提示词
```

---

## 2. 提示词优化经验沉淀（最重要）

### 2.1 关键转折：A6 第一次"瘦身 53%"是错误方向

**4496404 commit**（M1-A6 提示词瘦身版 15KB）：

- 出发点：误以为"简化提示词 = 减少 token 消耗"
- 实际效果：瘦身导致关键决策点（schema 完整定义 / 函数 JSDoc / 错误码触发条件 / 测试断言细节）丢失
- 用户在 956fdc0 commit 时指出错误：**"细化也是一种优化"**
- 反向优化回 45KB（A6 v2）

### 2.2 提示词优化核心原则（已在 `user.md` 长期记忆沉淀）

**简化 ≠ 优化；细化 = 优化**

| 模式 | 效果 | 验证 |
|---|---|---|
| 简化提示词（15KB） | Cursor 推断/补全/权衡消耗大量 token；返工风险高 | A6 第一次瘦身 53% 失败 |
| **详尽提示词（45KB）** | **关键决策点全部锁死，Cursor 一次到位，token 反而少** | A6 v2 / A5 / A7 连续 3 个 commit 验证 |

### 2.3 4 类必须详尽的关键决策点

1. **schema 完整 model 定义**（不"列关键字段"，要完整 Prisma 代码块）
2. **业务函数 JSDoc + 校验链**（每个函数 15-30 行）
3. **错误码触发条件表**（code / HTTP / 名称 / 触发条件 / 客户端处理 5 列）
4. **测试用例完整断言细节**（describe + it + mock + expect，不只列名字）

### 2.4 4 类可省的样板（引用前切片避免重复）

- Zod schema 风格 → 引用前切片
- controller 风格 → 引用前切片
- routes/index.ts 挂载模式 → 引用前切片
- 5 角色 RBAC 结构 → 引用前切片

### 2.5 连续 3 个 commit 验证（A5 / A6 / A7）

| 切片 | 提示词大小 | 实际单测 | 提示词预估 | 越界 | 意外 |
|---|---|---|---|---|---|
| A5 | 45.5 KB | 21 | 18+ | 0 | 1（合理）|
| A6 | 45.3 KB | 21 | 21 | 0 | 3（合理）|
| A7 | 47.5 KB | 21 | 20+ | 0 | 1（合理）|

**结论**：45KB 量级详尽提示词 + 9-10 条红线 + 5-6 条声明 = Cursor 一次到位 0 越界。

---

## 3. 越界纪律统计（M1 全程）

### 3.1 强约束执行情况

| 切片 | 越界次数 | 意外处理 | 红线数量 |
|---|---|---|---|
| A1+A2 | 0 | Cursor 后台子任务卡死被中断（用户接手补齐） | 6 |
| A3 | 0 | flowKey 修正 + Prisma 反向关系 + auditLog 真实名（3 项合理） | 6 |
| A4 | 0 | notification 无 TEMPLATE_KEYS + 不加反向关系 + 服务层校验唯一性（3 项合理） | 6 + 1"不 import 跨 service" |
| A5 | 0 | employees 表无 position/baseSalary 字段（1 项合理） | 9 |
| A6 | 0 | assertArchiveAccess 自加 + 交接 task done 端点缺失 + 证书 mkdir（3 项合理） | 8 |
| A7 | 0 | CONTRACT_READ/WRITE M0 已存在（1 项合理） | 10 |

**M1 阶段 0 越界**（相比 M0.5-5 任务的越界，是质的飞跃）。

### 3.2 关键约束执行率

| 约束 | 执行率 | 验证方式 |
|---|---|---|
| 旧测试零改动 | 100% | `git diff --name-only "*.test.ts"` = 空（6 次 commit 全部） |
| 不 import 跨 service | 100% | grep 验证 import 列表（6 次 commit 全部） |
| 5 角色结构不变 | 100% | git diff permissions.ts ROLE_PERMISSIONS 段（6 次 commit 全部） |
| bypassTemplate fallback | 100% | notification.service.ts 已有函数签名未修改（6 次 commit 全部） |
| 业务规则走 configService | 100% | grep getValue + fallback TODO 注释（6 次 commit 全部） |

---

## 4. M1 阶段技术亮点

### 4.1 复用模式（**零重写**原则）

A3/A4/A5/A6/A7 全部复用 M0.5 + A1+A2 已有能力，**无重写**：

| 复用对象 | 复用次数 | 来源 |
|---|---|---|
| approval.submitApproval / withdraw | 5/5（A3-A7） | M0.5-1 |
| notification.sendNotification | 5/5（A3-A7） | M0.5-2 |
| configService.getValue | 5/5（A3-A7） | M0.5-6 |
| auditService.auditLog | 5/5（A3-A7） | M0.5 |
| cryptoService.encrypt / decrypt | 3/5（A3/A4/A7） | M0.5-3 |
| employeeAI 3 个 OCR 方法 | 1/5（A3） | A1+A2 |

### 4.2 prisma 直接操作（**不 import 跨 service**）

A4/A5/A6/A7 全部通过 prisma 直接操作关联表，**不 import 跨 service**：

| 切片 | 直接操作 | 不 import |
|---|---|---|
| A4 regularization | prisma.employee.update + prisma.employeeSalaryHistory.create | employee.service |
| A5 transfer | prisma.employee.update + prisma.employeePositionHistory.create + employeeSalaryHistory.create | employee.service |
| A6 offboarding | prisma.employee.update + prisma.user.update | employee.service + auth.service |
| A7 contract | prisma.employee.findFirst | employee.service |

**4 个连续 commit 100% 遵守"不 import 跨 service"原则**，避免循环依赖。

### 4.3 业务规则配置化（V1.2 §三.5.2 强约束）

11 类必配置化业务规则中，M1 阶段实施：

| 配置键 | 切片 | 用途 |
|---|---|---|
| configs.employee_no.format | A1+A2 | 工号生成规则 |
| configs.headcount.warning_ratio | A1+A2 | 编制预警 |
| configs.onboarding.required_materials | A3 | 入职必填材料 |
| configs.onboarding.checklist | A3 | 入职引导清单 |
| configs.onboarding.default_role | A3 | 默认账号角色 |
| configs.onboarding.default_password_pattern | A3 | 默认密码生成 |
| configs.probation.months | A4 | 试用期月数 |
| configs.probation.remind_days | A4 | 转正提醒天数 |
| configs.regularization.approval_flow_key | A4 | 转正审批流 key |
| configs.regularization.salary_effective | A4 | 薪资生效策略 |
| configs.regularization.approval_nodes | A4 | 转正审批节点 |
| configs.archive.years | A6 | 档案保留年限 |
| configs.offboarding.handover_template | A6 | 工作交接清单 |
| configs.offboarding.approval_flow_key | A6 | 离职审批流 key |
| configs.offboarding.account_disable_strategy | A6 | 账号禁用时机 |
| configs.offboarding.certificate_template | A6 | 离职证明模板 |
| configs.offboarding.certificate_number_format | A6 | 证书编号规则 |
| configs.offboarding.archive_access_after_1y | A6 | 离职 1 年后档案访问 |
| configs.transfer.approval_flow_key | A5 | 调动审批流 key |
| configs.transfer.approval_nodes | A5 | 调动审批节点（4 级） |
| configs.transfer.salary_effective | A5 | 调动薪资生效 |
| configs.transfer.requires_salary_for_promote | A5 | 晋升/降职必填薪资 |
| configs.transfer.max_future_days | A5 | 未来生效日上限 |
| configs.contract.warning_days | A7 | 合同到期 3 级预警 |
| configs.contract.esign_provider | A7 | e-签宝服务方 |
| configs.contract.esign_api_key | A7 | e-签宝 API key（加密） |
| configs.contract.esign_webhook_secret | A7 | e-签宝 webhook 密钥（加密） |
| configs.contract.attachment_max_size | A7 | 附件最大 10MB |
| configs.contract.attachment_allowed_types | A7 | 附件 MIME 白名单 |
| configs.contract.approval_flow_key | A7 | 合同审批流 key |
| configs.contract.templates | A7 | 5 类合同模板路径 |

**M1 阶段配置 30+ 项**，全部走 configService + fallback + TODO 注释。

### 4.4 错误码段位分配（M1 7 个切片）

| 段位 | 切片 | 错误码数 |
|---|---|---|
| 71001-71099 | A1+A2（公司 + 部门） | 7 |
| 71101-71199 | A1+A2（部门） | 7 |
| 71201-71299 | A1+A2（员工） | 6 |
| 71301-71399 | A3（入职） | 10 |
| 71401-71499 | A4（转正） | 8 |
| 71501-71599 | A6（离职） | 10 |
| 71601-71699 | A5（调动） | 10 |
| 71701-71799 | A7（合同） | 10 |

**总错误码**：M1 阶段新增 **68 个错误码**（7xxxx 段位 71001-71799）

### 4.5 5 角色 RBAC 结构

5 角色结构（M0 锁定）始终不变：
- admin / hr / dept_head / finance / executive

M1 阶段仅追加 **18 个新权限点**：
- COMPANY_READ/WRITE（A1+A2）
- DEPARTMENT_READ/WRITE（A1+A2）
- EMPLOYEE_READ/WRITE/READ_SENSITIVE/AI_OCR（A1+A2）
- ONBOARDING_READ/WRITE/CONFIRM（A3）
- REGULARIZATION_READ/WRITE（A4）
- TRANSFER_READ/WRITE/APPROVE（A5）
- OFFBOARDING_READ/WRITE/CERTIFICATE（A6）
- CONTRACT_SIGN（A7）
- + CONTRACT_READ/WRITE（M0 预留）

---

## 5. M1 阶段已知限制（留给后续切片或二期）

### 5.1 留给 M2 考勤假勤的 BullMQ 调度

A4/A5/A6/A7 都暴露了"给 BullMQ 调用"函数，但 BullMQ 调度任务本身不在 M1 范围：

| 暴露函数 | 用途 | 留给 |
|---|---|---|
| `regularization.listUpcomingRegularizations(days)` | 试用期到期前 N 天提醒 | M2 独立任务或 M5 联调 |
| `transfer.listUpcomingTransfers(days)` | 调动生效日 N 天前调度 | M2 独立任务 |
| `offboarding.listUpcomingResignations(days)` | 离职生效日 N 天前提醒 | M2 独立任务 |
| `offboarding.disableUserAccount(strategy='on_resignation_date')` | 离职生效日 0 点自动禁用账号 | M2 BullMQ 触发 |
| `offboarding.checkArchiveAccess(employeeId, userRoles, resignationDate)` | 离职 1 年后档案 RBAC 校验 | M1 已实现函数，调用方在 M2+ |
| `contract.listExpiringContracts(days)` | 合同到期前 N 天预警 | M2 独立任务 |
| `contract.expireContract(contractId)` | 合同到期自动流转 expired | M2 独立任务 |

### 5.2 留给二期 ESS 模块

| 限制 | 切片 | 二期处理 |
|---|---|---|
| 权限重算（调动后员工在新部门的角色权限） | A5 | 二期 ESS 或独立任务 |
| 员工自助提交（员工提交转正申请） | A4 | 二期 ESS |
| 员工邮箱归档（离职后邮箱保留 3 个月） | A6 | 二期 ESS 或独立任务 |
| 在职/收入/实习证明 | A6 | 二期 ESS 证明开具模块 |
| e-签宝真实 SaaS 集成 | A7 | 二期接 e-签宝（参考 `docs/e-sign-cost.md`） |
| multipart 附件上传 | A7 | 二期升级（当前仅 attachmentUrl 字符串） |

### 5.3 留给 M4 薪酬核算

| 限制 | 切片 | M4 处理 |
|---|---|---|
| 薪资结算（含未发工资 + 补偿金 + 调休折现） | A6 | M4 薪酬 |
| 社保减员 + 公积金封存 | A6 | M4 薪酬 |
| 自动调薪逻辑（晋升/降职时） | A5 | M4 薪酬（**A5 仅写历史，不自动算薪**） |

### 5.4 数据库设计相关

- `employees` 表无 `position` 字段（岗位在 `employee_position_history` 历史表中追踪）
- `employees` 表无 `baseSalary` 字段（薪资在 `employee_salary_history` 历史表中追踪）
- A5 提示词假设 employees 有 position/baseSalary，**实际没有**——Cursor 正确识别边界

---

## 6. 提示词库累计

`docs/cursor-prompts/` 累计 **9 个 .md 文件**（约 270KB）：

| 文件 | 大小 | 类型 |
|---|---|---|
| README.md | 3.4 KB | 提示词库说明 + 强约束条款 |
| M0.5-5-ai-foundation.md | 16 KB | 早期任务 |
| M0.5-wrap-up.md | 15 KB | M0.5 收尾 |
| M1-A1-A2.md | 33 KB | A1+A2 合并（早期 33KB 模式） |
| M1-A3.md | 30 KB | A3（早期 30KB 模式） |
| M1-A4.md | 31 KB | A4（早期 31KB 模式） |
| M1-A5.md | 45 KB | A5（**45KB 详尽模式**起点） |
| M1-A6.md | 45 KB | A6（反向优化版） |
| M1-A7.md | 47 KB | A7（详尽模式稳定） |
| **M1-wrap-up.md**（本文件）| ~15 KB | M1 收尾报告 |

**模式演进**：
- 早期 30-33KB（A1+A2/A3/A4）→ 详尽 45-47KB（A5/A6/A7）
- A6 中间尝试瘦身 15KB（错误）→ 反向优化 45KB（验证成功）

---

## 7. M2 考勤假勤启动建议

### 7.1 V1.2 §四.6 B1-B6 切片

| 切片 | 范围 | 估时 |
|---|---|---|
| B1 | 班次定义 + 排班规则 | 3d |
| B2 | 打卡管理（WiFi/GPS/考勤机/补卡 4 方式）| 3d |
| B3 | 请假 / 加班 / 调休 | 3d |
| B4 | 假期额度（年假/病假/事假）| 2d |
| B5 | 考勤异常处理 + 申诉 | 2d |
| B6 | 月度汇总 + 报表 | 3d |

### 7.2 M2 关键技术挑战

- **多工时制**：标准工时 / 综合工时 / 不定时工时（3 种时间规则）
- **多打卡方式**：WiFi SSID 校验 / GPS 坐标范围 / 考勤机导入（得力 e+）/ 补卡审批
- **BullMQ 调度密集**：班次自动切换、假期自动重置、月度汇总
- **AI 能力**：AI 异常检测（迟到/早退/缺卡模式识别）

### 7.3 M2 启动建议

1. **优先 B1 班次定义**（基础数据，先建）
2. **B2 打卡管理**（4 方式，先做 WiFi + GPS，**得力 e+ 留二期**）
3. **B3 请假/加班/调休**（复用 M0.5-1 审批流）
4. **B4 假期额度**（configs.leave.* 走配置中心）
5. **B5 异常处理**（AI 异常检测留到 M3 之后）
6. **B6 月度汇总**（聚合 + 报表）

### 7.4 提示词策略

- 沿用 A5/A6/A7 **45KB 详尽模式**
- 4 类关键决策点必须详尽（schema / JSDoc / 错误码 / 测试断言）
- 样板可省（Zod / controller / routes 挂载 / 5 角色 RBAC）引用前切片
- BullMQ 调度任务单独写一份"调度任务提示词"（不要混在主切片提示词里）

---

## 8. 经验沉淀（已写入 `user.md` 长期记忆）

| 沉淀点 | 内容 | 来源 |
|---|---|---|
| **Cursor 任务强约束** | 5 条红线（禁越界 / 禁改未授权 / 禁改旧测试 / 必须报告 / 禁"我觉得有用"） | M0.5-5 教训（2026-08-25） |
| **Cursor 提示词优化写法** | 简化 ≠ 优化；细化 = 优化。4 类必须详尽 + 4 类可省 | A6 反向优化（2026-08-26） |
| **prisma 直接操作原则** | A4-A7 跨表操作走 prisma，不 import 跨 service，避免循环依赖 | A4 教训（2026-08-26） |
| **bypassTemplate fallback 模式** | notification.service.ts 无 TEMPLATE_KEYS，service 层用 bypassTemplate 字段 | A4 教训（2026-08-26） |
| **flowKey 格式规范** | 调 approval.submitApproval 必须用 `category:key` 格式（如 `'onboarding:onboarding_approval'`） | A3 教训（2026-08-26） |

---

## 9. 总结

M1 组织人事模块（V1.2 §四.5）**全部 7 个切片已完成**：

- ✅ A1+A2 组织架构 + 员工档案（25 端点）
- ✅ A3 入职流程（5 端点）
- ✅ A4 转正流程（4 端点）
- ✅ A5 调动流程（5 端点）
- ✅ A6 离职流程（6 端点）
- ✅ A7 合同管理（6 端点）

**测试**：276/276 通过（M0.5 收尾 140 → M1 收尾 276，+136）
**业务代码**：7 个 commit
**提示词库**：9 个 .md，~270KB
**0 越界**：M1 全程 0 越界（相比 M0.5-5 越界教训，是质的飞跃）
**0 旧测试改动**：M1 阶段所有 commit 0 旧测试被改

**下一阶段**：M2 考勤假勤（V1.2 §四.6，B1-B6 切片，6 切片 16 周工时）
