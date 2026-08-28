-- M4-C8: 调薪申请（salary_adjustments）
-- 不修改 C1 employee_salary_plans / M1 employee_salary_history / employee_position_history / employees；不建外键到这些表

CREATE TYPE "SalaryAdjustmentType" AS ENUM ('promotion', 'annual_adjust', 'performance', 'market_adjustment');
CREATE TYPE "SalaryAdjustmentStatus" AS ENUM ('draft', 'pending', 'approved', 'rejected', 'executed', 'cancelled');

CREATE TABLE "salary_adjustments" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "adjustment_type" "SalaryAdjustmentType" NOT NULL,
    "from_base_salary" DECIMAL(10, 2) NOT NULL,
    "from_performance_salary" DECIMAL(10, 2),
    "to_base_salary" DECIMAL(10, 2) NOT NULL,
    "to_performance_salary" DECIMAL(10, 2),
    "delta" DECIMAL(10, 2) NOT NULL,
    "effective_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "remark" TEXT,
    "approval_instance_id" UUID,
    "status" "SalaryAdjustmentStatus" NOT NULL DEFAULT 'draft',
    "executed_at" TIMESTAMPTZ(6),
    "executed_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "salary_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "salary_adjustments_employee_id_effective_date_adjustment_type_key"
    ON "salary_adjustments"("employee_id", "effective_date", "adjustment_type");
CREATE UNIQUE INDEX "salary_adjustments_approval_instance_id_key"
    ON "salary_adjustments"("approval_instance_id");
CREATE INDEX "salary_adjustments_employee_id_status_idx" ON "salary_adjustments"("employee_id", "status");
CREATE INDEX "salary_adjustments_status_effective_date_idx" ON "salary_adjustments"("status", "effective_date");
CREATE INDEX "salary_adjustments_adjustment_type_status_idx" ON "salary_adjustments"("adjustment_type", "status");
CREATE INDEX "salary_adjustments_created_by_status_idx" ON "salary_adjustments"("created_by", "status");

ALTER TABLE "salary_adjustments"
    ADD CONSTRAINT "salary_adjustments_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
