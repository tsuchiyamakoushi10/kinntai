/*
  Warnings:

  - You are about to drop the `evaluation_periods` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `growth_expectations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `growth_profiles` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `growth_reviews` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `growth_step_histories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `hr_assessments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `hr_final_assessments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `interview_records` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `interview_sheets` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "growth_expectations" DROP CONSTRAINT "growth_expectations_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "growth_expectations" DROP CONSTRAINT "growth_expectations_period_id_fkey";

-- DropForeignKey
ALTER TABLE "growth_profiles" DROP CONSTRAINT "growth_profiles_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "growth_profiles" DROP CONSTRAINT "growth_profiles_manager_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "growth_reviews" DROP CONSTRAINT "growth_reviews_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "growth_reviews" DROP CONSTRAINT "growth_reviews_office_id_fkey";

-- DropForeignKey
ALTER TABLE "growth_reviews" DROP CONSTRAINT "growth_reviews_period_id_fkey";

-- DropForeignKey
ALTER TABLE "growth_step_histories" DROP CONSTRAINT "growth_step_histories_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "hr_assessments" DROP CONSTRAINT "hr_assessments_assessor_id_fkey";

-- DropForeignKey
ALTER TABLE "hr_assessments" DROP CONSTRAINT "hr_assessments_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "hr_assessments" DROP CONSTRAINT "hr_assessments_office_id_fkey";

-- DropForeignKey
ALTER TABLE "hr_assessments" DROP CONSTRAINT "hr_assessments_period_id_fkey";

-- DropForeignKey
ALTER TABLE "hr_final_assessments" DROP CONSTRAINT "hr_final_assessments_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "hr_final_assessments" DROP CONSTRAINT "hr_final_assessments_office_id_fkey";

-- DropForeignKey
ALTER TABLE "hr_final_assessments" DROP CONSTRAINT "hr_final_assessments_period_id_fkey";

-- DropForeignKey
ALTER TABLE "interview_records" DROP CONSTRAINT "interview_records_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "interview_records" DROP CONSTRAINT "interview_records_interviewer_id_fkey";

-- DropForeignKey
ALTER TABLE "interview_records" DROP CONSTRAINT "interview_records_office_id_fkey";

-- DropForeignKey
ALTER TABLE "interview_records" DROP CONSTRAINT "interview_records_period_id_fkey";

-- DropForeignKey
ALTER TABLE "interview_sheets" DROP CONSTRAINT "interview_sheets_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "interview_sheets" DROP CONSTRAINT "interview_sheets_office_id_fkey";

-- DropForeignKey
ALTER TABLE "interview_sheets" DROP CONSTRAINT "interview_sheets_period_id_fkey";

-- DropTable
DROP TABLE "evaluation_periods";

-- DropTable
DROP TABLE "growth_expectations";

-- DropTable
DROP TABLE "growth_profiles";

-- DropTable
DROP TABLE "growth_reviews";

-- DropTable
DROP TABLE "growth_step_histories";

-- DropTable
DROP TABLE "hr_assessments";

-- DropTable
DROP TABLE "hr_final_assessments";

-- DropTable
DROP TABLE "interview_records";

-- DropTable
DROP TABLE "interview_sheets";

-- DropEnum
DROP TYPE "eval_rank";

-- DropEnum
DROP TYPE "growth_decision_status";

-- DropEnum
DROP TYPE "growth_step";

-- DropEnum
DROP TYPE "hr_assessment_status";

-- DropEnum
DROP TYPE "interview_record_status";

-- CreateTable
CREATE TABLE "yui_staff_profiles" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "yui_staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yui_records" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "staff_id" TEXT,
    "period" TEXT,
    "office_id" UUID,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "yui_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "yui_records_kind_staff_id_idx" ON "yui_records"("kind", "staff_id");

-- 最初の評価期間 (いまの期間)。以降は社長が「設定 → 評価期間」で追加・切り替える
INSERT INTO "yui_records" ("id", "kind", "data", "updated_at")
VALUES (
  'period-2026-h2',
  'period',
  '{"id":"period-2026-h2","label":"2026年 下期","startDate":"2026-10-01","endDate":"2027-03-31","active":true}'::jsonb,
  CURRENT_TIMESTAMP
);
