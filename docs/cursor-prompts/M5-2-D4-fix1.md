# M5-2-D4-fix1 修订任务（opencode headless）

M5-2-D4 的代码已写完，审核方重跑验收发现 **2 个测试断言失败**（源码 0 问题，都是测试文件的计数/下标断言）。请只修复这 2 处，不做任何其他改动：

## 1. `client/src/views/__tests__/performance-payout.test.ts`（约 111 行起）

`filterPerformanceMenu 5 角色 RBAC` 用例的菜单计数断言还是 D3 时代的数字。D4 追加了 3 个菜单（sales-products `product:read` / sales-payments `payment:read` / sales-commissions `commission:read`），按后端 RBAC 矩阵各角色新计数为：

- admin（通配）：9 → **12**
- hr（D4 三菜单权限全有）：9 → **12**
- executive（有 product:read / payment:read / commission:read 三个读）：7 → **10**
- dept_head（同样三个读）：4 → **7**
- employee（仅 product:read）：1 → **2**（payouts「我的奖金」+ sales-products）

逐断言更新数字与 it() 标题，并加注释说明「M5-2-D4 追加 3 菜单导致计数更新」。**先实读该用例全部断言**，把所有受影响的计数（含 hr/executive/dept_head/employee 各段）都改到，不要只改报错的第一处。

## 2. `client/src/views/__tests__/performance-sales.test.ts`（约 252-257 行）

「与 D3 路由边界对比」段的下标算错了：`children.slice(-6, -3)` 实际取到的是 idx 9/10/11 = `payout-config / payouts / payouts/:id`，而 D3 四条路由的真实位置是 **idx 8-11**（grade-actions=8 / payout-config=9 / payouts=10 / payouts/:id=11）。

修正：改取 `children.slice(8, 12)` 断言 D3 四条（含 payouts/:id），下标注释同步改为 idx 8-11。

## 事实参考（已实读 `router/performance.ts` children 顺序，共 15 条）

`0=redirect / 1-5=D1(cycles,indicators,schemes,coefficients,grade-thresholds) / 6-7=D2(records,records/:id) / 8-11=D3(grade-actions,payout-config,payouts,payouts/:id) / 12-14=D4(sales-products,sales-payments,sales-commissions)`

## 禁止

- 修改上述 2 个文件以外的任何文件 / server/** / package.json / git add / git commit
- 运行 pnpm test / type-check / lint / build（审核方会重跑）
- 整文件重写（编码红线：UTF-8 无 BOM，外科式小编辑）

完成后，最终回复列出：改了哪 2 个文件、每处改动的 diff 摘要。
