-- M0.5-2: 通知基础设施（2 张表：模板 / 日志）

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "subject" VARCHAR(200),
    "content_template" TEXT NOT NULL,
    "variables" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "template_id" UUID,
    "template_key" VARCHAR(100),
    "user_id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "subject" VARCHAR(500),
    "content" TEXT NOT NULL,
    "data" JSONB,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_key_channel_key" ON "notification_templates"("key", "channel");

-- CreateIndex
CREATE INDEX "notification_templates_key_enabled_idx" ON "notification_templates"("key", "enabled");

-- CreateIndex
CREATE INDEX "notification_templates_enabled_idx" ON "notification_templates"("enabled");

-- CreateIndex
CREATE INDEX "notification_logs_user_id_status_idx" ON "notification_logs"("user_id", "status");

-- CreateIndex
CREATE INDEX "notification_logs_status_created_at_idx" ON "notification_logs"("status", "created_at");

-- CreateIndex
CREATE INDEX "notification_logs_user_id_read_at_idx" ON "notification_logs"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notification_logs_template_key_idx" ON "notification_logs"("template_key");

-- CreateIndex
CREATE INDEX "notification_logs_channel_status_idx" ON "notification_logs"("channel", "status");

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
