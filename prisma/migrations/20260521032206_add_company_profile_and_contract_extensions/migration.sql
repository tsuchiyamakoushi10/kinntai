-- CreateEnum
CREATE TYPE "weekly_hours_category" AS ENUM ('under_20', 'between_20_30', 'between_30_40');

-- CreateEnum
CREATE TYPE "special_measure_type" AS ENUM ('none', 'high_skill', 'post_retirement');

-- AlterTable
ALTER TABLE "employment_contracts" ADD COLUMN     "bonus_description" TEXT,
ADD COLUMN     "has_bonus" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "has_early_end_possibility" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "has_overtime" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "job_description_initial" TEXT,
ADD COLUMN     "job_description_scope" TEXT,
ADD COLUMN     "retirement_allowance_start_text" TEXT,
ADD COLUMN     "shift_based_schedule" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "special_measure_business_title" TEXT,
ADD COLUMN     "special_measure_end_on" DATE,
ADD COLUMN     "special_measure_start_on" DATE,
ADD COLUMN     "special_measure_type" "special_measure_type" NOT NULL DEFAULT 'none',
ADD COLUMN     "weekly_hours_category" "weekly_hours_category",
ADD COLUMN     "workplace_initial" TEXT,
ADD COLUMN     "workplace_scope" TEXT;

-- CreateTable
CREATE TABLE "company_profile" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "representative_title" TEXT NOT NULL,
    "representative_name" TEXT NOT NULL,
    "retirement_age" INTEGER NOT NULL,
    "continued_employment_age" INTEGER NOT NULL,
    "resign_notice_days" INTEGER NOT NULL,
    "wage_cutoff_day" TEXT NOT NULL,
    "wage_payment_day" TEXT NOT NULL,
    "wage_payment_method" TEXT NOT NULL,
    "salary_raise_period" TEXT NOT NULL,
    "overtime_rate_under_60h" INTEGER NOT NULL,
    "overtime_rate_over_60h" INTEGER NOT NULL,
    "overtime_rate_within" INTEGER NOT NULL,
    "holiday_legal_rate" INTEGER NOT NULL,
    "night_rate" INTEGER NOT NULL,
    "break_rule_text" TEXT NOT NULL,
    "work_rules_name" TEXT NOT NULL,
    "part_time_work_rules_name" TEXT NOT NULL,
    "contact_department" TEXT NOT NULL,
    "contact_person_title" TEXT NOT NULL,
    "contact_person_name" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "company_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_contract_allowances" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amount_yen" INTEGER NOT NULL,
    "calculation_method" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employment_contract_allowances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employment_contract_allowances_contract_id_sort_order_idx" ON "employment_contract_allowances"("contract_id", "sort_order");

-- AddForeignKey
ALTER TABLE "employment_contract_allowances" ADD CONSTRAINT "employment_contract_allowances_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "employment_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
