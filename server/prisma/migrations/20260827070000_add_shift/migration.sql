-- M2-B1: 班次定义 shift_templates + shift_assignments
-- 幂等：IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "shift_templates" (
  "id" UUID NOT NULL,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "shift_type" VARCHAR(20) NOT NULL,
  "start_time" VARCHAR(5) NOT NULL,
  "end_time" VARCHAR(5) NOT NULL,
  "break_start" VARCHAR(5),
  "break_end" VARCHAR(5),
  "break_duration" INTEGER,
  "work_hours" DECIMAL(4, 2) NOT NULL,
  "flex_minutes" INTEGER NOT NULL DEFAULT 30,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "company_id" UUID NOT NULL,
  "description" TEXT,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMPTZ(6),
  "archived_by" UUID,

  CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shift_templates_code_key"
  ON "shift_templates"("code");
CREATE INDEX IF NOT EXISTS "shift_templates_company_id_status_idx"
  ON "shift_templates"("company_id", "status");
CREATE INDEX IF NOT EXISTS "shift_templates_shift_type_status_idx"
  ON "shift_templates"("shift_type", "status");
CREATE INDEX IF NOT EXISTS "shift_templates_effective_from_effective_to_idx"
  ON "shift_templates"("effective_from", "effective_to");

CREATE TABLE IF NOT EXISTS "shift_assignments" (
  "id" UUID NOT NULL,
  "shift_id" UUID NOT NULL,
  "assignee_type" VARCHAR(20) NOT NULL,
  "employee_id" UUID,
  "department_id" UUID,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "remark" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "shift_assignments_shift_id_effective_from_idx"
  ON "shift_assignments"("shift_id", "effective_from");
CREATE INDEX IF NOT EXISTS "shift_assignments_employee_id_effective_from_idx"
  ON "shift_assignments"("employee_id", "effective_from");
CREATE INDEX IF NOT EXISTS "shift_assignments_department_id_effective_from_idx"
  ON "shift_assignments"("department_id", "effective_from");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shift_assignments_shift_id_fkey'
  ) THEN
    ALTER TABLE "shift_assignments"
      ADD CONSTRAINT "shift_assignments_shift_id_fkey"
      FOREIGN KEY ("shift_id") REFERENCES "shift_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
