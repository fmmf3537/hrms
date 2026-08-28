-- M4-C7: 人力成本预警记录（hr_cost_alerts）
-- 不修改 C4 payslips / A6 offboarding_records / M1 employees / B4 overtime_requests；不建外键到这些表

CREATE TYPE "HrCostAlertType" AS ENUM ('overtime_ratio', 'attrition_monthly');
CREATE TYPE "HrCostAlertSeverity" AS ENUM ('warning', 'critical');
CREATE TYPE "HrCostAlertStatus" AS ENUM ('active', 'acknowledged', 'closed');

CREATE TABLE "hr_cost_alerts" (
    "id" UUID NOT NULL,
    "alert_type" "HrCostAlertType" NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "department_id" UUID,
    "threshold" DECIMAL(5, 4) NOT NULL,
    "actual_value" DECIMAL(5, 4) NOT NULL,
    "severity" "HrCostAlertSeverity" NOT NULL,
    "status" "HrCostAlertStatus" NOT NULL DEFAULT 'active',
    "scan_at" TIMESTAMPTZ(6) NOT NULL,
    "context_snapshot" JSONB NOT NULL,
    "acknowledged_by" UUID,
    "acknowledged_at" TIMESTAMPTZ(6),
    "acknowledge_note" TEXT,
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "close_reason" TEXT,
    "remark" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hr_cost_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hr_cost_alerts_alert_type_period_department_id_key" ON "hr_cost_alerts"("alert_type", "period", "department_id");
CREATE INDEX "hr_cost_alerts_alert_type_status_period_idx" ON "hr_cost_alerts"("alert_type", "status", "period");
CREATE INDEX "hr_cost_alerts_status_severity_period_idx" ON "hr_cost_alerts"("status", "severity", "period");
CREATE INDEX "hr_cost_alerts_department_id_status_idx" ON "hr_cost_alerts"("department_id", "status");
CREATE INDEX "hr_cost_alerts_scan_at_idx" ON "hr_cost_alerts"("scan_at");

ALTER TABLE "hr_cost_alerts"
    ADD CONSTRAINT "hr_cost_alerts_acknowledged_by_fkey"
    FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hr_cost_alerts"
    ADD CONSTRAINT "hr_cost_alerts_closed_by_fkey"
    FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
