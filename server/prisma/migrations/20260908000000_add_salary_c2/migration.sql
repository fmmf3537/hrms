-- M4-C2: 社保公积金方案（social_insurance_schemes / housing_fund_schemes / employee_insurance_registrations）

CREATE TYPE "SocialInsuranceCity" AS ENUM ('xi_an', 'bei_jing', 'si_chuan');
CREATE TYPE "SocialInsuranceType" AS ENUM ('pension', 'medical', 'unemployment', 'work_injury', 'maternity');
CREATE TYPE "SocialInsuranceStatus" AS ENUM ('active', 'archived');
CREATE TYPE "HousingFundStatus" AS ENUM ('active', 'archived');
CREATE TYPE "EmployeeInsuranceRegistrationStatus" AS ENUM ('active', 'inactive');

CREATE TABLE "social_insurance_schemes" (
    "id" UUID NOT NULL,
    "city" "SocialInsuranceCity" NOT NULL,
    "insurance_type" "SocialInsuranceType" NOT NULL,
    "company_rate" DECIMAL(6, 4) NOT NULL,
    "personal_rate" DECIMAL(6, 4) NOT NULL,
    "base_min" DECIMAL(12, 2) NOT NULL,
    "base_max" DECIMAL(12, 2) NOT NULL,
    "base_adjustment_month" INTEGER NOT NULL,
    "status" "SocialInsuranceStatus" NOT NULL DEFAULT 'active',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "social_insurance_schemes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "housing_fund_schemes" (
    "id" UUID NOT NULL,
    "city" "SocialInsuranceCity" NOT NULL,
    "company_rate" DECIMAL(6, 4) NOT NULL,
    "personal_rate" DECIMAL(6, 4) NOT NULL,
    "base_min" DECIMAL(12, 2) NOT NULL,
    "base_max" DECIMAL(12, 2) NOT NULL,
    "status" "HousingFundStatus" NOT NULL DEFAULT 'active',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "housing_fund_schemes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_insurance_registrations" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "city" "SocialInsuranceCity" NOT NULL,
    "social_insurance_scheme_id" UUID,
    "housing_fund_scheme_id" UUID,
    "base_salary" DECIMAL(12, 2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "status" "EmployeeInsuranceRegistrationStatus" NOT NULL DEFAULT 'active',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_insurance_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "social_insurance_schemes_city_insurance_type_key"
    ON "social_insurance_schemes"("city", "insurance_type");
CREATE INDEX "social_insurance_schemes_city_status_idx"
    ON "social_insurance_schemes"("city", "status");
CREATE INDEX "social_insurance_schemes_insurance_type_status_idx"
    ON "social_insurance_schemes"("insurance_type", "status");

CREATE UNIQUE INDEX "housing_fund_schemes_city_key"
    ON "housing_fund_schemes"("city");
CREATE INDEX "housing_fund_schemes_city_status_idx"
    ON "housing_fund_schemes"("city", "status");

CREATE INDEX "employee_insurance_registrations_employee_id_status_idx"
    ON "employee_insurance_registrations"("employee_id", "status");
CREATE INDEX "employee_insurance_registrations_city_status_idx"
    ON "employee_insurance_registrations"("city", "status");
CREATE INDEX "employee_insurance_registrations_status_effective_from_effective_to_idx"
    ON "employee_insurance_registrations"("status", "effective_from", "effective_to");

ALTER TABLE "social_insurance_schemes"
    ADD CONSTRAINT "social_insurance_schemes_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "housing_fund_schemes"
    ADD CONSTRAINT "housing_fund_schemes_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_insurance_registrations"
    ADD CONSTRAINT "employee_insurance_registrations_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_insurance_registrations"
    ADD CONSTRAINT "employee_insurance_registrations_social_insurance_scheme_id_fkey"
    FOREIGN KEY ("social_insurance_scheme_id") REFERENCES "social_insurance_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_insurance_registrations"
    ADD CONSTRAINT "employee_insurance_registrations_housing_fund_scheme_id_fkey"
    FOREIGN KEY ("housing_fund_scheme_id") REFERENCES "housing_fund_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_insurance_registrations"
    ADD CONSTRAINT "employee_insurance_registrations_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
