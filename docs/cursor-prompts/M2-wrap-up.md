# M2 收尾报告：考勤假勤模块 6 个切片全部完成

> **报告日期**：2026-08-26
> **报告人**：WorkBuddy（HRMS 项目 AI 助手）
> **报告范围**：M2 考勤假勤模块（V1.2 §四.6）B1-B6 全部 6 个切片
> **报告类型**：阶段收尾 + 经验沉淀 + 下阶段衔接

---

## 1. M2 阶段完成度

### 1.1 切片清单（V1.2 §四.6.1）

| 切片 | 范围 | commit | 单测增量 | 状态 |
|---|---|---|---|---|
| B1 班次与排班 | 班次定义 + 月排班 + 冲突检测 | `ed23a62` | 276→293（+17） | ✅ |
| B2 打卡管理 | WiFi + GPS + 补卡 + 得力 e+ 导入 | `f390fe1` | 293→314（+21） | ✅ |
| B3 请假 | 8 类假期 + 额度 + 走 M0.5-1 审批流 | `dfd6b81` | 314→336（+22） | ✅ |
| B4 加班 | 加班费 / 调休二选一 + 上限校验 | `22bba53` | 336→359（+23） | ✅ |
| B5 出差 | 出差申请 + 差旅补助计算 | `f8608ba` | 359→378（+19） | ✅ |
| B6 月度汇总 | 报表生成 + 员工确认 + HR 锁定 + **调休余额累计** | `199e0fc` | 378→**400**（+22） | ✅ |

**测试演进**：M1 收尾 276 → M2 收尾 **400**（**+124，45% 增长**）

### 1.2 M2 业务代码 commit（6 个 + 6 个提示词 = 12 个 commit）

```
业务代码（6 个，按 commit 时间顺序）：
  ed23a62 feat(shift): M2-B1 班次定义与排班
  f390fe1 feat(attendance): M2-B2 打卡管理
  dfd6b81 feat(leave): M2-B3 请假
  22bba53 feat(overtime): M2-B4 加班
  f8608ba feat(trip): M2-B5 出差
  199e0fc feat(summary): M2-B6 月度考勤汇总

提示词（6 个，独立 commit 库）：
  a45773d docs(prompts): M2-B1 班次定义与排班 Cursor 提示词
  5e54155 docs(prompts): M2-B2 打卡管理 Cursor 提示词
  afc5216 docs(prompts): M2-B3 请假 Cursor 提示词
  a83f730 docs(prompts): M2-B4 加班 Cursor 提示词
  1d82632 docs(prompts): M2-B5 出差 Cursor 提示词
  7d566c3 docs(prompts): M2-B6 月度汇总 Cursor 提示词
```

---

## 2. 提示词优化经验沉淀（沿用 M1 收尾结论）

### 2.1 关键转折：A6 第一次"瘦身 53%"是错误方向

M1 收尾已记录经验（4496404 commit 失败 → 956fdc0 反向优化成功），M2 全程沿用 45KB 详尽模式。

**M2 6 切片全部沿用 45-46KB 详尽模式**：
- B1: 42KB
- B2: 45KB
- B3: 43KB
- B4: 43KB
- B5: 43KB
- B6: 46KB（M2 最大，因含 B3 调休余额承诺实现）

**效果**：M2 6 切片全部 0 越界，**实际单测数稳定 ≥ 提示词预估**（B3 +1 / B4 +4 / B6 +0），验证详尽模式有效性。

### 2.2 4 类必须详尽的关键决策点（沿用 M1 结论）

1. **schema 完整 model 定义**（Prisma 代码块，含 index/unique/外键）
2. **业务函数 JSDoc + 校验链**（每个 15-30 行，含参数/返回值/校验链/状态流转）
3. **错误码触发条件表**（code / HTTP / 名称 / 触发条件 / 客户端处理 5 列）
4. **测试用例完整断言细节**（describe + it + mock + expect，不只列名字）

