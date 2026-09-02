# 审核清单（审核者 = 你自己，agent 的交付一律视为「待证伪」）

## 核心原则

**绝不采信 agent 自报的验收结果。** 按提速约定 agent 不跑验收命令；即使它跑了并声称通过，也必须亲手重跑。实测三工具首跑都会留下机械性错误（未使用导入、lint 风格、既有断言失效），靠审核兜底。

## 1. 边界检查（最先做，越界直接打回）

```bash
git status --short                 # 必须只出现提示词 §6.1 文件预算内的路径
git diff --stat server/            # 后端红线：必须 0 行（按项目实际红线目录调整）
git diff --stat package.json */package.json   # 依赖红线：必须 0 行
```

- 清单外文件 → 区分「越界产物」（删除，如 mock 脚本、`.pnpm-store`）与「条件修改」（检查是否符合提示词预授权：最小化 + 注释 + 报告逐行说明）
- 共享基础设施（http 封装、stores、utils、布局组件）0 行改动

## 2. 亲手重跑全部验收命令

**一次性跑完全部命令，把发现的所有错误攒成一轮 fix**——禁止「跑一条修一轮」，拆分修订轮会制造多余的中断窗口（真实事故教训）。

以 HRMS 项目为例（换成目标项目自己的验收集）：

```bash
pnpm --filter hrms-server test        # 后端全量，数字对比基线
pnpm --filter hrms-server type-check
pnpm --filter hrms-client type-check
pnpm --filter hrms-client test        # 前端全量，基线 + 新增用例数
pnpm lint                             # 0 error（既有 warning 不算）
pnpm --filter hrms-client build
```

任何一条失败 → 收集**全部**错误后写一轮 fix 提示词（不要发现一个修一个跑一轮，攒齐一起修）。

## 3. 抽查（挑高风险点，不必逐行）

- API 封装文件：PATHS 常量、HTTP 方法与后端路由表逐一核对
- 权限点：与提示词 RBAC 矩阵核对，特别是标注过的「反直觉点」
- 测试文件：符合项目测试范式（如自包含 shim、禁 import vitest 等项目特定约定）
- 对既有测试/文件的修改：是否最小化、是否有注释、diff 逐行看
- **编码检查**：新文件前 3 字节不得是 `EF BB BF`（BOM）：
  `head -c 3 <file> | od -An -tx1`
  中招则 `sed -i '1s/^\xef\xbb\xbf//' <files...>` 批量剥离（审核者可自己修，属字节级清理）

## 4. 修订闭环

发现问题 → 按 `references/prompt-template.md` 的 fix 模板写 `<切片ID>-fixN.md` → **同一回合内** commit + 同一 runner 换 SliceId 启动 + 更新 `logs/<ID>.state.md`（原子动作，不得以「提示词写完」结束回合）→ 重跑验收。实测修订轮 4-5 分钟、1-2 轮收敛。修订轮也要查 BOM（agent 可能再次整文件重写）。

## 5. 通过后收尾

1. 业务 commit：`feat(<scope>): <切片ID> <标题>（长括号摘要：文件数/端点数/测试基线变化/执行器与修订轮次/红线确认）`
2. 进度文档同步（如 AGENTS.md 的进度行，勾掉对应切片）
3. 提示词与 fix 提示词一并入库（`docs/cursor-prompts/`），便于追溯与复用
4. 汇报：范围、验收数字、发现的问题与处理、耗时（供执行器选型积累数据）
