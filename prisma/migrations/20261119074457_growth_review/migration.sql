-- CreateEnum
CREATE TYPE "growth_step" AS ENUM ('step1', 'step2', 'step3', 'step4', 'step5');

-- CreateEnum
CREATE TYPE "eval_rank" AS ENUM ('s', 'a', 'b', 'c');

-- CreateEnum
CREATE TYPE "interview_record_status" AS ENUM ('not_started', 'in_progress', 'done');

-- CreateEnum
CREATE TYPE "hr_assessment_status" AS ENUM ('draft', 'submitted');

-- CreateEnum
CREATE TYPE "growth_decision_status" AS ENUM ('draft', 'confirmed');

-- AlterEnum
ALTER TYPE "user_role" ADD VALUE 'manager';

-- CreateTable
CREATE TABLE "evaluation_periods" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_on" DATE NOT NULL,
    "end_on" DATE NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evaluation_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "growth_profiles" (
    "employee_id" UUID NOT NULL,
    "growth_step" "growth_step",
    "manager_employee_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "growth_profiles_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "growth_step_histories" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "step" "growth_step" NOT NULL,
    "changed_on" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "growth_step_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "growth_expectations" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "growth_expectations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_sheets" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "office_id" UUID,
    "effort" TEXT NOT NULL DEFAULT '',
    "trouble" TEXT NOT NULL DEFAULT '',
    "growth" TEXT NOT NULL DEFAULT '',
    "vision" TEXT NOT NULL DEFAULT '',
    "proposal" TEXT NOT NULL DEFAULT '',
    "submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "interview_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_records" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "office_id" UUID,
    "interviewer_id" UUID,
    "interviewed_on" DATE,
    "strength" TEXT NOT NULL DEFAULT '',
    "issue" TEXT NOT NULL DEFAULT '',
    "expectation" TEXT NOT NULL DEFAULT '',
    "follow_up" TEXT NOT NULL DEFAULT '',
    "expected_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "support_plan" TEXT NOT NULL DEFAULT '',
    "current_step" "growth_step",
    "next_step" "growth_step",
    "status" "interview_record_status" NOT NULL DEFAULT 'in_progress',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "interview_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_assessments" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "office_id" UUID,
    "assessor_id" UUID,
    "user_centered_action" "eval_rank",
    "user_centered_action_evidence" TEXT NOT NULL DEFAULT '',
    "respectful_interaction" "eval_rank",
    "respectful_interaction_evidence" TEXT NOT NULL DEFAULT '',
    "teamwork" "eval_rank",
    "teamwork_evidence" TEXT NOT NULL DEFAULT '',
    "initiative_improvement" "eval_rank",
    "initiative_improvement_evidence" TEXT NOT NULL DEFAULT '',
    "responsibility" "eval_rank",
    "responsibility_evidence" TEXT NOT NULL DEFAULT '',
    "overall_comment" TEXT NOT NULL DEFAULT '',
    "status" "hr_assessment_status" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hr_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_final_assessments" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "office_id" UUID,
    "user_centered_action" "eval_rank",
    "respectful_interaction" "eval_rank",
    "teamwork" "eval_rank",
    "initiative_improvement" "eval_rank",
    "responsibility" "eval_rank",
    "change_reason" TEXT NOT NULL DEFAULT '',
    "overall_rank" "eval_rank",
    "comment" TEXT NOT NULL DEFAULT '',
    "status" "growth_decision_status" NOT NULL DEFAULT 'draft',
    "confirmed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hr_final_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "growth_reviews" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "office_id" UUID,
    "president_memo" TEXT NOT NULL DEFAULT '',
    "needs_follow_up" BOOLEAN NOT NULL DEFAULT false,
    "follow_up_reason" TEXT NOT NULL DEFAULT '',
    "expectation_level" TEXT,
    "development_rank" TEXT,
    "talent_potential" TEXT,
    "future_role" TEXT NOT NULL DEFAULT '',
    "lacking_skills" TEXT NOT NULL DEFAULT '',
    "next_assignment_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "next_assignments" TEXT NOT NULL DEFAULT '',
    "development_policy" TEXT NOT NULL DEFAULT '',
    "prev_base_salary" INTEGER,
    "current_base_salary" INTEGER,
    "prev_bonus" INTEGER,
    "current_bonus" INTEGER,
    "salary_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bonus_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "compensation_reason" TEXT NOT NULL DEFAULT '',
    "president_message" TEXT NOT NULL DEFAULT '',
    "status" "growth_decision_status" NOT NULL DEFAULT 'draft',
    "confirmed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "growth_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evaluation_periods_start_on_idx" ON "evaluation_periods"("start_on" DESC);

-- CreateIndex
CREATE INDEX "growth_profiles_manager_employee_id_idx" ON "growth_profiles"("manager_employee_id");

-- CreateIndex
CREATE INDEX "growth_step_histories_employee_id_changed_on_idx" ON "growth_step_histories"("employee_id", "changed_on" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "growth_expectations_employee_id_period_id_key" ON "growth_expectations"("employee_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_sheets_employee_id_period_id_key" ON "interview_sheets"("employee_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_records_employee_id_period_id_key" ON "interview_records"("employee_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "hr_assessments_employee_id_period_id_key" ON "hr_assessments"("employee_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "hr_final_assessments_employee_id_period_id_key" ON "hr_final_assessments"("employee_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "growth_reviews_employee_id_period_id_key" ON "growth_reviews"("employee_id", "period_id");

-- AddForeignKey
ALTER TABLE "growth_profiles" ADD CONSTRAINT "growth_profiles_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_profiles" ADD CONSTRAINT "growth_profiles_manager_employee_id_fkey" FOREIGN KEY ("manager_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_step_histories" ADD CONSTRAINT "growth_step_histories_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_expectations" ADD CONSTRAINT "growth_expectations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_expectations" ADD CONSTRAINT "growth_expectations_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "evaluation_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sheets" ADD CONSTRAINT "interview_sheets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sheets" ADD CONSTRAINT "interview_sheets_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "evaluation_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sheets" ADD CONSTRAINT "interview_sheets_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_records" ADD CONSTRAINT "interview_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_records" ADD CONSTRAINT "interview_records_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "evaluation_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_records" ADD CONSTRAINT "interview_records_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_records" ADD CONSTRAINT "interview_records_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_assessments" ADD CONSTRAINT "hr_assessments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_assessments" ADD CONSTRAINT "hr_assessments_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "evaluation_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_assessments" ADD CONSTRAINT "hr_assessments_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_assessments" ADD CONSTRAINT "hr_assessments_assessor_id_fkey" FOREIGN KEY ("assessor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_final_assessments" ADD CONSTRAINT "hr_final_assessments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_final_assessments" ADD CONSTRAINT "hr_final_assessments_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "evaluation_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_final_assessments" ADD CONSTRAINT "hr_final_assessments_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_reviews" ADD CONSTRAINT "growth_reviews_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_reviews" ADD CONSTRAINT "growth_reviews_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "evaluation_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_reviews" ADD CONSTRAINT "growth_reviews_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Supabase: 他テーブルと同様に RLS を有効化 (アプリは Prisma 直結のため影響なし)
ALTER TABLE "evaluation_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth_step_histories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth_expectations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interview_sheets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interview_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_final_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "growth_reviews" ENABLE ROW LEVEL SECURITY;
