# M3-D6 结果应用模块（M3 收尾）

## 范围

- 调薪建议：**0 新表**，记录走 `audit_logs`（`SALARY_ADJUSTMENT_PROPOSE/APPROVE`）
- 晋升评估：**0 新表**，记录走 `audit_logs`（`PROMOTION_PROPOSE/EVALUATE`）
- PIP 触发：`performance_pips` + `performance_pip_reviews` 2 张表
- 8 个 API 端点（`/api/performance/applications/*`）
- 8 个权限点、10 个错误码（72901-72910）、11 项 configs

## 算法

**调薪**：近 4 季度 archived `finalGrade`；S 比例 ≥ 50% → 10%；否则 A 比例 ≥ 50% → 5%；否则 0。不写 `employee_salary_history`。

**晋升**：近 2 年 archived；`count(A) ≥ 2 OR count(S) ≥ 1`。不写 `employee_position_history`。

**PIP**：连续 2 季度 D → active，期限 3 个月；月度评审 1/2/3；`worsened` → failed（仅 audit `PIP_FAIL_TRIGGER_OFFBOARDING`，不调 A6 离职）。

## 红线

- 不写薪资/岗位历史，不调 payroll / offboarding / transfer
- 不实现培训管理（仅读取 `pip.training_required` config）
- 不修改 D1–D5 十四个 performance service
- 5 角色不含 finance
