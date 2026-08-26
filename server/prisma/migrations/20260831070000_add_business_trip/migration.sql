-- M2-B5: 出差 business_trips
-- 幂等：IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "business_trips" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "destination" VARCHAR(100) NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "total_days" DECIMAL(4, 1) NOT NULL,
  "reason" TEXT NOT NULL,
  "project_code" VARCHAR(50),
  "allowance_amount" DECIMAL(10, 2),
  "city_tier" VARCHAR(20),
  "level_rate" DECIMAL(3, 2),
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

  CONSTRAINT "business_trips_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "business_trips_approval_instance_id_key"
  ON "business_trips"("approval_instance_id");
CREATE INDEX IF NOT EXISTS "business_trips_employee_id_status_idx"
  ON "business_trips"("employee_id", "status");
CREATE INDEX IF NOT EXISTS "business_trips_company_id_status_start_date_idx"
  ON "business_trips"("company_id", "status", "start_date");
CREATE INDEX IF NOT EXISTS "business_trips_department_id_status_start_date_idx"
  ON "business_trips"("department_id", "status", "start_date");
CREATE INDEX IF NOT EXISTS "business_trips_status_start_date_idx"
  ON "business_trips"("status", "start_date");
CREATE INDEX IF NOT EXISTS "business_trips_destination_idx"
  ON "business_trips"("destination");
