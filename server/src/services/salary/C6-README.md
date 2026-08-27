# M4-C6 销售提成季度结算（与 D5 联动）

薪酬核算 C6 切片（V1.2 §二.5.4 + M3-wrap-up「D5 提成发放联动 M4」）。**1 新表** `commission_settlements`。只读复用 D5 commissions / payments / products + employees / departments。

## 范围

- 8 个端点：`/api/salary/commissions/*`（4 汇总 + 4 结算单状态机）
- 4 个权限点：`SALARY_COMMISSION_READ` / `SETTLE` / `CONFIRM` / `CANCEL`
- 10 个错误码：73601-73610
- 6 项 configs：`salary.commission.*`
- 财务确认由 **hr / executive 兼任**（无 finance 角色）
- **强制 mockMode: true**，不联动 C4 算薪（`salesCommissionAmount` 继续默认 0）

## 不在本切片

- 不实现季度结算 → 工资条合并（不写 `payslip_items` / `payroll_runs` / `payslips`）
- 不写 `employee_salary_history`
- 不 import / 不改 D5 三个 sales service
- 不调用 C4 payroll / payslip service
- 不调 M0.5-1 审批流 / M0.5-2 邮件 / M0.5-5 AI
- 不实现 V1.2 切片表 C5 劳务费（留二期）
- 5 角色 RBAC，无 finance
