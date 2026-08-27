-- M3-D6: 结果应用 PIP（performance_pips / performance_pip_reviews）

CREATE TYPE "PerformancePipStatus" AS ENUM ('active', 'completed', 'failed', 'cancelled');
CREATE TYPE "PerformancePipReviewRating" AS ENUM ('improved', 'no_change', 'worsened');

CREATE TABLE "performance_pips" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "PerformancePipStatus" NOT NULL DEFAULT 'active',
    "reason" TEXT NOT NULL,
    "outcome" TEXT,
    "triggered_by" VARCHAR(64) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "performance_pips_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_pip_reviews" (
    "id" UUID NOT NULL,
    "pip_id" UUID NOT NULL,
    "review_month" INTEGER NOT NULL,
    "review_date" DATE NOT NULL,
    "rating" "PerformancePipReviewRating" NOT NULL,
    "comment" TEXT,
    "reviewer_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_pip_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "performance_pips_employee_id_status_idx"
    ON "performance_pips"("employee_id", "status");
CREATE INDEX "performance_pips_status_start_date_idx"
    ON "performance_pips"("status", "start_date");
CREATE INDEX "performance_pips_end_date_status_idx"
    ON "performance_pips"("end_date", "status");

CREATE UNIQUE INDEX "performance_pip_reviews_pip_id_review_month_key"
    ON "performance_pip_reviews"("pip_id", "review_month");
CREATE INDEX "performance_pip_reviews_pip_id_review_date_idx"
    ON "performance_pip_reviews"("pip_id", "review_date");

ALTER TABLE "performance_pips"
    ADD CONSTRAINT "performance_pips_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_pips"
    ADD CONSTRAINT "performance_pips_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance_pip_reviews"
    ADD CONSTRAINT "performance_pip_reviews_pip_id_fkey"
    FOREIGN KEY ("pip_id") REFERENCES "performance_pips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_pip_reviews"
    ADD CONSTRAINT "performance_pip_reviews_reviewer_id_fkey"
    FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
