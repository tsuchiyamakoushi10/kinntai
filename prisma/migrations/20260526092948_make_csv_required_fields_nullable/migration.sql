-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "last_name_kana" DROP NOT NULL,
ALTER COLUMN "first_name_kana" DROP NOT NULL,
ALTER COLUMN "birth_date" DROP NOT NULL,
ALTER COLUMN "office_id" DROP NOT NULL,
ALTER COLUMN "job_category" DROP NOT NULL,
ALTER COLUMN "employment_type" DROP NOT NULL,
ALTER COLUMN "joined_at" DROP NOT NULL,
ALTER COLUMN "hired_at" DROP NOT NULL,
ALTER COLUMN "weekly_work_days" DROP NOT NULL,
ALTER COLUMN "daily_work_hours" DROP NOT NULL,
ALTER COLUMN "base_wage_type" DROP NOT NULL,
ALTER COLUMN "base_wage_amount" DROP NOT NULL;

-- AlterTable
ALTER TABLE "employment_contracts" ALTER COLUMN "contract_start_on" DROP NOT NULL,
ALTER COLUMN "employment_type" DROP NOT NULL,
ALTER COLUMN "working_hours_per_day" DROP NOT NULL,
ALTER COLUMN "working_days_per_week" DROP NOT NULL,
ALTER COLUMN "wage_type" DROP NOT NULL,
ALTER COLUMN "wage_amount" DROP NOT NULL,
ALTER COLUMN "is_renewable" DROP NOT NULL,
ALTER COLUMN "has_employment_insurance" DROP NOT NULL,
ALTER COLUMN "has_social_insurance" DROP NOT NULL;

-- AlterTable
ALTER TABLE "qualifications" ALTER COLUMN "acquired_on" DROP NOT NULL;

-- AlterTable
ALTER TABLE "training_records" ALTER COLUMN "trained_on" DROP NOT NULL;
