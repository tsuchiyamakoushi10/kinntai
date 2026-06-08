-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "desired_night_shifts_per_month" INTEGER;

-- CreateTable
CREATE TABLE "office_shift_settings" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "max_consecutive_work_days" INTEGER NOT NULL DEFAULT 6,
    "default_max_night_shifts_per_month" INTEGER NOT NULL DEFAULT 5,
    "default_annual_income_cap_yen" INTEGER NOT NULL DEFAULT 1300000,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "office_shift_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "office_shift_settings_office_id_key" ON "office_shift_settings"("office_id");

-- AddForeignKey
ALTER TABLE "office_shift_settings" ADD CONSTRAINT "office_shift_settings_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