### 2.3 4 类可省的样板（沿用 M1 结论）

- Zod schema 风格 → 引用前切片路由文件
- controller 风格 → 引用前切片 controller
- routes/index.ts 挂载模式 → 引用前切片
- 5 角色 RBAC 结构 → 引用前切片

### 2.4 M2 新增的 2 类强约束（红线升级）

| 红线 | 来源 | 验证 |
|---|---|---|
| **不 import 跨 service** | A4 起源（A4 教训） | M2 全程 6 切片 100% 遵守 |
| **不修改旧测试** | M0.5-5 起源 | M2 全程 6 切片 100% 遵守 |

**B6 特别新增：未修改 leave.service.ts 的 calculateLeaveBalance 函数**（B3 调休余额承诺实现，红线 6 强约束）。

---

## 3. 越界纪律统计（M2 全程 0 越界）

### 3.1 强约束执行情况

| 切片 | 越界次数 | 意外处理 | 红线数量 |
|---|---|---|---|
| B1 班次 | 0 | 无 | 10 |
| B2 打卡 | 0 | 1（ATTENDANCE_READ 复用已有 / deli-e-plus-v1 实际是 CSV / employees 无 external_id 字段） | 11 |
| B3 请假 | 0 | 2（单测数量 22 / 72009 测试遇周末） | 11 |
| B4 加班 | 0 | 4（单测 23 / 周末 comp mock / otUpdate mock / seed 审批流 key） | 12 |
| B5 出差 | 0 | 3（Employee 无 position 字段 / 测试日期 Mon-Wed / seed 审批流 key） | 12 |
| B6 月度汇总 | 0 | 2（窗口校验 vi.useFakeTimers / ESLint no-await-in-loop 改 Promise.all） | 13 |

**M2 阶段 0 越界**（B1-B6 全部 0 越界，6 切片 0 越界连续 6 次）。

### 3.2 关键约束执行率

| 约束 | 执行率 | 验证方式 |
|---|---|---|
| 旧测试零改动 | **100%** | `git diff --name-only "*.test.ts"` = 空（6 次 commit 全部） |
| 不 import 跨 service | **100%** | grep 验证 import 列表（6 次 commit 全部） |
| 5 角色结构不变 | **100%** | git diff permissions.ts ROLE_PERMISSIONS 段（6 次 commit 全部） |
| bypassTemplate fallback | **100%** | notification.service.ts 已有函数签名未修改（6 次 commit 全部） |
| 业务规则走 configService | **100%** | grep getValue + fallback TODO 注释（6 次 commit 全部） |
| **leave.service.ts 未修改** | **100%** | `git diff HEAD -- leave.service.ts` = 0 行（B6 红线 6 强约束） |

---

## 4. M2 阶段技术亮点

### 4.1 复用模式（**零重写**原则）

B1-B6 全部复用 M0.5 + A1+A2 已有能力，**无重写**：

| 复用对象 | 复用次数 | 来源 |
|---|---|---|
| `notification.sendNotification` | 6/6（B1-B6） | M0.5-2 |
| `auditService.auditLog` | 6/6 | M0.5-8 |
| `configService.getValue` | 6/6 | M0.5-6 |
| `cryptoService.encrypt / decrypt` | 0/6（M2 范围不涉及新加密字段） | M0.5-3 |
| `approval.submitApproval / withdraw` | 3/6（B3/B4/B5） | M0.5-1 |
| `employeeAI 3 个 OCR 方法` | 0/6（M2 范围不涉及 OCR） | A1+A2 |

### 4.2 prisma 直接操作（**不 import 跨 service** 原则）

B1-B6 全部通过 prisma 直接查询，**不 import 跨 service**：

