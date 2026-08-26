-- M2-B6: 月度考勤汇总 monthly_summaries
-- 幂等：IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "monthly_summaries" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "year" SMALLINT NOT NULL,
  "month" SMALLINT NOT NULL,
  "work_days" DECIMAL(4, 1) NOT NULL,
  "late_count" INTEGER NOT NULL DEFAULT 0,
  "early_leave_count" INTEGER NOT NULL DEFAULT 0,
  "missing_count" INTEGER NOT NULL DEFAULT 0,
  "leave_days" DECIMAL(5, 1) NOT NULL DEFAULT 0,
  "leave_hours" DECIMAL(6, 1) NOT NULL DEFAULT 0,
  "overtime_hours" DECIMAL(6, 1) NOT NULL DEFAULT 0,
  "trip_days" DECIMAL(4, 1) NOT NULL DEFAULT 0,
  "comp_balance" DECIMAL(6, 1) NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "employee_confirmed_at" TIMESTAMPTZ(6),
  "employee_confirmed_by" UUID,
  "hr_locked_at" TIMESTAMPTZ(6),
  "hr_locked_by" UUID,
  "remark" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "monthly_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "monthly_summaries_employee_id_year_month_key"
  ON "monthly_summaries"("employee_id", "year", "month");
CREATE INDEX IF NOT EXISTS "monthly_summaries_company_id_year_month_idx"
  ON "monthly_summaries"("company_id", "year", "month");
CREATE INDEX IF NOT EXISTS "monthly_summaries_department_id_year_month_idx"
  ON "monthly_summaries"("department_id", "year", "month");
CREATE INDEX IF NOT EXISTS "monthly_summaries_status_idx"
  ON "monthly_summaries"("status");
