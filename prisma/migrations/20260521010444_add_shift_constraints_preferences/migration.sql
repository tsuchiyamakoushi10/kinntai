-- CreateEnum
CREATE TYPE "shift_preference_type" AS ENUM ('requested_off', 'preferred_night', 'unavailable');

-- CreateEnum
CREATE TYPE "shift_preference_status" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateTable
CREATE TABLE "shift_constraints" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "max_monthly_work_minutes" INTEGER,
    "max_daily_work_minutes" INTEGER,
    "max_night_shifts_per_month" INTEGER,
    "allow_night_shift_override" BOOLEAN NOT NULL DEFAULT true,
    "target_monthly_work_days" INTEGER,
    "annual_income_cap_yen" INTEGER,
    "unavailable_days_of_week" INTEGER[],
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shift_constraints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_preferences" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "target_date" DATE NOT NULL,
    "preference_type" "shift_preference_type" NOT NULL,
    "status" "shift_preference_status" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "created_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shift_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shift_constraints_employee_id_key" ON "shift_constraints"("employee_id");

-- CreateIndex
CREATE INDEX "shift_preferences_target_date_idx" ON "shift_preferences"("target_date");

-- CreateIndex
CREATE UNIQUE INDEX "shift_preferences_employee_id_target_date_preference_type_key" ON "shift_preferences"("employee_id", "target_date", "preference_type");

-- AddForeignKey
ALTER TABLE "shift_constraints" ADD CONSTRAINT "shift_constraints_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_preferences" ADD CONSTRAINT "shift_preferences_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_preferences" ADD CONSTRAINT "shift_preferences_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_preferences" ADD CONSTRAINT "shift_preferences_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