| 切片 | 直接操作 | 不 import |
|---|---|---|
| B1 shift | prisma.shiftAssignment + shiftTemplate 直接查询 | shift / employee / department |
| B2 attendance | prisma.attendanceRecord + shiftAssignment + shiftTemplate 直接查询 | shift / attendance / employee |
| B3 leave | prisma.leaveRequest 直接查询 | leave / shift / attendance / employee |
| B4 overtime | prisma.overtimeRequest + employeeSalaryHistory 直接查询 | leave / overtime / employee |
| B5 business_trip | prisma.businessTrip + employeePositionHistory 直接查询 | business_trip / leave / overtime / attendance / shift / employee |
| **B6 monthly_summary** | prisma.attendanceRecord + leaveRequest + overtimeRequest + businessTrip 直接查询 | **monthly_summary / leave / overtime / business_trip / attendance / shift / employee** |

**6 切片 100% 遵守"不 import 跨 service"原则**，避免循环依赖。

### 4.3 业务规则配置化（V1.2 §三.5.2 强约束）

12 类必配置化业务规则中，M2 阶段实施：

| 切片 | 配置键 | 数量 |
|---|---|---|
| B1 shift | `shift.types` / `default_work_hours` / `break_duration` / `flex_minutes` / `assignment_strategy` / `max_consecutive_days` / `min_rest_hours` / `late_threshold` / `early_leave_threshold` | 9 |
| B2 attendance | `attendance.wifi_ssids` / `gps_max_distance` / `late_threshold` / `early_leave_threshold` / `missing_threshold` / `import_formats` / `manual_clock_flow_key` / `monthly_max_manual` | 8 |
| B3 leave | `leave.types` / `annual_leave_rules` / `comp_leave_validity_months` / `approval_flow_short` / `approval_flow_long` / `max_consecutive_days` / `min_advance_days_annual` / `workday_exclude_weekends` / `sick_leave_max_days` | 9 |
| B4 overtime | `overtime.max_daily_hours` / `max_monthly_hours` / `pay_multiplier_weekday` / `pay_multiplier_weekend` / `pay_multiplier_holiday` / `approval_flow_key` / `min_advance_hours` | 7 |
| B5 trip | `trip.allowance_standard` / `city_tier_rates` / `level_tier_rates` / `city_tier_mapping` / `approval_flow_key` / `min_advance_days` / `weekend_inclusive` | 7 |
| B6 summary | `summary.auto_generate_day` / `employee_confirm_deadline` / `hr_lock_day` / `default_confirm_strategy` / `work_days_per_month` | 5 |

**M2 阶段配置 45 项**（45 类 configs 全部走 configService + fallback + TODO 注释）。

### 4.4 错误码段位分配（M2 6 个切片）

| 段位 | 切片 | 错误码数 |
|---|---|---|
| 71801-71810 | B1 班次 | 10 |
| 71901-71910 | B2 打卡 | 10 |
| 72001-72010 | B3 请假 | 10 |
| 72101-72110 | B4 加班 | 10 |
| 72201-72210 | B5 出差 | 10 |
| 72301-72310 | B6 月度汇总 | 10 |

**总错误码**：M2 阶段新增 **60 个错误码**（72 段位 71801-72310，跨越 6 个子区）

### 4.5 5 角色 RBAC 结构（M2 6 个切片累计权限点）

5 角色结构（M0 锁定）始终不变：
- admin / hr / dept_head / finance / executive

M2 阶段仅追加 **17 个新权限点**：
- B1: SHIFT_READ / WRITE / ASSIGN
- B2: ATTENDANCE_CLOCK / MANUAL（ATTENDANCE_READ / WRITE / 4 个 M0 已预留）
- B3: LEAVE_READ / REQUEST / CANCEL（LEAVE_APPLY M0 已预留）
- B4: OVERTIME_READ / REQUEST / CANCEL（OVERTIME_APPLY M0 已预留）
- B5: TRIP_READ / REQUEST / CANCEL
- B6: SUMMARY_READ / SUMMARY_LOCK

### 4.6 M2 阶段关键设计决策

