---
name: dev-slice-loop
description: 切片化自动开发流水线——Kimi 起草切片提示词，驱动 headless 编码 agent CLI（opencode / Codex / dsh）后台执行，轮询进度，亲手审核验收，写修订提示词闭环，通过后业务提交。Use when the user wants to develop a project slice-by-slice with an automated prompt→execute→review→fix→commit loop, e.g. 「用自动化流程做下一个切片」「起草切片提示词并丢给 opencode/Codex/dsh 执行」「agent 写代码我审核的流水线」「把开发计划按切片自动实现」。需要项目已有切片化的开发计划/PRD 与明确的验收命令。
---

# 开发切片自动执行循环

把「人写需求 → AI 起草提示词 → 另一个 AI 执行 → AI 审核 → 闭环修订 → 提交」固化为流水线。用户只负责定开发计划与需求文档，以及拍板关键决策。

## 角色分工（不可越位）

- **Kimi（你）**：起草提示词、启动/轮询执行器、审核（亲手重跑验收）、写修订提示词、提交代码、汇报
- **执行 agent（opencode/Codex/dsh）**：只按提示词写代码，**不跑验收命令、不 git commit**（提速约定）
- **用户**：定计划、确认方案、在选型/取舍类问题上拍板

## 一次性环境搭建（新项目接入时做一遍）

1. 把本 skill 的 `scripts/` 下 6 个 runner 文件复制到目标项目的 `scripts/` 目录（项目根自动解析，无硬编码路径）
2. 项目 `.gitignore` 加入 `logs/`
3. 选定执行器并完成 CLI 安装认证 → 读 `references/executors.md`（含三工具配置、实测对比数据、Windows/Git Bash 公共坑）
4. 确认项目的验收命令集与当前基线数字（跑一遍记下来）
5. 确认项目已有切片化开发计划（如 `docs/cursor-prompts/` 目录惯例）

## 单切片循环（6 阶段）

### ① 起草提示词

读 `references/prompt-template.md` 按骨架起草。**全部事实实读核实**（API 路径、权限点、返回结构、基线数字），文件预算精确到个数，反直觉点显式标注。保存为 `docs/cursor-prompts/<切片ID>.md`。

### ② 提交提示词并启动执行器

先 `chore`/`docs` commit 提示词（出问题可回溯），再后台启动：

```bash
/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -ExecutionPolicy Bypass \
  -File "scripts/<dsh|oc|codex>-run.ps1" -SliceId <切片ID> -PromptFile docs/cursor-prompts/<切片ID>.md
```

### ③ 轮询（后台执行 20-40 分钟，Bash 300s 上限决定不能前台等）

每轮 `sleep 270-290` 后看 `logs/<工具>/<ID>.log` 尾部 + `git status --short`。完成判据 = 日志出现完整交付报告（Codex 还有 `<ID>.last.md`）。`.exitcode` 偶尔不落盘属正常；收尾按 pid/命令行匹配杀掉残留进程。

### ④ 审核（照清单，不偷懒）

读 `references/review-checklist.md` 严格执行：边界检查（git status vs 文件预算、红线目录 0 行）→ **亲手重跑全部验收命令** → 高风险点抽查 → BOM 检查。

### ⑤ 修订闭环

发现问题 → 攒齐后按 fix 模板写 `docs/cursor-prompts/<ID>-fixN.md` → 同一 runner 换 SliceId 再跑（修订轮实测 4-5 分钟）→ 重跑验收。通常 1-2 轮收敛。

### ⑥ 通过收尾

业务 commit（`feat(<scope>): <ID> <标题>（长括号摘要：文件数/端点数/测试基线变化/执行器与修订轮次/红线确认）`）→ 同步进度文档（如 AGENTS.md）→ 汇报范围/验收数字/问题处理/耗时。

## 红线

- 验收命令永远由你亲手重跑，**绝不采信 agent 自报结果**
- agent 越界产物直接清理；对既有文件的修改必须是最小化 + 注释 + 报告说明
- 选型/取舍类问题（如「这个接口权限该不该放开」）留给用户拍板，不替他决定
- 多切片连跑时，每个切片都要完整走完 6 阶段，通过后才起草下一个
