-- CreateEnum
CREATE TYPE "training_survey_status" AS ENUM ('draft', 'open', 'closed');

-- CreateEnum
CREATE TYPE "training_survey_question_kind" AS ENUM ('rating_5', 'single_choice', 'multi_choice', 'text');

-- CreateTable
CREATE TABLE "training_surveys" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "trained_on" DATE NOT NULL,
    "training_type" "training_type" NOT NULL DEFAULT 'company_paid',
    "answer_until" DATE,
    "status" "training_survey_status" NOT NULL DEFAULT 'draft',
    "office_id" UUID,
    "opened_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_survey_questions" (
    "id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "kind" "training_survey_question_kind" NOT NULL,
    "label" TEXT NOT NULL,
    "options" TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "training_survey_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_survey_targets" (
    "survey_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_survey_targets_pkey" PRIMARY KEY ("survey_id","employee_id")
);

-- CreateTable
CREATE TABLE "training_survey_responses" (
    "id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "training_record_id" UUID,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_surveys_status_trained_on_idx" ON "training_surveys"("status", "trained_on" DESC);

-- CreateIndex
CREATE INDEX "training_survey_questions_survey_id_sort_order_idx" ON "training_survey_questions"("survey_id", "sort_order");

-- CreateIndex
CREATE INDEX "training_survey_targets_employee_id_idx" ON "training_survey_targets"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_survey_responses_survey_id_employee_id_key" ON "training_survey_responses"("survey_id", "employee_id");

-- AddForeignKey
ALTER TABLE "training_surveys" ADD CONSTRAINT "training_surveys_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_surveys" ADD CONSTRAINT "training_surveys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_survey_questions" ADD CONSTRAINT "training_survey_questions_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "training_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_survey_targets" ADD CONSTRAINT "training_survey_targets_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "training_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_survey_targets" ADD CONSTRAINT "training_survey_targets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_survey_responses" ADD CONSTRAINT "training_survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "training_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_survey_responses" ADD CONSTRAINT "training_survey_responses_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_survey_responses" ADD CONSTRAINT "training_survey_responses_training_record_id_fkey" FOREIGN KEY ("training_record_id") REFERENCES "training_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 本番 (Supabase) は public の全テーブルで RLS を有効にしている。アプリは所有者ロールで接続するため影響なし。
ALTER TABLE "training_surveys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_survey_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_survey_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_survey_responses" ENABLE ROW LEVEL SECURITY;