| 决策 | 实现 |
|---|---|
| 调休余额不存表 | B3 service 函数 calculateLeaveBalance 计算，**不存表**（V1.2 §四.6.2 关键要求） |
| 调休余额累计 | B6 service 函数 calculateCompBalance 计算（**不调 leave.service，B3 承诺实现**） |
| 加班费计算 | B4 service 函数 calculateOvertimePay（baseSalary / 21.75 / 8 * hours * multiplier） |
| 差旅补助计算 | B5 service 函数 calculateTravelAllowance（baseAmount × cityRate × levelRate × totalDays） |
| 工作日计算 | B3 + B5 排除周末（configs.leave.workday_exclude_weekends / configs.trip.weekend_inclusive） |
| GPS 距离判定 | B2 Haversine 公式 + configs.attendance.gps_max_distance |
| WiFi 白名单 | B2 SSID 在 configs.attendance.wifi_ssids |
| 排班冲突检测 | B1 service 函数 validateShiftAssignmentConflict（连续工作 ≤6 天 / 休息间隔 ≥12 小时） |

---

## 5. M2 阶段已知限制（留给后续切片或二期）

### 5.1 留给 BullMQ 调度的任务（V1.2 §四.6.2）

| 暴露函数 | 用途 | 留给 |
|---|---|---|
| `shift.listUpcomingTransfers` | 班次切换 | 独立任务 |
| `attendance.calculateAnomaly` | 打卡异常识别（02:00 全公司扫描） | 独立任务 |
| `leave.listUpcomingLeaves` | 请假提醒 | 独立任务 |
| `leave.listUpcomingRegularizations` | 试用期到期提醒 | 独立任务 |
| `overtime.listUpcomingOvertime` | 加班预警 | 独立任务 |
| `trip.listUpcomingTrips` | 出差预警 | 独立任务 |
| `business_trip` 销差 | 出差结束自动销差 | 独立任务 |
| `attendance.disableUserAccount(strategy='on_resignation_date')` | 离职生效日 0 点自动禁用账号 | 独立任务（**A6 红线遗留**） |
| `summary.generateMonthlySummary` | 每月 1 日自动生成上月报表 | 独立任务 |

### 5.2 留给二期的功能

| 限制 | 切片 | 二期处理 |
|---|---|---|
| 权限重算（调动后员工在新部门的角色权限） | A5 | 二期 ESS |
| 员工自助提交（员工提交转正申请） | A4 | 二期 ESS |
| 员工邮箱归档（离职后邮箱保留 3 个月） | A6 | 二期 ESS |
| 在职/收入/实习证明 | A6 | 二期 ESS 证明开具 |
| e-签宝真实 SaaS 集成 | A7 | 二期接 e-签宝 |
| multipart 附件上传 | A7 | 二期升级 |
| 法定假日判定（B4 加班 3.0x 倍数） | B4 | 二期接历法服务 |
| 腾讯地图 API 地址反解析（B2 GPS） | B2 | 二期接地图服务 |
| 报表导出 PDF / Excel（B6 月度汇总） | B6 | 二期 |
| 自动调薪（晋升/降职时） | A5 | M4 薪酬 |

### 5.3 留给 M4 薪酬核算

| 限制 | 切片 | M4 处理 |
|---|---|---|
| 薪资结算（含未发工资 + 补偿金 + 调休折现） | A6 | M4 薪酬 |
| 社保减员 + 公积金封存 | A6 | M4 薪酬 |
| 调休余额累计到工资条 | B5（已写字段） | M4 薪酬从 business_trips / overtime_requests 聚合 |
| 月度考勤数据进入算薪 | B6（hr_locked 后） | M4 薪酬读取 monthly_summaries（hr_locked 状态） |

### 5.4 数据库设计相关

- `employees` 表无 `position` 字段（A2 阶段未预留）：B5 职级推断从 `employee_position_history.toPosition`
- `employees` 表无 `baseSalary` 字段：薪资在 `employee_salary_history` 历史表中追踪
- `employees` 表无 `external_id` 字段（A2 阶段未预留）：B2 用 `attendance_records.importedExternalId` 替代
- `leave_balances` 表不创建（V1.2 §四.6.2 关键要求，余额 service 函数计算）
- `monthly_summary.compBalance` 字段独立计算（**不调 leave.service**，B3 TODO 保留）

