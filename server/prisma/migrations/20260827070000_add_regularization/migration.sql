-- M1-A4: 转正流程 regularization_records
-- 幂等：IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "regularization_records" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "hire_date" DATE NOT NULL,
  "probation_end_date" DATE NOT NULL,
  "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "self_evaluation" TEXT,
  "manager_evaluation" TEXT,
  "hr_evaluation" TEXT,
  "performance_score" INTEGER,
  "new_base_salary" DECIMAL(10, 2),
  "new_performance_salary" DECIMAL(10, 2),
  "new_total_salary" DECIMAL(10, 2),
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "approval_instance_id" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "approved_by" UUID,
  "rejected_at" TIMESTAMPTZ(6),
  "rejected_by" UUID,
  "rejected_reason" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelled_at" TIMESTAMPTZ(6),
  "cancelled_by" UUID,
  "cancelled_reason" TEXT,

  CONSTRAINT "regularization_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "regularization_records_approval_instance_id_key"
  ON "regularization_records"("approval_instance_id");
CREATE INDEX IF NOT EXISTS "regularization_records_employee_id_status_idx"
  ON "regularization_records"("employee_id", "status");
CREATE INDEX IF NOT EXISTS "regularization_records_status_probation_end_date_idx"
  ON "regularization_records"("status", "probation_end_date");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'regularization_records_employee_id_fkey'
  ) THEN
    ALTER TABLE "regularization_records"
      ADD CONSTRAINT "regularization_records_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
