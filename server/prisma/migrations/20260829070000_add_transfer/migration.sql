-- M1-A5: 调动流程 transfer_records
-- 幂等：IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "transfer_records" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "transfer_type" VARCHAR(20) NOT NULL,
  "reason" TEXT,
  "from_company_id" UUID NOT NULL,
  "from_dept_id" UUID NOT NULL,
  "from_position" VARCHAR(100),
  "to_company_id" UUID NOT NULL,
  "to_dept_id" UUID NOT NULL,
  "to_position" VARCHAR(100) NOT NULL,
  "new_base_salary" DECIMAL(10, 2),
  "new_performance_salary" DECIMAL(10, 2),
  "new_total_salary" DECIMAL(10, 2),
  "effective_date" DATE NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "approval_instance_id" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "approved_by" UUID,
  "rejected_at" TIMESTAMPTZ(6),
  "rejected_by" UUID,
  "rejected_reason" TEXT,
  "position_history_written" BOOLEAN NOT NULL DEFAULT false,
  "salary_history_written" BOOLEAN NOT NULL DEFAULT false,
  "employee_updated" BOOLEAN NOT NULL DEFAULT false,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelled_at" TIMESTAMPTZ(6),
  "cancelled_by" UUID,
  "cancelled_reason" TEXT,

  CONSTRAINT "transfer_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "transfer_records_approval_instance_id_key"
  ON "transfer_records"("approval_instance_id");
CREATE INDEX IF NOT EXISTS "transfer_records_employee_id_status_idx"
  ON "transfer_records"("employee_id", "status");
CREATE INDEX IF NOT EXISTS "transfer_records_status_effective_date_idx"
  ON "transfer_records"("status", "effective_date");
CREATE INDEX IF NOT EXISTS "transfer_records_from_dept_id_status_idx"
  ON "transfer_records"("from_dept_id", "status");
CREATE INDEX IF NOT EXISTS "transfer_records_to_dept_id_status_idx"
  ON "transfer_records"("to_dept_id", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transfer_records_employee_id_fkey'
  ) THEN
    ALTER TABLE "transfer_records"
      ADD CONSTRAINT "transfer_records_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
