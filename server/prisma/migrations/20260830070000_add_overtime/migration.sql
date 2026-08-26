-- M2-B4: 加班 overtime_requests
-- 幂等：IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "overtime_requests" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "start_time" TIMESTAMPTZ(6) NOT NULL,
  "end_time" TIMESTAMPTZ(6) NOT NULL,
  "total_hours" DECIMAL(5, 2) NOT NULL,
  "overtime_type" VARCHAR(20) NOT NULL,
  "compensation_type" VARCHAR(10) NOT NULL,
  "overtime_pay" DECIMAL(10, 2),
  "comp_days" DECIMAL(4, 1),
  "reason" TEXT NOT NULL,
  "attachments" JSONB,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "approval_instance_id" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "approved_by" UUID,
  "rejected_at" TIMESTAMPTZ(6),
  "rejected_by" UUID,
  "rejected_reason" TEXT,
  "cancelled_at" TIMESTAMPTZ(6),
  "cancelled_by" UUID,
  "cancelled_reason" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "overtime_requests_approval_instance_id_key"
  ON "overtime_requests"("approval_instance_id");
CREATE INDEX IF NOT EXISTS "overtime_requests_employee_id_status_idx"
  ON "overtime_requests"("employee_id", "status");
CREATE INDEX IF NOT EXISTS "overtime_requests_company_id_status_start_time_idx"
  ON "overtime_requests"("company_id", "status", "start_time");
CREATE INDEX IF NOT EXISTS "overtime_requests_department_id_status_start_time_idx"
  ON "overtime_requests"("department_id", "status", "start_time");
CREATE INDEX IF NOT EXISTS "overtime_requests_status_start_time_idx"
  ON "overtime_requests"("status", "start_time");
CREATE INDEX IF NOT EXISTS "overtime_requests_compensation_type_status_idx"
  ON "overtime_requests"("compensation_type", "status");
