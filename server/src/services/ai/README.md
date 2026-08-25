# AI 底座（M0.5-5）

> HRMS V1.2 §四.4.1 M0.5-5 切片实现说明  
> 关联：[`docs/HRMS-V1.2.md`](../../../../docs/HRMS-V1.2.md) · [`docs/api-spec.md`](../../../../docs/api-spec.md) §4.5 · [`docs/error-codes.md`](../../../../docs/error-codes.md) §6xxxx · [`docs/knowledge-base-seed.md`](../../../../docs/knowledge-base-seed.md)

本目录实现 **AI 公共底座**：知识库文档 + pgvector 向量检索（RAG）+ OCR + 摘要缓存 + 绩效评分建议。业务模块（M1 OCR 入职、M3 评分、M4 算薪摘要）通过本层 service / REST 复用，不各自对接 LLM。

---

## 1. 数据模型（4 张表）

| Prisma Model | 表名 | 作用 |
|---|---|---|
| `AiDocument` | `ai_documents` | 知识库原文（手册 / 政策 / FAQ / SOP） |
| `AiEmbedding` | `ai_embeddings` | 文档分块 + `vector(1536)` 嵌入 |
| `AiConversation` | `ai_conversations` | 用户问答历史（tokens / cost / duration） |
| `AiSummary` | `ai_summaries` | 业务摘要缓存（`expires_at`） |

### 关系要点

- `AiEmbedding.documentId` → `AiDocument.id`，`ON DELETE CASCADE`
- `AiEmbedding.embedding` 使用 Prisma `Unsupported("vector(1536)")`，读写走 `$executeRawUnsafe` / `$queryRawUnsafe`
- 文档支持软删（`deleted_at`）；列表默认过滤已删
- 对话表按 `user_id + created_at` 索引，支撑「我的历史」与日配额统计

### Migration

```
server/prisma/migrations/20260825060000_add_ai_foundation/migration.sql
```

依赖 Docker 中 `pgvector/pgvector:pg16` 与 `init-scripts/01-pgvector.sql` 已启用 `vector` 扩展。

---

## 2. 能力接口（挂载 `/api/ai`）

鉴权：`authenticate` + `rejectIfMustChangePassword` + `requirePermission(...)`。

| Method | Path | 权限 | 说明 |
|---|---|---|---|
| POST | `/ai/ocr` | `ai:ocr` | OCR（JSON：`documentType` + `imageBase64`） |
| POST | `/ai/qa` | `ai:qa` | RAG 智能问答 |
| POST | `/ai/summarize` | `ai:summarize` | 业务摘要（带缓存） |
| POST | `/ai/score-suggest` | `ai:score` | 绩效评分建议（最多 3 条） |
| GET | `/ai/documents` | `ai:document:read` | 知识库列表 |
| POST | `/ai/documents` | `ai:document:write` | 上传文档（自动分块+embedding） |
| DELETE | `/ai/documents/:id` | `ai:document:write` | 软删 |
| GET | `/ai/conversations` | `ai:conversation:read` | 我的对话 |
| GET | `/ai/quota` | `ai:qa` | 日配额（默认 100，TODO configService） |

OCR 一期用 JSON `imageBase64`（不引入 multer），与 OpenAPI multipart 语义等价，便于单测与联调。

### 角色权限

- **admin**：`*`
- **hr**：全部 AI 权限（ocr / qa / summarize / score / document read+write / conversation read）
- **employee**：ocr、qa、summarize、score、document read、conversation read（无 document write）

---

## 3. 服务分层

```
controllers/ai.controller.ts
        ↓
services/ai/
  embedding.service.ts   分块 / embed / 写向量 / 相似检索
  ocr.service.ts         OCR + audit AI_OCR
  qa.service.ts          RAG + 对话落库 + audit AI_QA + quota
  summarize.service.ts   摘要缓存 + audit AI_SUMMARIZE
  score.service.ts       评分建议 + audit AI_SCORE
  document.service.ts    知识库 CRUD（嵌入失败 → 60111）
        ↓
integrationService.send({ code: 'llm' | 'ocr' | 'map', payload })
        ↓
adapters: llm / ocr / map（mock 默认可用）
```

范式：**`export function` / `export async function`**（无 class+static）。Adapter 可 `export class`，与 M0.5-4 一致。

---

## 4. RAG 检索原理

1. **分块**：`chunkText(content, chunkSize=500, overlap=50)`（字符级，中文友好）  
2. **嵌入**：`integrationService.send({ code: 'llm', payload: { type: 'embedding', input: chunks } })`  
3. **入库**：`INSERT ... embedding = $vec::vector`  
4. **查询**：对用户问题再 embed，然后：

```sql
SELECT id, document_id, chunk_text,
       1 - (embedding <=> $1::vector) AS similarity
FROM ai_embeddings
WHERE embedding IS NOT NULL
ORDER BY embedding <=> $1::vector
LIMIT $2
```

5. **过滤**：`filterBySimilarity(rows, topK, threshold)`（默认 topK=5，threshold=0.7）  
6. **生成**：拼装 system/user prompt → `type: 'chat'` → 写 `ai_conversations`  
7. **降级**：无命中源时返回礼貌 fallback，建议联系 HR（不调 LLM）

向量字面量格式：`[0.1,0.1,...]`（pgvector 文本输入）。

单测中 `filterBySimilarity` 为纯函数，可在无真实 PG/pgvector 时验证阈值与 topK 行为。

---

## 5. LLM Adapter 行为

