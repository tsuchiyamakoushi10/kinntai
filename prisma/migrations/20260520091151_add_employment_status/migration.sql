-- CreateEnum
CREATE TYPE "employment_status" AS ENUM ('active', 'on_leave', 'retired');

-- DropIndex
DROP INDEX "employees_office_id_retired_at_idx";

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "employment_status" "employment_status" NOT NULL DEFAULT 'active',
ADD COLUMN     "retirement_reason" TEXT;

-- Backfill: 既存の retired_at != NULL は retired に置換。
-- これにより一覧 / 退職者リストで在籍状況の判定が常に employment_status だけで完結する。
UPDATE "employees" SET "employment_status" = 'retired' WHERE "retired_at" IS NOT NULL;

-- CreateIndex
CREATE INDEX "employees_office_id_employment_status_idx" ON "employees"("office_id", "employment_status");
