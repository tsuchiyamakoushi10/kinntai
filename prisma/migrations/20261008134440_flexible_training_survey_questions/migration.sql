-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "training_survey_question_kind" ADD VALUE 'section';
ALTER TYPE "training_survey_question_kind" ADD VALUE 'short_text';
ALTER TYPE "training_survey_question_kind" ADD VALUE 'dropdown';
ALTER TYPE "training_survey_question_kind" ADD VALUE 'scale';
ALTER TYPE "training_survey_question_kind" ADD VALUE 'date';
ALTER TYPE "training_survey_question_kind" ADD VALUE 'grid';

-- AlterTable
ALTER TABLE "training_survey_questions" ADD COLUMN     "config" JSONB,
ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "training_survey_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_survey_templates_pkey" PRIMARY KEY ("id")
);

-- 本番 (Supabase) は public の全テーブルで RLS を有効にしている。アプリは所有者ロールで接続するため影響なし。
ALTER TABLE "training_survey_templates" ENABLE ROW LEVEL SECURITY;
