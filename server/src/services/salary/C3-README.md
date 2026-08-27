# M4-C3 个税引擎（工资薪金累计预扣 + 年终奖 + 劳务报酬）

薪酬核算 C3 切片（V1.2 §四.8.1 C3 行 + §二.4.4 + §二.4.5）。

## 范围

- **0 新表**（纯算法层；计算快照留 C5 `payslips`）
- 3 个 service：`tax_calculation` / `tax_year_end_bonus` / `tax_labor_income`
- 6 个端点：挂载于 `/api/salary/tax/*`（追加在 `salary.ts`，不分新路由文件）
- 3 个权限点：`SALARY_TAX_READ` / `SALARY_TAX_CALCULATE` / `SALARY_TAX_ANNUAL_SETTLEMENT`
- 10 个错误码：73201-73210
- 10 项 configs：`salary.tax.*`

## 不在本切片

- 不创建 `payslips` / `payslip_items` / `tax_records`（C5）
- 不实现算薪引擎（基础 + 绩效 + 加班 + 考勤扣款，C4）
- 不实现算薪流程审批 / AI 算薪校验摘要（C4）
- 不实现银企直连 / 个税实际申报（C5）
- 不改 C1 3 service / C2 3 service / D1-D6 14 service
- 5 角色 RBAC，无 finance

## 算法要点

月度个税（C3 简化版）：`taxable = max(0, baseAmount - 5000)`，按 7 级年累计税率表找档（含上限），`tax = max(0, taxable × rate - quickDeduction)`。完整跨月累计预扣走 `calculateCumulativeTax`；算薪引擎汇总留 C4。

年终奖：`bonusAmount / 12` 找档，`tax = max(0, bonusAmount × rate - quickDeduction)`。

劳务报酬：≤4000 减 800，否则减 20%；再按 20%/30%/40% 三级超额累进。
