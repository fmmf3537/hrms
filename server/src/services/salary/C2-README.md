# M4-C2 社保公积金方案（西安 / 北京 / 四川）

薪酬核算 C2 切片（V1.2 §四.8.1 + §二.4.3）。

## 范围

- 3 张表：`social_insurance_schemes` / `housing_fund_schemes` / `employee_insurance_registrations`
- 9 个端点：挂载于 `/api/salary/insurances/*`（追加在 `salary.ts`，不分新路由文件）
- 4 个权限点：`SALARY_INSURANCE_READ/WRITE`、`SALARY_HOUSING_FUND_READ/WRITE`
- 10 个错误码：73101-73110
- 6 项 configs：`salary.insurance.*` + `salary.housing_fund.*`

## 不在本切片

- 不实现社保/公积金自动算扣（留 C3 算薪引擎）
- 不创建 `payslips` / `tax_records` / `service_fees`
- 不写 `employee_salary_history`（留 C8）
- 不改 C1 3 个 salary service / 3 张表 / 7 端点
- 5 角色 RBAC，无 finance

## 三地费率（示例，2024-07）

| 城市 | 养老 单位/个人 | 医疗 单位/个人 | 失业 单位/个人 | 公积金 |
|---|---|---|---|---|
| 西安 | 16% / 8% | 8% / 2% | 0.7% / 0.3% | 5%-12% |
| 北京 | 16% / 8% | 10%（含大病 1%）/ 2% | 0.5% / 0.5% | 5%-12% |
| 四川 | 16% / 8% | 8.5% / 2% | 0.6% / 0.4% | 5%-12% |

生育并入医保（C2 仍保留 maternity 险种配置，费率可为 0）。工伤个人不缴。
