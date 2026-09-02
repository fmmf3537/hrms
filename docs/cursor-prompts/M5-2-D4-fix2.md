# M5-2-D4-fix2 修订任务（opencode headless）

M5-2-D4 的测试已全部通过（86/86），审核方重跑 lint 发现 **10 个 error + 1 个 warning**，全部是机械性风格问题。请只修复这些问题，不做任何其他改动：

## 错误清单（`pnpm --filter hrms-client lint` 输出）

1. `client/src/api/performanceSales.ts` 14:1 — 行长 131 > 120（max-len），拆行
2. `client/src/api/types/performanceSales.ts` 4:1 — 行长 121 > 120，拆行
3. `client/src/api/types/performanceSales.ts` 70:3 — `*/` 前缺空格/制表符（spaced-comment），把 `*/` 单独放一行
4. `client/src/views/performance/sales/CommissionList.vue` 38:8 与 40:35 — `@/api/types/performanceSales` 重复导入（import/no-duplicates），合并为一条 import 语句
5. `client/src/views/performance/sales/CommissionList.vue` 314:1 — 行长 154 > 120，拆行
6. `client/src/views/performance/sales/PaymentList.vue` 27:61 / 28:30 / 38:8 / 40:35 — 两处重复导入（`@/api/performanceSales` 与 `@/api/types/performanceSales` 各重复一次），合并
7. `client/src/views/performance/sales/ProductList.vue` —  lint 输出中被截断的剩余 error/warning（共 1 个 warning + 可能有 1 个 error 在你这个文件），自行用下面的命令定位后修复

## 允许的执行（仅这一次破例）

只允许运行**针对上述 4 个文件**的定向修复与检查：

```bash
cd client && npx eslint --fix src/api/performanceSales.ts src/api/types/performanceSales.ts "src/views/performance/sales/*.vue"
cd client && npx eslint src/api/performanceSales.ts src/api/types/performanceSales.ts "src/views/performance/sales/*.vue"
```

第一条修可自动修的问题（重复导入、部分 max-len），第二条确认剩余问题并手动修完。**禁止**运行全量 `pnpm lint` / `pnpm test` / `type-check` / `build`，禁止 `eslint --fix` 其他文件。

## 禁止

- 修改上述 4 个文件以外的任何文件 / server/** / package.json / git add / git commit
- 整文件重写（编码红线：UTF-8 无 BOM，外科式小编辑）

完成后，最终回复列出：改了哪几个文件、每处改动的 diff 摘要、定向 eslint 复查结果（0 problems 的截图式文本）。
