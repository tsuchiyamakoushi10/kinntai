-- CreateEnum
CREATE TYPE "day_kind" AS ENUM ('weekday', 'saturday', 'sunday_holiday');

-- CreateEnum
CREATE TYPE "generation_run_status" AS ENUM ('draft', 'confirmed');

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "generation_run_id" UUID;

-- CreateTable
CREATE TABLE "office_shift_quotas" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "shift_pattern_id" UUID NOT NULL,
    "day_kind" "day_kind" NOT NULL,
    "required_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "office_shift_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_generation_runs" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "target_month" DATE NOT NULL,
    "status" "generation_run_status" NOT NULL DEFAULT 'draft',
    "algorithm_version" TEXT NOT NULL,
    "generated_by" UUID NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(6),
    "stats" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shift_generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "office_shift_quotas_office_id_shift_pattern_id_day_kind_key" ON "office_shift_quotas"("office_id", "shift_pattern_id", "day_kind");

-- CreateIndex
CREATE UNIQUE INDEX "shift_generation_runs_office_id_target_month_key" ON "shift_generation_runs"("office_id", "target_month");

-- CreateIndex
CREATE INDEX "shifts_generation_run_id_idx" ON "shifts"("generation_run_id");

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_generation_run_id_fkey" FOREIGN KEY ("generation_run_id") REFERENCES "shift_generation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_shift_quotas" ADD CONSTRAINT "office_shift_quotas_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_shift_quotas" ADD CONSTRAINT "office_shift_quotas_shift_pattern_id_fkey" FOREIGN KEY ("shift_pattern_id") REFERENCES "shift_patterns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_generation_runs" ADD CONSTRAINT "shift_generation_runs_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_generation_runs" ADD CONSTRAINT "shift_generation_runs_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
