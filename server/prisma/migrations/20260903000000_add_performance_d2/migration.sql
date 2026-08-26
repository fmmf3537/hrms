-- M3-D2: 考核流程（performance_records / scores / score_items / ai_suggestions）

CREATE TABLE "performance_records" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "scheme_id" UUID,
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "final_grade" VARCHAR(2),
    "final_score" DECIMAL(5,2),
    "submitted_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "approval_instance_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "performance_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_scores" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "stage" VARCHAR(20) NOT NULL,
    "total_score" DECIMAL(5,2) NOT NULL,
    "comment" TEXT,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submitted_by" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "performance_scores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_score_items" (
    "id" UUID NOT NULL,
    "score_id" UUID NOT NULL,
    "indicator_id" UUID NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "weighted_score" DECIMAL(5,2) NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "performance_score_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_ai_suggestions" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "raw_response" TEXT NOT NULL,
    "suggestions" JSONB NOT NULL,
    "model_name" VARCHAR(100) NOT NULL,
    "tokens" INTEGER NOT NULL,
    "cost" DECIMAL(8,4) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_ai_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "performance_records_employee_id_cycle_id_key"
    ON "performance_records"("employee_id", "cycle_id");
CREATE INDEX "performance_records_cycle_id_status_idx"
    ON "performance_records"("cycle_id", "status");
CREATE INDEX "performance_records_status_submitted_at_idx"
    ON "performance_records"("status", "submitted_at");
CREATE INDEX "performance_records_employee_id_status_idx"
    ON "performance_records"("employee_id", "status");

CREATE UNIQUE INDEX "performance_scores_record_id_stage_version_key"
    ON "performance_scores"("record_id", "stage", "version");
CREATE INDEX "performance_scores_record_id_stage_is_current_idx"
    ON "performance_scores"("record_id", "stage", "is_current");

CREATE UNIQUE INDEX "performance_score_items_score_id_indicator_id_key"
    ON "performance_score_items"("score_id", "indicator_id");
CREATE INDEX "performance_score_items_score_id_idx"
    ON "performance_score_items"("score_id");

CREATE INDEX "performance_ai_suggestions_record_id_created_at_idx"
    ON "performance_ai_suggestions"("record_id", "created_at");

ALTER TABLE "performance_records"
    ADD CONSTRAINT "performance_records_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_records"
    ADD CONSTRAINT "performance_records_cycle_id_fkey"
    FOREIGN KEY ("cycle_id") REFERENCES "performance_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_records"
    ADD CONSTRAINT "performance_records_scheme_id_fkey"
    FOREIGN KEY ("scheme_id") REFERENCES "performance_schemes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "performance_scores"
    ADD CONSTRAINT "performance_scores_record_id_fkey"
    FOREIGN KEY ("record_id") REFERENCES "performance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "performance_score_items"
    ADD CONSTRAINT "performance_score_items_score_id_fkey"
    FOREIGN KEY ("score_id") REFERENCES "performance_scores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_score_items"
    ADD CONSTRAINT "performance_score_items_indicator_id_fkey"
    FOREIGN KEY ("indicator_id") REFERENCES "performance_indicators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance_ai_suggestions"
    ADD CONSTRAINT "performance_ai_suggestions_record_id_fkey"
    FOREIGN KEY ("record_id") REFERENCES "performance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
