# M3 绩效管理 Service 模块

## M3-D1 考核方案配置

- `performance_cycle.service.ts` — 考核周期 CRUD
- `performance_indicator.service.ts` — 指标库 CRUD
- `performance_scheme.service.ts` — 考核方案 + 指标权重
- `performance_coefficient.service.ts` — 等级系数版本管理

## M3-D2 考核流程

- `performance_record.service.ts` — 考核记录 CRUD + 5 级状态机 + 审批/归档/拒绝
- `performance_score.service.ts` — 5 stage 评分（self/manager/calibrate/hr/ceo）+ 版本回溯 + 加权
- `performance_ai_suggestion.service.ts` — AI 评分建议（复用 `ai/score.service.suggestScore`）

### 5 级状态机

`draft → manager_scoring → dept_calibrating → hr_summarizing → ceo_approving → ceo_approved → archived`

### 5 个审批 flowKey

- `performance:self_submit`
- `performance:manager_score`
- `performance:dept_calibrate`
- `performance:hr_summary`
- `performance:ceo_approve`

### 依赖（仅复用，不重写）

- M0.5-1 `approval.service` — submitApproval / withdraw
- M0.5-5 `ai/score.service` — suggestScore
- M0.5-2 `notification.service` — sendNotification (bypassTemplate)
- M0.5-6 `config.service` — 16 项 performance.* configs
- M0.5-8 `audit.service` — 16 类 action 审计

### D2 红线

- 不创建 `performance_calibrations` / `sales_commissions` / `pips` 表（D3/D5/D6）
- 不实现 A/B/C/D 等级判定算法（D3，仅 finalGrade 字段预留）
- 不联动 M4 薪酬
- 不修改 D1 四个 service 文件
