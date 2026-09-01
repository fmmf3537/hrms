# M5-2-D2-fix2 修订任务（opencode headless）

M5-2-D2 代码已就绪，审核发现 **7 个 ESLint error**（全部是风格级，逐一修复，不做任何其他改动）：

1. `client/src/api/types/performanceRecord.ts` 第 4 行：行超长（138 > 120），折行
2. 同文件第 279 行：改用对象解构（prefer-destructuring）
3. 同文件第 341 行：行超长（160 > 120），折行
4. `client/src/views/__tests__/performance-record.test.ts` 第 21-22 行：`@/router/performance` 重复 import，合并为一条 import 语句
5. `client/src/views/performance/record/RecordDetail.vue` 第 100 行：字符串拼接改模板字符串（prefer-template）
6. 同文件第 482 行：`gradeToScoreHint` 先使用后定义，把该函数定义移到使用处之前
7. 修完后确保不再引入新问题

**禁止**：修改清单外任何文件 / server/** / package.json / git commit / 运行测试套件（审核方重跑）。

完成后，最终回复列出每个文件改动的 diff 摘要。
