-- M4-C1: 薪级薪档 + 员工薪酬方案（salary_grades / salary_grade_levels / employee_salary_plans）

CREATE TYPE "SalaryGradeSequence" AS ENUM ('M', 'T', 'P', 'S', 'A');
CREATE TYPE "SalaryGradeStatus" AS ENUM ('active', 'archived');
CREATE TYPE "SalaryGradeLevelStatus" AS ENUM ('active', 'archived');
CREATE TYPE "EmployeeSalaryPlanStatus" AS ENUM ('active', 'inactive', 'superseded');

CREATE TABLE "salary_grades" (
    "id" UUID NOT NULL,
    "sequence" "SalaryGradeSequence" NOT NULL,
    "grade_code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "min_base_salary" DECIMAL(12, 2) NOT NULL,
    "max_base_salary" DECIMAL(12, 2) NOT NULL,
    "min_performance_base" DECIMAL(12, 2) NOT NULL,
    "max_performance_base" DECIMAL(12, 2) NOT NULL,
    "status" "SalaryGradeStatus" NOT NULL DEFAULT 'active',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "salary_grades_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "salary_grade_levels" (
    "id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "base_salary" DECIMAL(12, 2) NOT NULL,
    "performance_base" DECIMAL(12, 2) NOT NULL,
    "status" "SalaryGradeLevelStatus" NOT NULL DEFAULT 'active',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "salary_grade_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_salary_plans" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "base_salary" DECIMAL(12, 2) NOT NULL,
    "performance_base" DECIMAL(12, 2) NOT NULL,
    "allowance" DECIMAL(12, 2),
    "welfare" TEXT,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "status" "EmployeeSalaryPlanStatus" NOT NULL DEFAULT 'active',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_salary_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "salary_grades_sequence_grade_code_key"
    ON "salary_grades"("sequence", "grade_code");
CREATE INDEX "salary_grades_sequence_status_idx"
    ON "salary_grades"("sequence", "status");

CREATE UNIQUE INDEX "salary_grade_levels_grade_id_level_key"
    ON "salary_grade_levels"("grade_id", "level");
CREATE INDEX "salary_grade_levels_grade_id_level_status_idx"
    ON "salary_grade_levels"("grade_id", "level", "status");

CREATE INDEX "employee_salary_plans_employee_id_status_idx"
    ON "employee_salary_plans"("employee_id", "status");
CREATE INDEX "employee_salary_plans_employee_id_effective_from_effective_to_idx"
    ON "employee_salary_plans"("employee_id", "effective_from", "effective_to");
CREATE INDEX "employee_salary_plans_status_effective_to_idx"
    ON "employee_salary_plans"("status", "effective_to");

ALTER TABLE "salary_grades"
    ADD CONSTRAINT "salary_grades_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "salary_grade_levels"
    ADD CONSTRAINT "salary_grade_levels_grade_id_fkey"
    FOREIGN KEY ("grade_id") REFERENCES "salary_grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_grade_levels"
    ADD CONSTRAINT "salary_grade_levels_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_salary_plans"
    ADD CONSTRAINT "employee_salary_plans_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_salary_plans"
    ADD CONSTRAINT "employee_salary_plans_grade_id_fkey"
    FOREIGN KEY ("grade_id") REFERENCES "salary_grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_salary_plans"
    ADD CONSTRAINT "employee_salary_plans_level_id_fkey"
    FOREIGN KEY ("level_id") REFERENCES "salary_grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_salary_plans"
    ADD CONSTRAINT "employee_salary_plans_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
