-- M3-D5: 销售提成（performance_sales_products / payments / commissions）

CREATE TYPE "PerformanceSalesProductCategory" AS ENUM ('product', 'service', 'training');
CREATE TYPE "PerformanceSalesProductStatus" AS ENUM ('active', 'archived');
CREATE TYPE "PerformanceSalesPaymentStatus" AS ENUM ('draft', 'confirmed', 'cancelled');
CREATE TYPE "PerformanceSalesCommissionStatus" AS ENUM ('calculated', 'paid', 'cancelled');

CREATE TABLE "performance_sales_products" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" "PerformanceSalesProductCategory" NOT NULL,
    "base_rate" DECIMAL(5,4) NOT NULL,
    "description" TEXT,
    "status" "PerformanceSalesProductStatus" NOT NULL DEFAULT 'active',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "performance_sales_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_sales_payments" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "customer_name" VARCHAR(200) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "status" "PerformanceSalesPaymentStatus" NOT NULL DEFAULT 'draft',
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "remark" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "performance_sales_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_sales_commissions" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "base_amount" DECIMAL(12,2) NOT NULL,
    "commission_rate" DECIMAL(5,4) NOT NULL,
    "target_bonus_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "final_amount" DECIMAL(12,2) NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "status" "PerformanceSalesCommissionStatus" NOT NULL DEFAULT 'calculated',
    "calculated_by" VARCHAR(64) NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(6),
    "remark" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "performance_sales_commissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "performance_sales_products_code_key"
    ON "performance_sales_products"("code");
CREATE INDEX "performance_sales_products_category_status_idx"
    ON "performance_sales_products"("category", "status");

CREATE INDEX "performance_sales_payments_employee_id_status_idx"
    ON "performance_sales_payments"("employee_id", "status");
CREATE INDEX "performance_sales_payments_product_id_status_idx"
    ON "performance_sales_payments"("product_id", "status");
CREATE INDEX "performance_sales_payments_status_payment_date_idx"
    ON "performance_sales_payments"("status", "payment_date");
CREATE INDEX "performance_sales_payments_period_status_idx"
    ON "performance_sales_payments"("period", "status");

CREATE UNIQUE INDEX "performance_sales_commissions_payment_id_key"
    ON "performance_sales_commissions"("payment_id");
CREATE INDEX "performance_sales_commissions_employee_id_status_idx"
    ON "performance_sales_commissions"("employee_id", "status");
CREATE INDEX "performance_sales_commissions_status_period_idx"
    ON "performance_sales_commissions"("status", "period");
CREATE INDEX "performance_sales_commissions_period_status_idx"
    ON "performance_sales_commissions"("period", "status");

ALTER TABLE "performance_sales_products"
    ADD CONSTRAINT "performance_sales_products_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance_sales_payments"
    ADD CONSTRAINT "performance_sales_payments_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_sales_payments"
    ADD CONSTRAINT "performance_sales_payments_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "performance_sales_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_sales_payments"
    ADD CONSTRAINT "performance_sales_payments_confirmed_by_id_fkey"
    FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performance_sales_payments"
    ADD CONSTRAINT "performance_sales_payments_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance_sales_commissions"
    ADD CONSTRAINT "performance_sales_commissions_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_sales_commissions"
    ADD CONSTRAINT "performance_sales_commissions_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "performance_sales_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_sales_commissions"
    ADD CONSTRAINT "performance_sales_commissions_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "performance_sales_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
