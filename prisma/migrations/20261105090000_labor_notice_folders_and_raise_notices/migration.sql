-- AlterTable
ALTER TABLE "labor_notices" ADD COLUMN     "archived_at" TIMESTAMPTZ(6),
ADD COLUMN     "hidden_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "raise_notices" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "contract_id" UUID,
    "issued_on" DATE NOT NULL,
    "effective_on" DATE NOT NULL,
    "snapshot" JSONB NOT NULL,
    "signed_at" TIMESTAMPTZ(6),
    "signed_document_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "raise_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "raise_notices_employee_id_issued_on_idx" ON "raise_notices"("employee_id", "issued_on" DESC);

-- AddForeignKey
ALTER TABLE "raise_notices" ADD CONSTRAINT "raise_notices_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raise_notices" ADD CONSTRAINT "raise_notices_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raise_notices" ADD CONSTRAINT "raise_notices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "employment_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raise_notices" ADD CONSTRAINT "raise_notices_signed_document_id_fkey" FOREIGN KEY ("signed_document_id") REFERENCES "employee_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raise_notices" ADD CONSTRAINT "raise_notices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 署名済みの通知書は「完了」フォルダへ移しておく (一覧の「作業中」に溜まらないように)
UPDATE "labor_notices" SET "archived_at" = COALESCE("signed_at", "updated_at") WHERE "status" = 'signed';

-- 本番 (Supabase) は public の全テーブルで RLS を有効にする (アプリは所有者ロールで接続)
ALTER TABLE "raise_notices" ENABLE ROW LEVEL SECURITY;
