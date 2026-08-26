-- M1-A7: 合同管理 contract_records
-- 幂等：IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "contract_records" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "contract_no" VARCHAR(50) NOT NULL,
  "contract_type" VARCHAR(50) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "probation_months" INTEGER,
  "base_salary" DECIMAL(10, 2),
  "position" VARCHAR(100),
  "work_location" VARCHAR(200),
  "template_key" VARCHAR(50) NOT NULL,
  "attachments" JSONB,
  "signatories" JSONB,
  "esign_provider" VARCHAR(20) NOT NULL DEFAULT 'mock',
  "esign_flow_id" VARCHAR(100),
  "esign_flow_url" TEXT,
  "approval_instance_id" UUID,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "signed_at" TIMESTAMPTZ(6),
  "signed_by" UUID,
  "expire_warned_30d" BOOLEAN NOT NULL DEFAULT false,
  "expire_warned_15d" BOOLEAN NOT NULL DEFAULT false,
  "expire_warned_7d" BOOLEAN NOT NULL DEFAULT false,
  "expired_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "cancelled_by" UUID,
  "cancelled_reason" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "contract_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "contract_records_contract_no_key"
  ON "contract_records"("contract_no");
CREATE UNIQUE INDEX IF NOT EXISTS "contract_records_approval_instance_id_key"
  ON "contract_records"("approval_instance_id");
CREATE INDEX IF NOT EXISTS "contract_records_employee_id_status_idx"
  ON "contract_records"("employee_id", "status");
CREATE INDEX IF NOT EXISTS "contract_records_status_end_date_idx"
  ON "contract_records"("status", "end_date");
CREATE INDEX IF NOT EXISTS "contract_records_contract_type_status_idx"
  ON "contract_records"("contract_type", "status");
CREATE INDEX IF NOT EXISTS "contract_records_created_by_status_idx"
  ON "contract_records"("created_by", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contract_records_employee_id_fkey'
  ) THEN
    ALTER TABLE "contract_records"
      ADD CONSTRAINT "contract_records_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
