# M5-03 员工数据迁移工具

> 一期上线前用于把 40 名真实员工的档案从 Excel 迁移进 PostgreSQL。
> 本目录仅包含迁移工具脚本与产物，**不修改任何业务代码**。

---

## 目录结构

```
server/scripts/migration/
├── README.md                    本文件（运行手册）
├── generate-template.ts         模板 + 样例 + 错误样例生成器
├── import-employees.ts          迁移导入脚本（dry-run / 正式 / purge）
├── output/                      gitignore；模板、样例、报告产物
└── tmp/                         gitignore；调试用 .mjs 脚本（不走 tsx）
```

---

## 前置条件

1. **PostgreSQL 已启动**（`localhost:5501`，docker compose 默认配置）
2. **已执行 `prisma migrate deploy`**（表结构已建）
3. **已执行 `pnpm db:seed`**（公司 XACH、4 个部门 PEDU/HR/FIN/TECH、5 名种子员工）
4. **真实组织架构的部门需先在系统组织模块创建**（如生产交付中心等）。本脚本只迁员工主档，不会自动创建部门；模板中的「部门代码」必须已存在于数据库，否则该行校验失败。
5. **依赖已安装**：`pnpm install`（含 `xlsx@0.18.5`，本切片新加 devDependency）

---

## 五步操作流程

### ① 生成模板与样例文件

```bash
pnpm --filter hrms-server migration:template
```

产物落到 `server/scripts/migration/output/`：

- `员工档案迁移模板.xlsx` —— HR 按此模板填写真实数据；含两个 sheet：员工档案 + 填写说明
- `员工档案迁移样例.xlsx` —— 40 行合成合法数据（工号 `XACH2099xxxx`），用于端到端自测
- `员工档案迁移错误样例.xlsx` —— 5 行典型错误演示，用于人工学习校验报告

### ② HR 填写真实数据

HR 在「员工档案迁移模板.xlsx」上填入 40 名员工真实数据，删除示例行，**不要修改表头列名**。

### ③ Dry-run 预演

```bash
pnpm --filter hrms-server migration:employees -- --file output/员工档案迁移样例.xlsx --dry-run
```

输出：

- 合法行数 / 将跳过行数 / 失败行数
- 每行详情（行号 + 工号 + 姓名 + 结果）
- 退出码：0 = 全通过；1 = 有校验错误

不写库，可反复跑。

### ④ 正式导入

```bash
pnpm --filter hrms-server migration:employees -- --file output/员工档案迁移样例.xlsx
```

行为：

- 复用 `server/src/services/employee.service.ts` 的 `createEmployee()` 函数（自动加密敏感字段 / 自动生成临时工号 / 自动写岗位历史 / 自动写薪资历史（若提供基本工资）/ 自动写审计日志 / 自动调度合同到期通知）
- createEmployee 自动生成的工号 = `XACH<year><seq:4>`（如 `XACH20260006`），但导入脚本会再 `prisma.employee.update` 把工号回写为 Excel 期望值（如 `XACH20990001`），保证工号语义清晰
- 任何一行失败 → 该行被回滚（硬删除 employee + 关联的 employee_position_history + employee_salary_history），其他行继续
- 报告落盘 `output/import-report-<yyyymmdd-hhmmss>.json`
- 退出码：0 = 全成功或全跳过；1 = 有失败

### ⑤ 双跑校验（PRD 风险管理明确要求）

```bash
pnpm --filter hrms-server migration:employees -- --file output/员工档案迁移样例.xlsx
```

期望输出：

- 「成功 0 / 跳过 40 / 失败 0」（同一文件第二次跑，所有工号已在库，全部走幂等跳过分支）
- 员工总数不变（库中既有 XACH2099 前缀员工数 == 40）

任何一行重新走 createEmployee = 不会发生，证明幂等去重键（工号）生效。

---

## CLI 参数

| 参数 | 说明 | 默认值 |
|---|---|---|
| `--file <path>` | xlsx 文件路径（相对 `server/scripts/migration/` 或绝对路径） | 必填 |
| `--company <code>` | 公司代码（XACH） | `XACH` |
| `--dry-run` | 只校验 + 报告，不写库 | `false` |
| `--purge-test-data` | 硬删除 `XACH2099` 前缀的所有测试员工 | `false` |

`--dry-run` 与 `--purge-test-data` **互斥**（不会同时出现）。

---

## 迁移边界说明（本期不迁的字段）

下列字段由 HR 上线后在系统内逐人补录，**本脚本不处理**：

| 字段 | 表 | 补录方式 |
|---|---|---|
| `workHistory`（工作经历） | employees.json | 系统内编辑 |
| `certificates`（资质证书） | employees.json | 系统内编辑 + 附件上传 |
| `userId`（账号） | employees | HR 逐个开通（用户管理模块） |
| `salary_plans`（薪酬方案） | employee_salary_plans | 薪酬模块 |
| `insurance_registrations`（社保参保登记） | employee_insurance_registrations | 薪酬模块 |
| `attendance_records` / `leave_requests` 等关联档案 | M2 多张表 | 考勤模块按真实打卡产生 |

