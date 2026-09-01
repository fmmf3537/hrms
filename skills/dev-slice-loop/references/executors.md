# 执行器（headless coding agent CLI）：安装、配置与坑位

三套 runner 已在 `scripts/` 提供，接口统一：`-SliceId <ID> -PromptFile <提示词路径>`，产物都在 `logs/<工具>/` 下。

## 一、三工具配置要点

### opencode（推荐主力）
- 安装：`npm i -g opencode-ai`；认证按其官方流程（模型在 `-Model` 参数指定，默认 `minimax-cn/MiniMax-M3`，按需改 oc-run.ps1 默认值）
- 命令：`opencode run "<task>" -m <model>`
- 优点：日志带每条工具调用与命令回显，**可观测性最好**；修订闭环收敛快
- 实测：D2（16 端点前端切片）首跑 ~35 分钟 + 2 轮修订 × 4 分钟

### Codex CLI
- 安装：`npm i -g @openai/codex`；配置 `~/.codex/config.toml`（provider + model + `wire_api = "responses"`——注意新版本已砍掉 `"chat"`）
- API key：runner 从 Windows **用户级**环境变量注入子进程（不落地不打印），变量名与 config.toml 里 provider 的 `env_key` 对应
- 命令：`codex exec --approve-for-me -C "<root>" -o "<last.md>" "<task>"`（无 `--full-auto`，用 `--approve-for-me`；`-o` 落最终回复）
- 优点：交付报告最详细，主动记录取舍与已知问题
- 坑：**Windows 下习惯用 PowerShell `Out-File -Encoding utf8` 整文件重写 → 全部文件带 UTF-8 BOM**。对策：提示词强约束里加「禁整文件重写、无 BOM、外科式编辑」，审核时查前 3 字节（`EF BB BF` 即中招）
- 实测：D3（11 端点前端切片）首跑 ~25 分钟 + 1 轮修订 5 分钟

### dsh（DeepSeek Harness）
- 命令：`pnpm dlx @deepseek-ai/dsh --profile headless "<task>"`（需 pnpm）
- 优点：实测首跑质量最高（D1 一次通过全部验收）
- 缺点：**黑盒**——过程日志不可观测，且曾越界留下清单外产物（mock 脚本、`.pnpm-store`），需审核时清理
- 实测：D1（12 端点前端切片）~23 分钟一次通过

## 二、公共坑（Windows + Git Bash 环境，全部踩过）

1. **Bash 工具有 300s 上限，而 agent 单轮要 20-40 分钟** → 必须走 runner 后台 + 轮询，绝不能前台等
2. **轮询节奏**：`sleep 270-290` 后 `tail -c 400 日志 + git status --short`；完成判据 = 日志出现完整交付报告 / `.last.md` 落盘
3. **`.exitcode` 偶尔不落盘**（进程残留）→ 以报告完整为完成判据；收尾用 pid 文件或按命令行匹配杀掉残留进程
4. **node/pnpm 不在默认 PATH** → runner 的 cmd 包装里前置 `%APPDATA%\npm` / `%APPDATA%\pnpm`；审核方自己在 Bash 里 `export PATH="$APPDATA/npm:/c/Program Files/nodejs:$PATH"`
5. **Git Bash 调 cmd** 用 `cmd.exe //c`（双斜杠）；调 PowerShell 用全路径 `/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe`
6. **MSYS 会吃掉命令行里的 `$_`** → 复杂的 PowerShell 逻辑写成临时 .ps1 文件再 `-File` 调用，不要内联 `-Command`
7. **ps1 含中文必须存为 UTF-8 带 BOM**，否则 PS 5.1 解析乱码报错（注意：这只针对 ps1 脚本自身；项目源码文件必须无 BOM）
8. **假提示词冒烟测试会让 agent 过度思考**（内容对不上时它停下来追问）→ 冒烟用真任务片段或接受它「停在追问」也算链路通

## 三、选型数据（同仓库同标准 A/B/C，2026-09-01）

| 维度 | dsh | opencode | Codex |
|---|---|---|---|
| 首跑耗时 | ~23 min | ~35 min | ~25 min |
| 首跑验收 | 一次通过 | 3 TS + 7 lint 错 | 4 未用导入 + 2 lint + 1 断言 |
| 修订 | 0 轮 | 2 轮 × 4 min | 1 轮 × 5 min |
| 总耗时 | ~23 min | ~43 min | ~30 min |
| 可观测性 | ❌ 黑盒 | ✅ 最好 | ✅ 好 |
| 报告质量 | 合格 | 详细 | 最详细 |
| 越界风险 | ⚠️ 残留产物 | 无 | ⚠️ BOM 污染 |

结论：首跑错误三者同量级（都是「按约定不跑验收」导致的机械错误），差距在透明度。**推荐 opencode 主力 + Codex 备选**；dsh 质量虽好但黑盒 + 越界残留，不适合无人值守。