| payload | 行为 |
|---|---|
| `{ type: 'embedding', input: string[] }` | mock：每条返回 1536 维全 `0.1`；真实：`POST /v1/embeddings` |
| `{ type: 'chat', messages }` | mock：返回 content + tokens；真实：`POST /v1/chat/completions` |
| `{ messages }`（无 type） | **向后兼容**，视为 chat（M0.5-4 旧调用方式） |

OCR / Map adapter 默认 mock；生产需配置 `OCR_SECRET_*` / 地图 key。

---

## 6. 错误码（6xxxx）

| code | HTTP | 场景 |
|---|---|---|
| 60100 | 500 | LLM 调用失败 |
| 60101 | 503 | LLM 超时（预留） |
| 60102 | 429 | LLM 限流（预留） |
| 60103 | 402 | LLM 配额用尽（预留） |
| 60110 | 500 | 向量库读写失败 |
| 60111 | 500 | Embedding 失败（含文档入库失败回滚软删） |
| 60120 | 400 | OCR 服务商错误 |
| 60121 | 400 | OCR 识别失败 / 缺图 |
| 60130 | 503 | AI 能力未启用（预留） |
| 60131 | 402 | AI 调用次数超限（预留，quota 接口已返回 remaining） |
| 60140 | 400 | 输入过长（如 QA 问题 > 2000 字） |

统一：`throw new AppError(message, statusCode, code)`。

---

## 7. 审计

`AUDIT_ACTIONS` 扩展：

- `AI_OCR` / `AI_QA` / `AI_SUMMARIZE` / `AI_SCORE`

`resourceType` 使用 `AUDIT_RESOURCE_TYPES.AI`（`'Ai'`）。  
写入经 `auditService.auditLog`（fire-and-forget，失败不阻断主流程）。

---

## 8. 环境变量

见 `server/src/lib/env.ts`：

- `EMBEDDING_MODEL` / `EMBEDDING_DIM`（默认 1536）
- `LLM_DEFAULT_MODEL` / `LLM_MAX_TOKENS_QA` / `LLM_MAX_TOKENS_SUMMARY` / `LLM_TEMPERATURE`
- `AI_QA_TOP_K` / `AI_SIMILARITY_THRESHOLD`
- `AI_DOCUMENT_CHUNK_SIZE` / `AI_DOCUMENT_CHUNK_OVERLAP`
- `OCR_PROVIDER` / `OCR_SECRET_ID` / `OCR_SECRET_KEY`

业务阈值目前硬编码 + `// TODO: move to configService` 注释（与切片提示词一致）。

---

## 9. 知识库冷启动

脚本：`server/prisma/seed-ai-knowledge.ts`  
由 `seed.ts` 在 try/catch 中调用（失败不中断其他 seed）。

内容覆盖（≥28，实际 34）：

| 类别 | 篇数 |
|---|---|
| 员工手册 | 3（员工 / 部门负责人 / HR） |
| 假期政策 | 7（年假 / 病假 / 调休 / 加班 / 婚产 / 陪产 / 丧假） |
| 工资条说明 | 1 |
| 报销流程 | 3（出差 / 差旅补助 / 借款还款） |
| FAQ | 20 |

Seed 写入文档后，用 **固定向量** `1536 × 0.1` 经 `$executeRaw` 插入 embeddings，不依赖外部 LLM，保证本地/CI seed 可重复执行（按 title 幂等跳过）。

---

## 10. 已知限制

1. OCR 生产 SDK（腾讯云/百度）未实现，仅 mock 字段。  
2. 地图反地理编码仅 mock 西安示例地址。  
3. 真实 LLM 需配置 `LLM_PROVIDER≠mock` 与 `LLM_API_KEY`；embedding 维度必须与库中 `vector(1536)` 一致。  
4. 日配额 `dailyLimit=100` 尚未进 configs 表。  
5. 所有 chunk 使用相同 seed 向量时，RAG「语义区分度」在冷启动环境较低；上线后应对文档重新跑真实 embedding。  
6. `POST /ai/ocr` 当前为 JSON，未挂 multipart；前端若要直接传文件，可后续加 multer（非本切片依赖）。  
7. 摘要缓存按 `type + referenceId` 取最新一条；无 `referenceId` 时每次都会调 LLM。  
8. 评分建议在 LLM 返回不可解析 JSON 时使用内置 3 条 fallback，保证接口可用。

---

## 11. 单测

| 文件 | 覆盖 |
|---|---|
| `embedding.service.test.ts` | 分块、写入、topK、空结果、阈值、raw 检索 |
| `qa.service.test.ts` | 基本问答、fallback、tokens、audit、60140 |
| `summarize.service.test.ts` | cache hit / miss / expired |

运行（在 `server/`）：

```powershell
pnpm exec vitest run src/services/ai
```

Mock 模式参考 `integration.service.test.ts` 的 `vi.hoisted` 写法。

---

## 12. 快速自检清单

- [ ] `pnpm exec prisma generate` 成功，client 含 Ai* 模型  
- [ ] migration `20260825060000_add_ai_foundation` 已应用  
- [ ] `registerAllAdapters` 含 `ocr` / `map` / 升级后的 `llm`  
- [ ] `/api/ai/*` 已挂载  
- [ ] seed 日志出现 `AI knowledge base seeded`  
- [ ] 问「年假怎么请」在真实 embedding 环境可命中年假文档  

---

## 变更记录

| 版本 | 日期 | 说明 |
|---|---|---|
| V1.0 | 2026-08-25 | M0.5-5 初版：4 表 + RAG + OCR/摘要/评分 + 冷启动 ≥28 篇 + 单测 |
