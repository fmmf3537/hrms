# M4-C4 算薪引擎 + 算薪流程 + AI 算薪校验摘要

薪酬核算 C4 切片（V1.2 §四.8.1 C4 行 + §二.4.2）。M4 核心切片。

## 范围

- 3 张表：`payroll_runs` / `payslips` / `payslip_items`
- 12 个端点：挂载于 `/api/salary/payrolls/*`（追加在 `salary.ts`）
- 5 个权限点：`SALARY_PAYROLL_RUN_READ/WRITE/APPROVE` + `SALARY_PAYSLIP_READ/WRITE`
- 10 个错误码：73401-73410
- 6 项 configs：`salary.payroll.*`
- 3 级审批：`payroll:hr_submit` → `payroll:finance_review`（hr 兼任）→ `payroll:ceo_approve`
- AI 摘要：**复用** M0.5-5 `aiSummarizeService.summarize`（不重写）

## 不在本切片

- 不实现工资条 PDF/HTML / 银企直连 / 个税申报（C5）
- 不实现销售提成核算（C6）/ 调薪实际执行（C8）
- 不写 `employee_salary_history`
- 不改 C1/C2/C3 及 D1–D6 service
- 5 角色 RBAC，无 finance（财务复核由 hr 兼任）