一期上线前确认：员工主档迁入即可，关联数据上线后随业务自然补齐。

---

## 测试数据清理

```bash
pnpm --filter hrms-server migration:employees -- --purge-test-data
```

- **硬删除**所有 `XACH2099` 前缀员工（连同 `employee_position_history` + `employee_salary_history`，子表无 FK 故走 `prisma.$transaction` 三表同步删）
- 安全措施：硬编码白名单前缀 `XACH2099`，不接受任意前缀参数
- 既有 5 名种子员工（`XACH20260001-0005`）不受影响
- 输出删除条数

---

## 真实数据回滚 SQL（线上真迁后）

如需按工号段回滚真实迁移：

```sql
-- 警告：硬删除，操作前请备份 + 二次确认
BEGIN;

-- 替换 'XACH2026' 为真实工号前缀
WITH target_emps AS (
  SELECT id FROM employees WHERE employee_no LIKE 'XACH2026%' AND deleted_at IS NULL
)
DELETE FROM employee_salary_history WHERE employee_id IN (SELECT id FROM target_emps);
WITH target_emps AS (
  SELECT id FROM employees WHERE employee_no LIKE 'XACH2026%' AND deleted_at IS NULL
)
DELETE FROM employee_position_history WHERE employee_id IN (SELECT id FROM target_emps);
DELETE FROM employees WHERE employee_no LIKE 'XACH2026%' AND deleted_at IS NULL;

COMMIT;
```

子表删除顺序：`employee_salary_history` → `employee_position_history` → `employees`（这两张子表无 FK，故任何顺序均可，但保持同步更清晰）。

---

## 故障排查

| 现象 | 可能原因 | 解决 |
|---|---|---|
| `数据库连接失败` | `DATABASE_URL` 未设置或 docker 未启动 | 检查 `server/.env` 中 `DATABASE_URL` 字段名是否完整，docker compose 是否运行 |
| `公司不存在: XACH` | seed 未跑 | 跑 `pnpm db:seed` |
| `部门代码不存在: PEDU` | seed 未完成 / 部门代码拼错 | 查 `prisma.department` 表确认 code 列 |
| `工号格式非法` | 工号含非法字符（中文 / 空格 / 标点） | 4-30 位字母数字 |
| `createEmployee 异常: 工号已存在` | 既有员工工号冲突 | 删除 Excel 中重复工号行 |
| 身份证号 / 手机号始终报错「格式非法」 | 列名错位 / 单元格类型异常 | 保持列名不变，重打开 Excel 检查 |
| `ENCRYPTION_KEY 必须是 64 位十六进制字符串` | 生产环境未注入密钥 | dev 默认占位 `aaa...`，prod 必须从 KMS 注入 |
| 报告 json 找不到 | output/ 被 gitignore | 文件存在，只是未 git track，符合预期 |

---

## 关键决策

### 工号保留策略：补偿式回滚（不强制外层事务）

`createEmployee()` 内部不显式使用 `prisma.$transaction`（其副作用含 BullMQ 异步调度 `notificationService.sendNotification`，无法归入事务）。因此**不**强制把 createEmployee + updateEmployeeNo 包入外层事务；改用补偿式回滚：

1. `createEmployee()` → 拿到自增工号（如 `XACH20260006`）
2. 若与 Excel 期望（如 `XACH20990001`）不一致 → `prisma.employee.update` 回写
3. 回写失败（如唯一约束 P2002）→ `hardDeleteEmployee(empId)`（硬删 employees + employee_position_history + employee_salary_history）→ 该行标记失败，继续下一行

### xlsx 日期单元格处理

`XLSX.readFile` 默认把日期单元格读成 JS `Date` 对象。`getCell()` 统一按 `YYYY-MM-DD` 格式输出字符串，规避序列数差异；非法日期字符串再由 `isValidDateString()` 二次校验。

### purge 的关联子表删除顺序

实读 `server/prisma/schema.prisma` 与 migrations：

- `employee_position_history` / `employee_salary_history` **没有 `@relation` 声明**，migration 也**未建立 FK**（grep 全文件仅 regularization / offboarding / transfer / contract / 几张绩效/薪酬表有 FK）
- 因此硬删 employee 时，PG 不会自动级联；但 createEmployee 只向这两张子表 + audit_logs + employees 写入（无 regularization/transfer/contract 等的副作用）
- purge 走 `prisma.$transaction([deleteMany position_history, deleteMany salary_history, deleteMany employees])`，三表同步删除避免孤儿

---

## 文件清单

| 文件 | 用途 |
|---|---|
| `server/scripts/migration/generate-template.ts` | 模板 + 样例 + 错误样例生成器 |
| `server/scripts/migration/import-employees.ts` | 迁移导入主脚本（dry-run / 正式 / purge） |
| `server/scripts/migration/README.md` | 本运行手册 |
| `server/package.json` | 新增 2 个 script + `xlsx@0.18.5` devDep |
| `.gitignore` | 追加 output/ + tmp/ 两行 |

业务代码 `server/src/**` / `server/prisma/**` / `client/**` / 根 `package.json` **零改动**。
