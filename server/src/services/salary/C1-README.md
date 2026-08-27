# M4-C1 薪级薪档配置 + 员工薪酬方案

薪酬核算模块启动切片（V1.2 §四.8.1 + §二.3.1）。

## 范围

- 3 张表：`salary_grades` / `salary_grade_levels` / `employee_salary_plans`
- 7 个端点：挂载于 `/api/salary/*`
- 4 个权限点：`SALARY_GRADE_READ/WRITE`、`SALARY_PLAN_READ/WRITE`
- 10 个错误码：73001-73010
- 5 项 configs：`salary.grade.*` + `salary.plan.*`

## 不在本切片

- 不写 `employee_salary_history`（留 C8）
- 不实现 C2-C8（社保 / 算薪 / 工资条 / 提成核算 / 预算 / 调薪执行）
- 不创建 `payslips` / `social_insurance` / `tax_records` / `service_fees`
- 不联动 M3 绩效（D1-D6 service 0 行改动）
- 5 角色 RBAC，无 finance

## 序列与固浮比

| 序列 | 含义 | 固定:浮动 |
|---|---|---|
| M | 高管 + 部门负责人 | 60:40 |
| T | 技术 | 80:20 |
| P | 生产 | 75:25 |
| A | 职能 | 85:15 |
| S | 销售 | 0（提成制，D5 已有） |
