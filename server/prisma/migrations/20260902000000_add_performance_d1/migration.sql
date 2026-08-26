-- M3-D1: 考核方案配置（5 张表）
-- 幂等：IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "performance_cycles" (
  "id" UUID NOT NULL,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "type" VARCHAR(20) NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "description" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "performance_cycles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "performance_cycles_code_key" ON "performance_cycles"("code");
CREATE INDEX IF NOT EXISTS "performance_cycles_type_status_idx" ON "performance_cycles"("type", "status");
CREATE INDEX IF NOT EXISTS "performance_cycles_start_date_end_date_idx" ON "performance_cycles"("start_date", "end_date");

CREATE TABLE IF NOT EXISTS "performance_indicators" (
  "id" UUID NOT NULL,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "type" VARCHAR(10) NOT NULL,
  "category" VARCHAR(100),
  "description" TEXT,
  "default_weight" DECIMAL(5, 2),
  "target" TEXT,
  "unit" VARCHAR(50),
  "scoring_rule" TEXT,
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "performance_indicators_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "performance_indicators_code_key" ON "performance_indicators"("code");
CREATE INDEX IF NOT EXISTS "performance_indicators_type_status_idx" ON "performance_indicators"("type", "status");
CREATE INDEX IF NOT EXISTS "performance_indicators_category_idx" ON "performance_indicators"("category");

CREATE TABLE IF NOT EXISTS "performance_schemes" (
  "id" UUID NOT NULL,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "cycle_id" UUID,
  "applicable_scope" VARCHAR(20) NOT NULL,
  "applicable_dept_id" UUID,
  "applicable_position_level" VARCHAR(50),
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "description" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "source_scheme_id" UUID,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "performance_schemes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "performance_schemes_code_key" ON "performance_schemes"("code");
CREATE INDEX IF NOT EXISTS "performance_schemes_cycle_id_status_idx" ON "performance_schemes"("cycle_id", "status");
CREATE INDEX IF NOT EXISTS "performance_schemes_applicable_scope_applicable_dept_id_idx"
  ON "performance_schemes"("applicable_scope", "applicable_dept_id");
CREATE INDEX IF NOT EXISTS "performance_schemes_source_scheme_id_idx" ON "performance_schemes"("source_scheme_id");

CREATE TABLE IF NOT EXISTS "performance_scheme_indicators" (
  "id" UUID NOT NULL,
  "scheme_id" UUID NOT NULL,
  "indicator_id" UUID NOT NULL,
  "weight" DECIMAL(5, 2) NOT NULL,
  "target" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "performance_scheme_indicators_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "performance_scheme_indicators_scheme_id_indicator_id_key"
  ON "performance_scheme_indicators"("scheme_id", "indicator_id");
CREATE INDEX IF NOT EXISTS "performance_scheme_indicators_scheme_id_sort_order_idx"
  ON "performance_scheme_indicators"("scheme_id", "sort_order");

CREATE TABLE IF NOT EXISTS "performance_coefficients" (
  "id" UUID NOT NULL,
  "grade" VARCHAR(2) NOT NULL,
  "coefficient" DECIMAL(4, 2) NOT NULL,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "performance_coefficients_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "performance_coefficients_grade_effective_from_effective_to_idx"
  ON "performance_coefficients"("grade", "effective_from", "effective_to");
CREATE INDEX IF NOT EXISTS "performance_coefficients_grade_effective_to_idx"
  ON "performance_coefficients"("grade", "effective_to");

ALTER TABLE "performance_schemes"
  DROP CONSTRAINT IF EXISTS "performance_schemes_cycle_id_fkey";
ALTER TABLE "performance_schemes"
  ADD CONSTRAINT "performance_schemes_cycle_id_fkey"
  FOREIGN KEY ("cycle_id") REFERENCES "performance_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "performance_schemes"
  DROP CONSTRAINT IF EXISTS "performance_schemes_source_scheme_id_fkey";
ALTER TABLE "performance_schemes"
  ADD CONSTRAINT "performance_schemes_source_scheme_id_fkey"
  FOREIGN KEY ("source_scheme_id") REFERENCES "performance_schemes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "performance_scheme_indicators"
  DROP CONSTRAINT IF EXISTS "performance_scheme_indicators_scheme_id_fkey";
ALTER TABLE "performance_scheme_indicators"
  ADD CONSTRAINT "performance_scheme_indicators_scheme_id_fkey"
  FOREIGN KEY ("scheme_id") REFERENCES "performance_schemes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "performance_scheme_indicators"
  DROP CONSTRAINT IF EXISTS "performance_scheme_indicators_indicator_id_fkey";
ALTER TABLE "performance_scheme_indicators"
  ADD CONSTRAINT "performance_scheme_indicators_indicator_id_fkey"
  FOREIGN KEY ("indicator_id") REFERENCES "performance_indicators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
