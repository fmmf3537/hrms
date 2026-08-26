# M3-D4 绩效兑现模块

## 范围

- 兑现模式配置（`performance_payout_configs`）：direct / pool 双轨制切换
- 兑现记录（`performance_payouts`）：直乘、部门池、预支、清算
- 8 个 API 端点（`/api/performance/payouts/*`）
- 4 个权限点、10 个错误码（72701-72710）、8 项 configs

## 双轨制公式（V1.2 §二.5.3）

**直乘（默认）**：`actualAmount = baseAmount × coefficient`（D 档 excluded_grades → 0）

**部门池**：`deptPool = Σ(basePerformanceSalary) × deptCoefficient`；`个人 = deptPool × (个人系数 / 部门系数总和)`

**预支**：季度前 2 月按 `base × 1.0 × prepay_rate`（默认 50%）

**清算**：季度末 `difference = actualQuarterTotal - alreadyPrepaid`（多退少补，仅标记 + audit）

## 依赖（只读）

- `performance_records`（status=archived, finalGrade）
- `performance_coefficients`（5 档系数）
- `employee_salary_history`（performanceSalary 基数）
- `employees` / `departments`（部门池聚合）

## 红线

- 不联动 M4 薪酬
- 不修改 D1+D2+D3 业务代码
- hybrid 模式留 D4+ 联调
