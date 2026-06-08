-- CreateTable
CREATE TABLE "office_coverage_demands" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "day_kind" "day_kind" NOT NULL,
    "am_required" INTEGER NOT NULL DEFAULT 0,
    "pm_required" INTEGER NOT NULL DEFAULT 0,
    "counselor_am_required" INTEGER NOT NULL DEFAULT 0,
    "counselor_pm_required" INTEGER NOT NULL DEFAULT 0,
    "night_in_required" INTEGER NOT NULL DEFAULT 0,
    "night_out_required" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "office_coverage_demands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "office_coverage_demands_office_id_day_kind_key" ON "office_coverage_demands"("office_id", "day_kind");

-- AddForeignKey
ALTER TABLE "office_coverage_demands" ADD CONSTRAINT "office_coverage_demands_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
