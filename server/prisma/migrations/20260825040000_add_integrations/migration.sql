-- M0.5-4: 第三方对接框架（2 张表：配置 / 同步日志）

-- CreateTable
CREATE TABLE "integrations" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "last_sync_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_sync_logs" (
    "id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "operation" VARCHAR(50) NOT NULL,
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integrations_code_key" ON "integrations"("code");

-- CreateIndex
CREATE INDEX "integrations_enabled_idx" ON "integrations"("enabled");

-- CreateIndex
CREATE INDEX "integration_sync_logs_integration_id_created_at_idx" ON "integration_sync_logs"("integration_id", "created_at");

-- CreateIndex
CREATE INDEX "integration_sync_logs_status_created_at_idx" ON "integration_sync_logs"("status", "created_at");

-- AddForeignKey
ALTER TABLE "integration_sync_logs" ADD CONSTRAINT "integration_sync_logs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
