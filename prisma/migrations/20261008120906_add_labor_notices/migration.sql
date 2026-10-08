-- CreateEnum
CREATE TYPE "labor_notice_type" AS ENUM ('full_time', 'part_time', 'night_only');

-- CreateEnum
CREATE TYPE "labor_notice_status" AS ENUM ('draft', 'issued', 'signed', 'void');

-- AlterEnum
ALTER TYPE "wage_type" ADD VALUE 'daily';

-- AlterTable
ALTER TABLE "company_profile" ADD COLUMN     "employee_count" INTEGER,
ADD COLUMN     "fulltime_monthly_days" DECIMAL(4,1) NOT NULL DEFAULT 21,
ADD COLUMN     "fulltime_weekly_hours" DECIMAL(4,1) NOT NULL DEFAULT 37,
ADD COLUMN     "has_second_type_certification" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "job_posting_indefinite_types" "labor_notice_type"[] DEFAULT ARRAY[]::"labor_notice_type"[],
ADD COLUMN     "notice_number_prefix" TEXT NOT NULL DEFAULT 'CH',
ADD COLUMN     "rehire_continue_after_65" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "variable_hours_agreement_covers_night" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "offices" ADD COLUMN     "manager_name" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "prefecture" TEXT NOT NULL DEFAULT '埼玉県';

-- CreateTable
CREATE TABLE "labor_notices" (
    "id" UUID NOT NULL,
    "notice_no" TEXT,
    "employee_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "contract_id" UUID,
    "notice_type" "labor_notice_type" NOT NULL,
    "status" "labor_notice_status" NOT NULL DEFAULT 'draft',
    "input" JSONB NOT NULL,
    "snapshot" JSONB,
    "acknowledgements" JSONB NOT NULL DEFAULT '[]',
    "template_version" TEXT NOT NULL,
    "contract_start_on" DATE NOT NULL,
    "contract_end_on" DATE,
    "issued_at" TIMESTAMPTZ(6),
    "signed_at" TIMESTAMPTZ(6),
    "voided_at" TIMESTAMPTZ(6),
    "signed_document_id" UUID,
    "created_by" UUID NOT NULL,
    "issued_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "labor_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "labor_notices_notice_no_key" ON "labor_notices"("notice_no");

-- CreateIndex
CREATE INDEX "labor_notices_employee_id_contract_start_on_idx" ON "labor_notices"("employee_id", "contract_start_on" DESC);

-- CreateIndex
CREATE INDEX "labor_notices_status_contract_end_on_idx" ON "labor_notices"("status", "contract_end_on");

-- AddForeignKey
ALTER TABLE "labor_notices" ADD CONSTRAINT "labor_notices_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labor_notices" ADD CONSTRAINT "labor_notices_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labor_notices" ADD CONSTRAINT "labor_notices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "employment_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labor_notices" ADD CONSTRAINT "labor_notices_signed_document_id_fkey" FOREIGN KEY ("signed_document_id") REFERENCES "employee_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labor_notices" ADD CONSTRAINT "labor_notices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labor_notices" ADD CONSTRAINT "labor_notices_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 本番 (Supabase) は public の全テーブルで RLS を有効にしている (2026-09 移行時に手動適用)。
-- 新テーブルも PostgREST 経由で読めないよう揃える。アプリは所有者ロールで接続するため影響なし。
ALTER TABLE "labor_notices" ENABLE ROW LEVEL SECURITY;
