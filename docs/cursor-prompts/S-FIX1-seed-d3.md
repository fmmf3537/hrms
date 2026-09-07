# S-FIX1 seed D3 demo 唯一约束崩溃修复 — 执行提示词

## ⚠️ 强约束（最优先阅读）

1. **纯服务端单文件切片**：只允许修改 `server/prisma/seed.ts` 一处区域（M3-D3 段，约 2741-2768 行）。
   **禁止修改任何其它文件**（含 prisma/schema.prisma、其它 seed 段、src/**、测试、docs、package.json——一行都不动）。
2. **最小 diff**：只改 D3 demo 的存在性判断 + 创建逻辑；不重构周边；中文注释说明改动原因。
3. **禁止**：`prisma migrate`、新依赖、删除/重命名任何表或列。
4. **编码红线**：UTF-8 无 BOM、LF、2 空格、单引号、行尾分号（沿用文件既有风格）、中文注释。
5. **不跑验收命令**（test/build/lint/seed 由审核方执行）——你只改代码，不运行 seed/测试。
6. **headless 无人工确认**：先输出实施计划（几句话），然后直接动手；最终回复给出完整交付报告（§7.2 模板）。

---

## 1. 任务 ID + 目标

### 1.1 任务 ID
**S-FIX1 · seed M3-D3 demo 唯一约束崩溃修复**

### 1.2 目标
修复 `server/prisma/seed.ts` 在 M3-D3（performance grade demo）段因 `(employee_id, cycle_id)` 唯一约束冲突抛
`PrismaClientKnownRequestError P2002` 导致 **seed 提前崩溃**的问题，使 `pnpm db:seed` 能**完整跑到 END**（幂等，重跑不崩）。

---

## 2. 上下文

### 2.1 项目位置
`D:\projects\hrms`（pnpm monorepo；seed 在 `server/prisma/seed.ts`，共 3577 行）

### 2.2 关键已核实事实（起草人已实读源码，可直接采信）

| 事实 | 证据 |
|---|---|
| `PerformanceRecord` 存在 `(employee_id, cycle_id)` 唯一约束 | seed 崩溃堆栈 `P2002 target: ['employee_id','cycle_id']` |
| M3-D2 demo（约 2690-2738 行）会在 `monthlyCycleForRecords` 周期上为 `sampleEmployees[0..2]` **创建 performanceRecord**（draft / manager_scoring / ceo_approving 等状态） | seed 日志「performance records demo」段 |
| M3-D3 段（2741-2768）又对**同一批员工、同一 `monthlyCycleForRecords` 周期**执行 `performanceRecord.create(status:'archived', finalScore: 95/85/55)` | 2741-2768 |
| 当某员工在该周期已有记录（D2 先建，或重跑时历史残留），D3 的 create 必撞唯一约束 → P2002 → seed 崩溃 | 实测：远程全新库首跑 seed 崩于 2752 行 |
| `d3Exists` 存在性判断过窄：只查 `{cycleId, status:'archived', finalScore:95}` | 2743-2749 |
| 崩溃的连锁影响：seed 在 C1 薪酬段前退出 → 新库永远没有薪酬方案/算薪 demo 等（C1 起全部缺失） | 远程部署实测 73408 |
| `m5-09-config-fixes.mjs` 已为员工兜底 ensure finalGrade（`server/scripts/fixes/`）——D3 demo 数据被跳过**不阻塞功能** | 既有脚本 |

### 2.3 期望行为
- seed 无论首跑 / 重跑 / D2 记录已存在与否，**都不得因 D3 段抛 P2002**，且能继续执行到 END。
- D3 demo 尽量创建 archived+finalGrade 演示记录；已被 D2（或历史）占用同一 (employee, cycle) 的员工**跳过**即可（不创建，不报错）。

---

## 3. 必读约束

### 3.1 反直觉点（显式标注）

> **🔴 为什么"把 d3Exists 判断改宽再继续 create"是错的？**
> 崩溃点不在"是否已有 archived+95 记录"，而在**同一 (employeeId, cycleId) 上不能有第二条记录**（唯一约束）。
> D2 demo 已占用部分员工的该周期 → 任何对已占用员工再 create 都会 P2002。
> 因此正确逻辑只能是：**逐员工检查该 (employee, cycle) 是否已有任何记录 → 已有则跳过该员工，没有才 create**。

> **🟡 D3 三条可能部分/全部被跳过（created=0）？**
> 可接受。seed 的目标是「不崩 + 幂等 + 主数据完整」；D3 演示用的 finalGrade
> 由 `m5-09-config-fixes.mjs` 在部署侧兜底 ensure，不依赖本 demo 数据。

### 3.2 禁止修改文件

- 除 `server/prisma/seed.ts` 的 D3 段（2741-2768）及必要的行内注释外，**其它一律不动**
- 不得改 D2 段 / C1 段 / 其它任何 seed 逻辑（防止改变既有 demo 语义）

### 3.3 编码 / 风格
- 中文注释；与文件现有风格一致（单引号、行尾分号、2 空格、无 BOM/LF）

---

## 4. 实施任务（逐文件）

**仅文件 `server/prisma/seed.ts`，M3-D3 段（当前约 2741-2768）条件修改。**

把「批量无条件 create 3 条 archived 记录」改为「**逐员工 ensure**」：

```ts
// 现状（示意）：
//   d3Exists = findFirst({ cycleId, status:'archived', finalScore:95 })
//   if (!d3Exists) { Promise.all(d3Scores.map((score, idx) => performanceRecord.create({ employeeId: sampleEmployees[idx].id, cycleId, ... archived/finalScore }))) }

// 目标逻辑：
//   1) 保留外层的 monthlyCycleForRecords && peduScheme && sampleEmployees.length >= 3 前提
//   2) 移除过窄的 d3Exists（或保留仅作统计提示，不作为跳过依据）
//   3) 对 d3Scores = [95, 85, 55]，逐 idx：
//        emp = sampleEmployees[idx]（若不存在则跳过该 idx）
//        已有 = prisma.performanceRecord.findFirst({ where: { employeeId: emp.id, cycleId } })
//        已有 → skipped += 1（不 create）
//        无 → create({ employeeId: emp.id, cycleId, schemeId: peduScheme.id,
//                     status: 'archived', finalScore: score,
//                     finalGrade: score >= 90 ? 'S' : score >= 80 ? 'A' : 'D',
//                     archivedAt: new Date(), createdBy: admin.id }) 且 created += 1
//   4) console.log(`   ✓ D3 grade demo: created ${created}, skipped ${skipped}（occupied by D2/既有记录）`)
//       或与原日志风格一致的等价文案
```

要求：
- 保持文件既有风格（变量命名、console.log 前缀「   ✓ 」风格）
- 不引入新依赖 / 不改类型 / 不动其它段
- 确保**并发安全**（不同 employee 不同 key，findFirst+create 顺序或 Promise 皆可；同员工只查建一次即可）
- 若 `sampleEmployees[idx]` 为 undefined（数组不足 3）按现有习惯跳过（文件里多处用 `if (sampleEmployees[2])` 模式）

---

## 5. 关键决策点

- **主方案**：逐员工 (employeeId, cycleId) 存在性检查 → 已占跳过。理由：幂等、永不 P2002、零副作用。
- **否决方案**：为 D3 另建独立 cycle 再 create（改动面大、需新建 cycle 记录且涉及 PerformanceCycle 多字段，收益低；且 demo 语义冗余）。**不要实现**。

---

## 6. 修改文件清单

### 6.1 必改文件
| # | 文件 | 操作 | 职责 |
|---|---|---|---|
| 1 | `server/prisma/seed.ts` | 修改（仅 M3-D3 段 ~2741-2768） | D3 demo 改为逐员工 ensure，消除 P2002 |

### 6.2 禁止修改文件
- 除 6.1 外**一切文件**（尤其 prisma/schema.prisma、src/**、其它 seed 段、测试、docs、package.json、lockfile）

### 6.3 越界自检命令（你运行并粘贴输出到交付报告）
```bash
git diff --stat          # 期望：仅 server/prisma/seed.ts
git status --short       # 期望：仅 server/prisma/seed.ts 为 M（其余应干净）
```

---

## 7. 验收标准

### 7.1 硬性验收（审核方执行，**你不跑**）
| 验收项 | 方式 | 通过标准 |
|---|---|---|
| 越界 | `git diff --stat` / `git status --short` | 仅 seed.ts 被改 |
| 编译/类型 | `server: tsc --noEmit` | 0 error |
| 单测基线 | `server vitest run` | 全部通过（现状 892+，不回归） |
| **seed 全量跑通** | `pnpm --filter hrms-server db:seed`（本机 dev 库） | 完整执行至 END、无 P2002/异常 |
| **seed 幂等** | 紧接着再跑一次 `db:seed` | 再次 END、无异常（D3 显示 created 0 / skipped 3 属预期） |

### 7.2 交付报告模板（最终回复按 8 项）

```
## S-FIX1 交付报告
### 1. 修改文件清单（含行号范围）
### 2. 改了什么（before → after 简述 + 核心代码片段）
### 3. 越界自检结果（§6.3 命令输出）
### 4. 未触碰项确认（未改 schema/其它 seed 段/测试/文档/依赖）
### 5. 新增/删除逻辑说明（含为什么这样能消除 P2002）
### 6. 潜在风险（如有；无写「无」）
### 7. 自测情况（你未跑 seed——按约束；如只做了语法自查请说明）
### 8. 已知问题与后续建议
```

---

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手，最终回复给出完整交付报告。
