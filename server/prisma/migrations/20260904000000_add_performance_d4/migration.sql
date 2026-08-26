-- M3-D4: 绩效兑现（performance_payout_configs / performance_payouts）

CREATE TABLE "performance_payout_configs" (
    "id" UUID NOT NULL,
    "mode" VARCHAR(20) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "remark" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_payout_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_payouts" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "mode" VARCHAR(20) NOT NULL,
    "base_amount" DECIMAL(12,2) NOT NULL,
    "coefficient" DECIMAL(4,2) NOT NULL,
    "ratio" DECIMAL(5,4),
    "actual_amount" DECIMAL(12,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "performance_payouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "performance_payout_configs_mode_effective_from_effective_to_idx"
    ON "performance_payout_configs"("mode", "effective_from", "effective_to");
CREATE INDEX "performance_payout_configs_mode_effective_to_idx"
    ON "performance_payout_configs"("mode", "effective_to");

CREATE UNIQUE INDEX "performance_payouts_employee_id_cycle_id_month_mode_key"
    ON "performance_payouts"("employee_id", "cycle_id", "month", "mode");
CREATE INDEX "performance_payouts_cycle_id_status_idx"
    ON "performance_payouts"("cycle_id", "status");
CREATE INDEX "performance_payouts_employee_id_period_idx"
    ON "performance_payouts"("employee_id", "period");
CREATE INDEX "performance_payouts_period_status_idx"
    ON "performance_payouts"("period", "status");
CREATE INDEX "performance_payouts_mode_status_idx"
    ON "performance_payouts"("mode", "status");

ALTER TABLE "performance_payouts"
    ADD CONSTRAINT "performance_payouts_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_payouts"
    ADD CONSTRAINT "performance_payouts_cycle_id_fkey"
    FOREIGN KEY ("cycle_id") REFERENCES "performance_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
