-- V1.2: 为 audit_logs 加 actor_type 字段
-- 区分 USER（用户操作）/ AGENT（AI 代操作）/ SYSTEM（系统触发）/ INTEGRATION（第三方对接）
-- 默认为 USER，兼容历史数据

ALTER TABLE "audit_logs"
  ADD COLUMN "actor_type" VARCHAR(20) NOT NULL DEFAULT 'USER';

CREATE INDEX "audit_logs_actor_type_idx" ON "audit_logs"("actor_type");
CREATE INDEX "audit_logs_actor_type_created_at_idx" ON "audit_logs"("actor_type", "created_at");