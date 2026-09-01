# M5-2-D2-fix1 修订任务（opencode headless）

M5-2-D2 的代码已写完，审核发现 **3 个 TypeScript 编译错误**，请只修复这 3 处，不做任何其他改动：

1. `client/src/api/types/performanceRecord.ts`：`Grade` 类型与 `GRADE_LABELS` 常量需要导出
   - 注意：`client/src/api/types/performance.ts`（D1 文件，**禁止修改**）里已有 `Grade` 和 `GRADE_LABELS`
   - 推荐做法：在 performanceRecord.ts 中 `import { GRADE_LABELS } from './performance'` 并 `export type { Grade } from './performance'`（或 re-export），保持单一事实来源
2. `client/src/views/performance/record/RecordDetail.vue` 第 53/57 行的 import 相应修正（从 performanceRecord 或直接从 performance 导入，与第 1 条的做法对齐）
3. `client/src/api/__tests__/performanceRecord.test.ts` 第 130 行：删除未使用的 `req` 变量（或改为实际断言使用它）

**禁止**：修改其他任何文件 / 修改 server/** / 修改 package.json / git commit / 运行测试套件（审核方会重跑）。

完成后，最终回复列出：改了哪几个文件、每处改动的 diff 摘要。