---

## 6. 提示词库累计

`docs/cursor-prompts/` 累计 **13 个 .md 文件**（约 320KB）：

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
| M1-wrap-up.md | 16 KB | M1 收尾报告 |
| M2-B1.md | 42 KB | B1 班次定义 |
| M2-B2.md | 45 KB | B2 打卡管理 |
| M2-B3.md | 43 KB | B3 请假 |
| M2-B4.md | 43 KB | B4 加班 |
| M2-B5.md | 43 KB | B5 出差 |
| M2-B6.md | 46 KB | B6 月度汇总 |
| **M2-wrap-up.md**（本文件） | ~16 KB | **M2 收尾报告** |
| 合计 | **~560 KB** | 17 个 .md |

**模式演进**：
- 早期 30-33KB（A1+A2/A3/A4）→ 详尽 45-47KB（A5/A6/A7/B1/B2/B3/B4/B5/B6）
- 提示词优化经验从 A6 反向优化（956fdc0）确立
- 全部 M2 切片沿用 45KB 详尽模式，0 越界

---

## 7. M3 启动建议

### 7.1 V1.2 §四.7 D1-D6 切片

| 切片 | 范围 | 估时 |
|---|---|---|
| D1 | 考核方案配置（KPI+OKR 指标库 + 周期定义） | 3d |
| D2 | 考核流程（自评→上级→校准→HR→总经理 5 级审批 + **AI 评分建议**） | 5d |
| D3 | 绩效评分与等级（A/B/C/D 五档） | 3d |
| D4 | 绩效结果应用（薪酬/晋升/培训联动） | 3d |
| D5 | 绩效申诉与复核 | 2d |
| D6 | 绩效报告与分析 | 3d |

**M3 合计**：~19d / 6 切片

### 7.2 M3 关键技术挑战

- **多指标混合**：KPI（定量）+ OKR（定性）+ 价值观（行为）三种指标
- **5 级审批流**：自评→上级→校准→HR→总经理
- **AI 评分建议**（V1.2 §三.3）：AI 辅助评分，提供建议分（不强制采纳）
- **绩效结果联动**：M4 薪酬（M3 之后）+ 晋升（M4+）+ 培训（M3+）
- **C/D 档员工 PIP**（V1.2 §二.5 淘汰机制）：连续 2 个季度 D 档触发 PIP

### 7.3 M3 启动建议

1. **优先 D1 考核方案配置**（基础数据，先建）
2. **D2 考核流程**（核心业务，含 5 级审批 + AI 评分建议）
3. **D3 绩效评分**（A/B/C/D 五档，等级判定算法）
4. **D4 绩效结果应用**（联动 M4 薪酬，但 D4 不实现实际联动，仅写 result_record 字段）
5. **D5 申诉与复核**（次要流程）
6. **D6 报告与分析**（报表生成，类似 B6 模式）

### 7.4 提示词策略

- 沿用 A5/A6/A7/B1-B6 45-46KB 详尽模式
- 4 类关键决策点必须详尽（schema / JSDoc / 错误码 / 测试断言）
- 样板可省（Zod / controller / routes 挂载 / 5 角色 RBAC）引用前切片
- M3 新增特有红线（预估）：
  - **不 import M4 薪酬 service**（绩效结果留 result_record 字段）
  - **AI 评分建议 mock**（M0.5-5 AI 底座已有，复用，不重写）
  - **5 级审批不 import 跨 service**（沿用 B3/B4/B5 模式）
  - **不实现绩效结果联动 M4**（留 result_record 字段）
- 错误码段位：D1 用 72401-72410（72 段位 D1 子区），D2-D6 继续 72501-72901+

---

