-- M4-C6: 销售提成季度结算单（commission_settlements）
-- 不修改 D5 / C4 / C5 任何表；不建外键到 performance_sales_commissions

CREATE TYPE "CommissionSettlementStatus" AS ENUM ('draft', 'pending_confirm', 'confirmed', 'cancelled');

CREATE TABLE "commission_settlements" (
    "id" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "quarter" SMALLINT NOT NULL,
    "status" "CommissionSettlementStatus" NOT NULL DEFAULT 'draft',
    "total_amount" DECIMAL(14, 2) NOT NULL,
    "record_count" INTEGER NOT NULL,
    "employee_count" INTEGER NOT NULL,
    "product_count" INTEGER NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "remark" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "commission_settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commission_settlements_year_quarter_key" ON "commission_settlements"("year", "quarter");
CREATE INDEX "commission_settlements_status_year_quarter_idx" ON "commission_settlements"("status", "year", "quarter");
CREATE INDEX "commission_settlements_year_quarter_idx" ON "commission_settlements"("year", "quarter");
CREATE INDEX "commission_settlements_created_by_idx" ON "commission_settlements"("created_by");

ALTER TABLE "commission_settlements"
    ADD CONSTRAINT "commission_settlements_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission_settlements"
    ADD CONSTRAINT "commission_settlements_confirmed_by_fkey"
    FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commission_settlements"
    ADD CONSTRAINT "commission_settlements_cancelled_by_fkey"
    FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
