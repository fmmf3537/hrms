# M4-C8 调薪实际执行（联动 D6 + 写 employee_salary_history）

薪酬核算 C8 切片（V1.2 §二.4.5 调薪 + M3-wrap-up §7 D6 遗留）。**1 新表** `salary_adjustments`。prisma 写 M1 `employee_salary_history` / `employee_position_history`，同步 C1 `employee_salary_plans`。只读 D6 `audit_logs`（`SALARY_ADJUSTMENT_PROPOSE`），**不调用** D6 service。

## 范围

- 8 个端点：`/api/salary/adjustments/*`（创建 / 列表 / 详情 / 提交 / 审批 / 执行 / 取消 / 批量执行）
- 5 个权限点：`SALARY_ADJUSTMENT_READ` / `WRITE` / `APPROVE` / `EXECUTE` / `CANCEL`（另 `READ_SELF` 给员工本人）
- 10 个错误码：73801-73810
- 6 项 configs：`salary.adjustment.*`
- 调薪由 **hr 发起 + 审批 + 执行**（复核由 hr 兼任；无独立 finance 角色）
- **仅暴露** `executePendingAdjustments(actorId, asOfDate)`，**不创建 BullMQ 队列**

## 不在本切片

- 不创建 BullMQ 调度（V1.2 §四.8 由 M0.5 独立任务接入）
- 不给 `employees` 表加 `baseSalary` 字段
- 不重写 D6 `proposeAdjustment`（D6 仅 audit）
- 不联动 C4 算薪 / C5 工资条 / C6 提成 / C7 成本预警
- 不实现减薪 / grade 升降级 / 调薪池（二期 BI）
- 5 角色 RBAC，无 finance