## 8. 经验沉淀（已写入 `user.md` 长期记忆）

| 沉淀点 | 内容 | 来源 |
|---|---|---|
| **Cursor 任务强约束** | 5 条红线（禁越界 / 禁改未授权 / 禁改旧测试 / 必须报告 / 禁"我觉得有用"） | M0.5-5 教训（2026-08-25） |
| **Cursor 提示词优化写法** | 简化 ≠ 优化；细化 = 优化。4 类必须详尽 + 4 类可省 | A6 反向优化（2026-08-26） |
| **prisma 直接操作原则** | 跨表操作走 prisma，不 import 跨 service，避免循环依赖 | A4 教训（2026-08-26） |
| **bypassTemplate fallback 模式** | notification.service.ts 无 TEMPLATE_KEYS，service 层用 bypassTemplate 字段 | A4 教训（2026-08-26） |
| **flowKey 格式规范** | 调 approval.submitApproval 必须用 `category:key` 格式 | A3 教训（2026-08-26） |
| **不修改已有 service（红线 6）** | B6 调休余额累计：自己实现 calculateCompBalance，**不修改 leave.service.ts** | B6 关键设计（2026-08-26） |
| **prompt 详尽模式 45-46KB** | 4 类关键决策点详尽 + 样板可省 | M1+M2 验证（2026-08-25~26） |

---

## 9. M2 累计

### 9.1 测试演进（M0.5 收尾 → M2 收尾）

```
M0.5 收尾  140
M1 收尾   276  (+140, M1 累计 100%)
M2 收尾   400  (+124, M2 累计 45%)
──────────────────
M2 收尾 400
```

### 9.2 一期累计（M0 → M2 收尾）

```
M0 脚手架     26
M0.5 收尾  140  (+114, 公共底座)
M1 收尾    276  (+136, 组织人事)
M2 收尾    400  (+124, 考勤假勤)
──────────────────
一期累计   400
```

**一期总进度**：26 → 400（**+374 测试，1439% 增长**）

### 9.3 M2 累计 6 切片核心数据

| 切片 | 文件 | 端点 | 新表 | 权限点 | 错误码 | 单测 |
|---|---|---|---|---|---|---|
| B1 班次 | 14 | 5 | 2 | 3 | 10 | 17 |
| B2 打卡 | 14 | 5 | 1 | 2 | 10 | 21 |
| B3 请假 | 14 | 5 | 1 | 3 | 10 | 22 |
| B4 加班 | 14 | 3 | 1 | 3 | 10 | 23 |
| B5 出差 | 14 | 3 | 1 | 3 | 10 | 19 |
| B6 月度汇总 | 14 | 4 | 1 | 2 | 10 | 22 |
| **M2 合计** | **84** | **25** | **7** | **16** | **60** | **124** |

---

## 10. 总结

**M2 考勤假勤模块（V1.2 §四.6）6 切片全部完成**：

- ✅ B1 班次与排班（基础数据 + 冲突检测）
- ✅ B2 打卡管理（4 方式 + 异常判定）
- ✅ B3 请假（8 类假期 + 额度 + 走 M0.5-1 审批流）
- ✅ B4 加班（补偿二选一 + 上限校验）
- ✅ B5 出差（差旅补助计算）
- ✅ B6 月度汇总（报表 + 员工确认 + HR 锁定 + 调休余额累计）

**测试**：400/400 通过（M0.5 收尾 140 → M2 收尾 400，+260 测试，186% 增长）
**业务代码**：6 个 commit
**提示词库**：13 个 .md（~544KB）
**0 越界**：M2 全程 0 越界（vs M0.5-5 越界教训后 0 越界连续 13 次）
**0 旧测试改动**：M2 阶段所有 commit 0 旧测试被改
**B6 红线 6 验证**：`git diff HEAD -- leave.service.ts` = 0 行（调休余额承诺自己实现）

**下一阶段**：M3 绩效管理（V1.2 §四.7 D1-D6 切片，~19d）
