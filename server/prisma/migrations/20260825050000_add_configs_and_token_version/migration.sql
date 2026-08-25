-- M0.5-6/7: configs 表 + users.token_version
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS for idempotent local re-runs

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "configs" (
    "id" UUID NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remark" TEXT,

    CONSTRAINT "configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "configs_category_key_version_key" ON "configs"("category", "key", "version");
CREATE INDEX IF NOT EXISTS "configs_category_key_effective_from_idx" ON "configs"("category", "key", "effective_from");
CREATE INDEX IF NOT EXISTS "configs_effective_to_idx" ON "configs"("effective_to");
