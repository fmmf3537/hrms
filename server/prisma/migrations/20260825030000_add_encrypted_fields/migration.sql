-- M0.5-3: 字段加密基础设施（2 张表：配置 / 访问审计）

-- CreateTable
CREATE TABLE "encrypted_fields" (
    "id" UUID NOT NULL,
    "table_name" VARCHAR(100) NOT NULL,
    "column_name" VARCHAR(100) NOT NULL,
    "encryption_algo" VARCHAR(50) NOT NULL DEFAULT 'aes-256-gcm',
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "access_roles" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "encrypted_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encrypted_field_audits" (
    "id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "operation" VARCHAR(20) NOT NULL,
    "record_id" UUID,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encrypted_field_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "encrypted_fields_table_name_column_name_key" ON "encrypted_fields"("table_name", "column_name");

-- CreateIndex
CREATE INDEX "encrypted_fields_enabled_idx" ON "encrypted_fields"("enabled");

-- CreateIndex
CREATE INDEX "encrypted_field_audits_field_id_created_at_idx" ON "encrypted_field_audits"("field_id", "created_at");

-- CreateIndex
CREATE INDEX "encrypted_field_audits_user_id_operation_idx" ON "encrypted_field_audits"("user_id", "operation");

-- CreateIndex
CREATE INDEX "encrypted_field_audits_created_at_idx" ON "encrypted_field_audits"("created_at");

-- AddForeignKey
ALTER TABLE "encrypted_field_audits" ADD CONSTRAINT "encrypted_field_audits_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "encrypted_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
