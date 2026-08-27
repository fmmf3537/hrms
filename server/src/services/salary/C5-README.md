# M4-C5 工资条 + 银企代发 + 个税申报 + 工资表导出

薪酬核算 C5 切片（V1.2 §二.4.6 + §三.6）。**0 新表**，复用 C4 `payroll_runs` / `payslips` / `payslip_items`。

## 范围

- 7 个端点：工资条生成/HTML/PDF/发放 + 银企导出 + 个税申报 + 工资表导出
- 4 个权限点：`SALARY_PAYSLIP_GENERATE` / `SALARY_BANKING_EXPORT` / `SALARY_TAX_DECLARE` / `SALARY_REPORT_EXPORT`
- 10 个错误码：73501-73510
- 6 项 configs：`salary.payslip.*` / `salary.banking.*` / `salary.report.*`
- 工资条发送：**复用** M0.5-2 `notificationService.sendNotification`
- 银企 / 个税 / 报表：**强制 mockMode: true**，不接真实银行/税务局/Excel/PDF 库

## 不在本切片

- 不接真实银行 API / 税务局 API（V1.2 §三.6 留二期）
- 不实现前端 UI
- 不创建表 / migration
- 不改 C1–C4 / D1–D6 service
- 5 角色 RBAC，无 finance
