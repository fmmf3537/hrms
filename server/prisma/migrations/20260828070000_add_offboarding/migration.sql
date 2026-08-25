-- M1-A6: 离职流程 offboarding_records + handover_tasks
-- 幂等：IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "offboarding_records" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "resignation_type" VARCHAR(20) NOT NULL,
  "reason" TEXT,
  "last_working_date" DATE NOT NULL,
  "handover_completed" BOOLEAN NOT NULL DEFAULT false,
  "handover_completed_by" UUID,
  "handover_completed_at" TIMESTAMPTZ(6),
  "approval_instance_id" UUID,
  "certificate_issued" BOOLEAN NOT NULL DEFAULT false,
  "certificate_issued_at" TIMESTAMPTZ(6),
  "certificate_issued_by" UUID,
  "certificate_number" VARCHAR(50),
  "certificate_url" TEXT,
  "account_disabled" BOOLEAN NOT NULL DEFAULT false,
  "account_disabled_at" TIMESTAMPTZ(6),
  "archived_at" TIMESTAMPTZ(6),
  "archive_retention_years" INTEGER NOT NULL DEFAULT 5,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelled_at" TIMESTAMPTZ(6),
  "cancelled_by" UUID,
  "cancelled_reason" TEXT,

  CONSTRAINT "offboarding_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "offboarding_records_approval_instance_id_key"
  ON "offboarding_records"("approval_instance_id");
CREATE UNIQUE INDEX IF NOT EXISTS "offboarding_records_certificate_number_key"
  ON "offboarding_records"("certificate_number");
CREATE INDEX IF NOT EXISTS "offboarding_records_employee_id_status_idx"
  ON "offboarding_records"("employee_id", "status");
CREATE INDEX IF NOT EXISTS "offboarding_records_status_last_working_date_idx"
  ON "offboarding_records"("status", "last_working_date");
CREATE INDEX IF NOT EXISTS "offboarding_records_created_by_status_idx"
  ON "offboarding_records"("created_by", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'offboarding_records_employee_id_fkey'
  ) THEN
    ALTER TABLE "offboarding_records"
      ADD CONSTRAINT "offboarding_records_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "handover_tasks" (
  "id" UUID NOT NULL,
  "offboarding_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "category" VARCHAR(50) NOT NULL,
  "owner_id" UUID,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "remark" TEXT,
  "completed_at" TIMESTAMPTZ(6),
  "completed_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "handover_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "handover_tasks_offboarding_id_status_idx"
  ON "handover_tasks"("offboarding_id", "status");
CREATE INDEX IF NOT EXISTS "handover_tasks_owner_id_status_idx"
  ON "handover_tasks"("owner_id", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'handover_tasks_offboarding_id_fkey'
  ) THEN
    ALTER TABLE "handover_tasks"
      ADD CONSTRAINT "handover_tasks_offboarding_id_fkey"
      FOREIGN KEY ("offboarding_id") REFERENCES "offboarding_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
