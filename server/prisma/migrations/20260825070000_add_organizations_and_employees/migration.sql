-- M1-A1+A2: 扩展 companies / departments / employees + 新建岗位/薪资历史表
-- 幂等：IF NOT EXISTS / 条件 DROP

-- ========== companies ==========
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "legal_rep" VARCHAR(50);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "tax_no" VARCHAR(50);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "created_by" UUID;

CREATE INDEX IF NOT EXISTS "companies_status_idx" ON "companies"("status");

-- ========== departments ==========
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "headcount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "created_by" UUID;
ALTER TABLE "departments" ALTER COLUMN "name" TYPE VARCHAR(200);

-- 公司内唯一：先丢全局 unique，再建 (company_id, code)
DROP INDEX IF EXISTS "departments_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "departments_company_id_code_key" ON "departments"("company_id", "code");
CREATE INDEX IF NOT EXISTS "departments_status_idx" ON "departments"("status");

-- ========== employees ==========
-- hire_date 先填默认再改 NOT NULL（兼容已有空值）
UPDATE "employees" SET "hire_date" = CURRENT_DATE WHERE "hire_date" IS NULL;

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "native_place" VARCHAR(200);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "ethnicity" VARCHAR(20);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "political_status" VARCHAR(50);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "emergency_contact_name" VARCHAR(50);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "emergency_contact_phone" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "education_level" VARCHAR(50);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "degree" VARCHAR(50);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "school" VARCHAR(200);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "major" VARCHAR(100);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "graduation_date" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "work_history" JSONB;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "contract_start" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "contract_end" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "certificates" JSONB;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "bank_name" VARCHAR(100);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "bank_card" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "social_insured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "social_city" VARCHAR(50);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "social_base" DECIMAL(10,2);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "housing_fund_city" VARCHAR(50);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "housing_fund_rate" DECIMAL(4,2);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "housing_fund_base" DECIMAL(10,2);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "resignation_date" DATE;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "remark" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "created_by" UUID;

-- RENAME employment_type → contract_type（幂等）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'employment_type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'contract_type'
  ) THEN
    ALTER TABLE "employees" RENAME COLUMN "employment_type" TO "contract_type";
  END IF;
END $$;

-- contract_type 可空
ALTER TABLE "employees" ALTER COLUMN "contract_type" DROP NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "contract_type" TYPE VARCHAR(50);

-- id_card / phone → TEXT，丢唯一约束
DROP INDEX IF EXISTS "employees_id_card_key";
ALTER TABLE "employees" ALTER COLUMN "id_card" TYPE TEXT;
ALTER TABLE "employees" ALTER COLUMN "phone" TYPE TEXT;

-- employee_no 扩长；hire_date 必填
ALTER TABLE "employees" ALTER COLUMN "employee_no" TYPE VARCHAR(30);
ALTER TABLE "employees" ALTER COLUMN "hire_date" SET NOT NULL;

-- 旧索引（employment_type）
DROP INDEX IF EXISTS "employees_employment_type_status_idx";

CREATE INDEX IF NOT EXISTS "employees_status_idx" ON "employees"("status");
CREATE INDEX IF NOT EXISTS "employees_contract_end_idx" ON "employees"("contract_end");
CREATE INDEX IF NOT EXISTS "employees_hire_date_idx" ON "employees"("hire_date");
CREATE INDEX IF NOT EXISTS "employees_deleted_at_idx" ON "employees"("deleted_at");

-- department FK：SET NULL → RESTRICT
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_department_id_fkey";
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ========== employee_position_history ==========
CREATE TABLE IF NOT EXISTS "employee_position_history" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "from_company_id" UUID,
    "from_dept_id" UUID,
    "from_position" VARCHAR(100),
    "to_company_id" UUID NOT NULL,
    "to_dept_id" UUID NOT NULL,
    "to_position" VARCHAR(100) NOT NULL,
    "change_type" VARCHAR(20) NOT NULL,
    "change_date" DATE NOT NULL,
    "reason" TEXT,
    "operator_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_position_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "employee_position_history_employee_id_change_date_idx"
  ON "employee_position_history"("employee_id", "change_date");

-- ========== employee_salary_history ==========
CREATE TABLE IF NOT EXISTS "employee_salary_history" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "effective_date" DATE NOT NULL,
    "base_salary" DECIMAL(10,2) NOT NULL,
    "performance_salary" DECIMAL(10,2),
    "total_salary" DECIMAL(10,2) NOT NULL,
    "change_type" VARCHAR(20) NOT NULL,
    "reason" TEXT,
    "operator_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_salary_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "employee_salary_history_employee_id_effective_date_idx"
  ON "employee_salary_history"("employee_id", "effective_date");
