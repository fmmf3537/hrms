-- M2-B3: 请假 leave_requests
-- 幂等：IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "leave_requests" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "leave_type" VARCHAR(30) NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "total_days" DECIMAL(4, 1) NOT NULL,
  "reason" TEXT,
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

  CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "leave_requests_approval_instance_id_key"
  ON "leave_requests"("approval_instance_id");
CREATE INDEX IF NOT EXISTS "leave_requests_employee_id_status_idx"
  ON "leave_requests"("employee_id", "status");
CREATE INDEX IF NOT EXISTS "leave_requests_company_id_status_start_date_idx"
  ON "leave_requests"("company_id", "status", "start_date");
CREATE INDEX IF NOT EXISTS "leave_requests_department_id_status_start_date_idx"
  ON "leave_requests"("department_id", "status", "start_date");
CREATE INDEX IF NOT EXISTS "leave_requests_status_start_date_idx"
  ON "leave_requests"("status", "start_date");
CREATE INDEX IF NOT EXISTS "leave_requests_leave_type_status_idx"
  ON "leave_requests"("leave_type", "status");
