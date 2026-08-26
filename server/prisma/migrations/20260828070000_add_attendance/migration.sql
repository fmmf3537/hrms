-- M2-B2: 打卡管理 attendance_records
-- 幂等：IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "attendance_records" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "shift_assignment_id" UUID,
  "clock_in_time" TIMESTAMPTZ(6),
  "clock_out_time" TIMESTAMPTZ(6),
  "clock_type" VARCHAR(20) NOT NULL,
  "source" VARCHAR(20) NOT NULL,
  "wifi_ssid" VARCHAR(100),
  "wifi_mac" VARCHAR(50),
  "gps_lat" DECIMAL(10, 7),
  "gps_lng" DECIMAL(10, 7),
  "gps_accuracy" DECIMAL(10, 2),
  "gps_address" VARCHAR(500),
  "imported_external_id" VARCHAR(100),
  "imported_from" VARCHAR(50),
  "imported_at" TIMESTAMPTZ(6),
  "is_late" BOOLEAN NOT NULL DEFAULT false,
  "late_minutes" INTEGER NOT NULL DEFAULT 0,
  "is_early_leave" BOOLEAN NOT NULL DEFAULT false,
  "early_leave_minutes" INTEGER NOT NULL DEFAULT 0,
  "is_missing" BOOLEAN NOT NULL DEFAULT false,
  "status" VARCHAR(20) NOT NULL DEFAULT 'approved',
  "is_manual" BOOLEAN NOT NULL DEFAULT false,
  "manual_reason" TEXT,
  "approval_instance_id" UUID,
  "remark" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rejected_at" TIMESTAMPTZ(6),
  "rejected_by" UUID,
  "rejected_reason" TEXT,

  CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_records_imported_external_id_key"
  ON "attendance_records"("imported_external_id");
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_records_employee_id_clock_in_time_key"
  ON "attendance_records"("employee_id", "clock_in_time");
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_records_approval_instance_id_key"
  ON "attendance_records"("approval_instance_id");
CREATE INDEX IF NOT EXISTS "attendance_records_employee_id_clock_in_time_idx"
  ON "attendance_records"("employee_id", "clock_in_time");
CREATE INDEX IF NOT EXISTS "attendance_records_company_id_clock_in_time_idx"
  ON "attendance_records"("company_id", "clock_in_time");
CREATE INDEX IF NOT EXISTS "attendance_records_department_id_clock_in_time_idx"
  ON "attendance_records"("department_id", "clock_in_time");
CREATE INDEX IF NOT EXISTS "attendance_records_status_clock_in_time_idx"
  ON "attendance_records"("status", "clock_in_time");
CREATE INDEX IF NOT EXISTS "attendance_records_is_manual_status_idx"
  ON "attendance_records"("is_manual", "status");
CREATE INDEX IF NOT EXISTS "attendance_records_imported_external_id_idx"
  ON "attendance_records"("imported_external_id");
