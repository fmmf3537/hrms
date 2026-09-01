# M5-2-D3-fix1 修订任务（Codex headless）

M5-2-D3 的代码已写完，审核方重跑验收后发现 **7 处问题**（4 个未使用导入/变量 + 2 个纯 lint 风格 + 1 个 D2 测试断言），请只修复这 7 处，不做任何其他改动：

## A. 未使用导入 / 变量（TS6133 + eslint no-unused-vars，同根因）

1. `client/src/views/__tests__/performance-payout.test.ts` 第 16 行：删除未使用的 `PERFORMANCE_D2_MENU` 导入
2. `client/src/views/__tests__/performance-payout.test.ts` 第 18 行：删除未使用的 `PERFORMANCE_MENU` 导入
3. `client/src/views/performance/payout/PayoutDetail.vue` 第 17 行：`PAYOUT_STATUS_MAP` 导入了但未使用
   - 二选一：**优先**在详情页实际使用它（如状态描述/时间线标题用 `PAYOUT_STATUS_MAP[payout.status].label`），或直接删除该导入
4. `client/src/views/performance/payout/PayoutList.vue` 第 59 行：删除未使用的 `canRead` 变量

## B. 纯 lint 风格（2 处）

5. `client/src/api/performanceGrade.ts` 第 39 行：`spaced-comment` 报错——多行注释的 `*/` 紧跟在文字后面（`批量等级计算：recordIds（≥1）+ force + batchSize（≤100）*/`）。把 `*/` 单独放一行，或在 `*/` 前加空格
6. `client/src/views/performance/payout/PayoutDetail.vue` 第 129 行：行长 171 > 120（`el-steps :active="..."` 那行）。把 `:active` 的表达式提取为 `activeStep` 计算属性（script 里），模板改为 `:active="activeStep"`

## C. D2 测试断言（1 处，**授权的条件修改**，与 D1 测试 children 断言同先例）

7. `client/src/views/__tests__/performance-record.test.ts` 第 289-294 行附近：D3 在 D2 的 records 路由之后又追加了 4 条路由（grade-actions / payout-config / payouts / payouts/:id），导致：
   - `expectEqual(children.length, 8, ...)` → 改为 `12`，消息同步更新为 `1 redirect + 5 D1 + 2 D2 + 4 D3 children`
   - `children.slice(-2)` 断言最后两条是 records / records/:id —— 现在最后两条已变成 D3 的 payouts / payouts/:id。修正断言：D2 两条路由改用 `children.slice(6, 8)` 验证（位置不变），**并新增**对最后两条（payouts / payouts/:id）的断言
   - 加注释说明「M5-2-D3 追加 4 路由导致本用例更新」（与 D1 测试文件中的注释风格一致）

## 重要：文件编码红线

- 工作区所有源文件是 **UTF-8 无 BOM**。**禁止**用 PowerShell `Out-File -Encoding utf8` / `Set-Content` 整文件重写（PS 5.1 会写入 BOM）；只做**外科式小编辑**
- 修改完成后自查：上述每个被改文件的前 3 字节不得是 `EF BB BF`

## 禁止事项

- 修改上述 7 处以外的任何内容 / 修改 server/** / 修改 package.json / git add / git commit
- **不要运行** pnpm test / type-check / lint / build（审核方会统一重跑）

完成后，最终回复列出：改了哪几个文件、每处改动的 diff 摘要、以及被改文件无 BOM 的自查结论。
