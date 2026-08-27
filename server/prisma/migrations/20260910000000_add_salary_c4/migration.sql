-- M4-C4: 算薪批次 + 工资单（payroll_runs / payslips / payslip_items）

CREATE TYPE "PayrollRunStatus" AS ENUM ('draft', 'submitted', 'reviewed', 'approved', 'locked', 'cancelled');
CREATE TYPE "PayslipStatus" AS ENUM ('calculated', 'approved', 'locked');
CREATE TYPE "PayslipItemType" AS ENUM (
  'earning_base',
  'earning_performance',
  'earning_overtime',
  'earning_allowance',
  'earning_commission',
  'earning_bonus',
  'deduction_social',
  'deduction_housing',
  'deduction_tax',
  'deduction_absence'
);

CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'draft',
    "total_gross" DECIMAL(18, 2) NOT NULL,
    "total_net" DECIMAL(18, 2) NOT NULL,
    "anomaly_count" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "submitted_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewed_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "approved_by_id" UUID,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMPTZ(6),

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payslips" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "base_amount" DECIMAL(12, 2) NOT NULL,
    "performance_amount" DECIMAL(12, 2) NOT NULL,
    "overtime_amount" DECIMAL(12, 2) NOT NULL,
    "allowance_amount" DECIMAL(12, 2) NOT NULL,
    "sales_commission_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
    "year_end_bonus_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
    "gross_amount" DECIMAL(12, 2) NOT NULL,
    "social_insurance_amount" DECIMAL(12, 2) NOT NULL,
    "housing_fund_amount" DECIMAL(12, 2) NOT NULL,
    "tax_amount" DECIMAL(12, 2) NOT NULL,
    "absence_amount" DECIMAL(12, 2) NOT NULL,
    "deduction_amount" DECIMAL(12, 2) NOT NULL,
    "net_amount" DECIMAL(12, 2) NOT NULL,
    "status" "PayslipStatus" NOT NULL DEFAULT 'calculated',
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recalculate_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payslip_items" (
    "id" UUID NOT NULL,
    "payslip_id" UUID NOT NULL,
    "item_type" "PayslipItemType" NOT NULL,
    "item_name" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(12, 2) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_runs_period_key" ON "payroll_runs"("period");
CREATE INDEX "payroll_runs_status_period_idx" ON "payroll_runs"("status", "period");
CREATE INDEX "payroll_runs_period_status_idx" ON "payroll_runs"("period", "status");

CREATE UNIQUE INDEX "payslips_run_id_employee_id_key" ON "payslips"("run_id", "employee_id");
CREATE INDEX "payslips_employee_id_period_idx" ON "payslips"("employee_id", "period");
CREATE INDEX "payslips_period_status_idx" ON "payslips"("period", "status");

CREATE INDEX "payslip_items_payslip_id_item_type_idx" ON "payslip_items"("payslip_id", "item_type");

ALTER TABLE "payroll_runs"
    ADD CONSTRAINT "payroll_runs_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_runs"
    ADD CONSTRAINT "payroll_runs_submitted_by_id_fkey"
    FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_runs"
    ADD CONSTRAINT "payroll_runs_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_runs"
    ADD CONSTRAINT "payroll_runs_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payslips"
    ADD CONSTRAINT "payslips_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payslips"
    ADD CONSTRAINT "payslips_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payslip_items"
    ADD CONSTRAINT "payslip_items_payslip_id_fkey"
    FOREIGN KEY ("payslip_id") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
