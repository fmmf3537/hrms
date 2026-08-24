# 任务 M0-06c：升级 vue-tsc 到 2.x 并验证前端构建通过

## 执行目录（重要）
所有命令必须在项目根目录 `D:/projects/hrms/` 下执行，不要在当前 AI 的工作文档目录执行。

## 背景
当前前端 `client` 的 `package.json` 里 `vue-tsc` 是 `^1.8.25`，但实际被 pnpm 解析装成了 `vue-tsc@1.8.27`，同时 `typescript` 被解析成 `5.9.3`。
**问题**：vue-tsc 1.x 通过正则 patch TypeScript 内部变量实现类型检查，而 TypeScript 5.5+ 改了内部实现，导致 `vue-tsc --noEmit` 直接崩溃（不是代码类型错误，是工具本身崩）。
后果：`pnpm type-check` 崩溃；`pnpm build`（脚本 = `vue-tsc --noEmit && vite build`）也失败。但 `vite build` 单独跑是成功的，说明业务代码没问题，纯粹是工具链版本错配。

## 目标
1. 将 `client/package.json` 中的 `vue-tsc` 升级到 **2.x 最新稳定版**（如 `^2.1.10` 或更高的 2.x）。vue-tsc 2.x 原生支持 TypeScript 5.5+，能正确对 Vue 3 组件做类型检查。
2. 安装依赖并验证 `type-check` 与 `build` 均通过。
3. 若出现**真实的类型错误**（不是工具崩溃），请定位并修复（不要绕过 type-check 来掩盖错误）。

## 执行步骤（请按顺序）
1. 先 `Read` 文件 `D:/projects/hrms/client/package.json` 确认当前 `vue-tsc` / `typescript` 版本声明。
2. 用编辑把 `client/package.json` 里 `vue-tsc` 的版本从 `^1.8.25` 改为 `^2.1.10`（或你判断合适的 2.x 稳定版本，确保与 `vue@3.4` 兼容）。
   - 不要改动 `typescript` 的版本声明（保持 `^5.3.3` 即可，让它继续解析到 5.9.x，vue-tsc 2.x 支持）。
3. 在项目根目录 `D:/projects/hrms/` 执行 `pnpm install`（用你自己的进程执行，能正常跑完；若提示 peer 冲突可加 `--no-frozen-lockfile`）。
4. 执行 `pnpm --filter hrms-client type-check`：
   - 如果输出是工具启动报错（非类型错误），说明版本仍有问题，请重新核对 vue-tsc 与 typescript 的兼容性并调整版本。
   - 如果是真实 TS/Vue 类型错误，请读取报错文件并修复，直到 `type-check` 退出码为 0。
5. 执行 `pnpm --filter hrms-client build`，确认 `vue-tsc --noEmit && vite build` 整体成功（退出码 0，且看到 vite 生成的 dist 产物）。
6. 如发现 `vue-tsc` 2.x 需要配套调整 `tsconfig` 或 `vite.config`，请一并处理并说明改了什么。

## 验收标准（全部满足才算完成）
- [ ] `client/package.json` 的 `vue-tsc` 已升级到 2.x
- [ ] `pnpm install` 成功，无阻断性错误
- [ ] `pnpm --filter hrms-client type-check` 退出码 0（类型检查通过，无真实类型错误）
- [ ] `pnpm --filter hrms-client build` 退出码 0，dist 产物生成
- [ ] 没有通过删除 `vue-tsc` 步骤或跳过 type-check 来"假装"通过

## 最终报告
完成后请简洁报告：
1. 升级前后的 vue-tsc / typescript 实际版本
2. type-check 与 build 的结果（退出码）
3. 是否修复了类型错误，修复了几处、分别是什么
4. 有没有改动 tsconfig / vite.config，变动内容

## 禁止事项
- 不要改动后端 server 代码
- 不要改动数据库 / Prisma
- 不要为了通过构建而删除类型检查步骤
- 不要把业务代码里真实的类型错误用 `any` / `@ts-ignore` 粗暴掩盖（除非确属第三方类型缺失，需说明理由）
