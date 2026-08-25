-- M1-A3: 入职流程 onboarding_records + onboarding_tasks
-- 幂等：IF NOT EXISTS

-- ========== onboarding_records ==========
CREATE TABLE IF NOT EXISTS "onboarding_records" (
  "id" UUID NOT NULL,
  "name" VARCHAR(50) NOT NULL,
  "gender" VARCHAR(10),
  "birth_date" DATE,
  "phone" TEXT,
  "email" VARCHAR(100),
  "company_id" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "hire_date" DATE NOT NULL,
  "contract_type" VARCHAR(50) NOT NULL,
  "probation_months" INTEGER,
  "base_salary" DECIMAL(10, 2),
  "id_card" TEXT,
  "id_card_ocr_at" TIMESTAMPTZ(6),
  "bank_name" VARCHAR(100),
  "bank_card" TEXT,
  "bank_card_ocr_at" TIMESTAMPTZ(6),
  "certificates" JSONB,
  "materials_checklist" JSONB,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "approval_instance_id" UUID,
  "employee_id" UUID,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelled_at" TIMESTAMPTZ(6),
  "cancelled_reason" TEXT,

  CONSTRAINT "onboarding_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_records_approval_instance_id_key"
  ON "onboarding_records"("approval_instance_id");
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_records_employee_id_key"
  ON "onboarding_records"("employee_id");
CREATE INDEX IF NOT EXISTS "onboarding_records_company_id_status_idx"
  ON "onboarding_records"("company_id", "status");
CREATE INDEX IF NOT EXISTS "onboarding_records_status_hire_date_idx"
  ON "onboarding_records"("status", "hire_date");
CREATE INDEX IF NOT EXISTS "onboarding_records_created_by_status_idx"
  ON "onboarding_records"("created_by", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'onboarding_records_company_id_fkey'
  ) THEN
    ALTER TABLE "onboarding_records"
      ADD CONSTRAINT "onboarding_records_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'onboarding_records_department_id_fkey'
  ) THEN
    ALTER TABLE "onboarding_records"
      ADD CONSTRAINT "onboarding_records_department_id_fkey"
      FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ========== onboarding_tasks ==========
CREATE TABLE IF NOT EXISTS "onboarding_tasks" (
  "id" UUID NOT NULL,
  "onboarding_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "category" VARCHAR(50) NOT NULL,
  "owner_id" UUID,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "due_date" DATE,
  "completed_at" TIMESTAMPTZ(6),
  "completed_by" UUID,
  "remark" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "onboarding_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "onboarding_tasks_onboarding_id_status_idx"
  ON "onboarding_tasks"("onboarding_id", "status");
CREATE INDEX IF NOT EXISTS "onboarding_tasks_owner_id_status_idx"
  ON "onboarding_tasks"("owner_id", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'onboarding_tasks_onboarding_id_fkey'
  ) THEN
    ALTER TABLE "onboarding_tasks"
      ADD CONSTRAINT "onboarding_tasks_onboarding_id_fkey"
      FOREIGN KEY ("onboarding_id") REFERENCES "onboarding_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
