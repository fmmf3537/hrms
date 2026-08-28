# M4-C7 人力成本预警（加班费占比 + 离职率）

薪酬核算 C7 切片（V1.2 §四.8 C4 行「2 项高频预警」兜底 + §三.5.2 hr_attrition.*）。**1 新表** `hr_cost_alerts`。只读复用 C4 payslips / payslip_items、B4 overtime_requests、A6 offboarding_records、M1 employees。

## 范围

- 6 个端点：`/api/salary/cost-alerts/*`（scan / 列表 / 详情 / 确认 / 关闭 / 统计）
- 4 个权限点：`SALARY_COST_ALERT_READ` / `SCAN` / `ACK` / `CLOSE`
- 10 个错误码：73701-73710
- 5 项 configs：`salary.cost_alert.*`（沿用已有 `hr_attrition.overtime_ratio_threshold` / `monthly_threshold`）
- 人力成本预警由 **hr 触发 + executive 查看**（无 finance 角色）
- **仅暴露扫描函数** `scanOvertimeRatioAlerts` / `scanAttritionAlerts`，**不创建 BullMQ 队列**

## 不在本切片

- 不创建 BullMQ 调度（V1.2 §四.8 每日 02:00 由 M0.5 独立任务接入）
- 不实现预算编制 / 预算 vs 实际 / 调薪池 / 倒挂（二期 BI）
- 不联动 C4 算薪（不 import payroll_calculation / payroll_run / payslip.service）
- 不联动 C5 工资条 / C6 销售提成
- 不写 `employee_salary_history`
- 不调 M0.5-1 审批流 / M0.5-5 AI
- 5 角色 RBAC，无 finance
