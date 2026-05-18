-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('admin', 'employee');

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "job_category" AS ENUM ('care_worker', 'nurse', 'life_counselor', 'care_manager', 'office_staff', 'other');

-- CreateEnum
CREATE TYPE "employment_type" AS ENUM ('full_time', 'contract', 'part_time');

-- CreateEnum
CREATE TYPE "wage_type" AS ENUM ('hourly', 'monthly');

-- CreateEnum
CREATE TYPE "qualification_type" AS ENUM ('care_worker', 'initial_training', 'practical_training', 'chief_care_worker', 'nurse', 'other');

-- CreateEnum
CREATE TYPE "shift_kind" AS ENUM ('work', 'night', 'after_night', 'off', 'paid_leave', 'absence', 'requested_off');

-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('open', 'submitted', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "leave_grant_type" AS ENUM ('statutory', 'manual_adjustment', 'carry_over');

-- CreateTable
CREATE TABLE "offices" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "employee_id" UUID,
    "pin_code_hash" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "employee_code" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name_kana" TEXT NOT NULL,
    "first_name_kana" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "gender" "gender",
    "phone" TEXT,
    "address" TEXT,
    "office_id" UUID NOT NULL,
    "job_category" "job_category" NOT NULL,
    "employment_type" "employment_type" NOT NULL,
    "joined_at" DATE NOT NULL,
    "hired_at" DATE NOT NULL,
    "retired_at" DATE,
    "emergency_contact_name" TEXT,
    "emergency_contact_relation" TEXT,
    "emergency_contact_phone" TEXT,
    "weekly_work_days" DECIMAL(3,1) NOT NULL,
    "daily_work_hours" DECIMAL(4,2) NOT NULL,
    "base_wage_type" "wage_type" NOT NULL,
    "base_wage_amount" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualifications" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "qualification_type" "qualification_type" NOT NULL,
    "acquired_on" DATE NOT NULL,
    "certificate_number" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_patterns" (
    "id" UUID NOT NULL,
    "office_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shift_kind" "shift_kind" NOT NULL,
    "start_time" TIME(0),
    "end_time" TIME(0),
    "crosses_midnight" BOOLEAN NOT NULL DEFAULT false,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#888888',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shift_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "shift_pattern_id" UUID NOT NULL,
    "note" TEXT,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "clock_in_at" TIMESTAMPTZ(6),
    "clock_out_at" TIMESTAMPTZ(6),
    "shift_pattern_id" UUID,
    "total_work_minutes" INTEGER,
    "total_break_minutes" INTEGER,
    "overtime_minutes" INTEGER,
    "night_minutes" INTEGER,
    "status" "attendance_status" NOT NULL DEFAULT 'open',
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "break_records" (
    "id" UUID NOT NULL,
    "attendance_record_id" UUID NOT NULL,
    "break_start_at" TIMESTAMPTZ(6) NOT NULL,
    "break_end_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "break_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paid_leave_grants" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "granted_on" DATE NOT NULL,
    "granted_days" DECIMAL(4,1) NOT NULL,
    "expires_on" DATE NOT NULL,
    "grant_type" "leave_grant_type" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "paid_leave_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paid_leave_consumptions" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "consumed_on" DATE NOT NULL,
    "consumed_days" DECIMAL(3,1) NOT NULL,
    "source_grant_id" UUID,
    "shift_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "paid_leave_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offices_code_key" ON "offices"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- CreateIndex
CREATE INDEX "employees_office_id_retired_at_idx" ON "employees"("office_id", "retired_at");

-- CreateIndex
CREATE INDEX "qualifications_employee_id_idx" ON "qualifications"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "shift_patterns_code_key" ON "shift_patterns"("code");

-- CreateIndex
CREATE INDEX "shifts_office_id_work_date_idx" ON "shifts"("office_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_employee_id_work_date_key" ON "shifts"("employee_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_employee_id_work_date_key" ON "attendance_records"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "break_records_attendance_record_id_idx" ON "break_records"("attendance_record_id");

-- CreateIndex
CREATE INDEX "paid_leave_grants_employee_id_granted_on_idx" ON "paid_leave_grants"("employee_id", "granted_on");

-- CreateIndex
CREATE INDEX "paid_leave_consumptions_employee_id_consumed_on_idx" ON "paid_leave_consumptions"("employee_id", "consumed_on");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_patterns" ADD CONSTRAINT "shift_patterns_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_shift_pattern_id_fkey" FOREIGN KEY ("shift_pattern_id") REFERENCES "shift_patterns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_shift_pattern_id_fkey" FOREIGN KEY ("shift_pattern_id") REFERENCES "shift_patterns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_records" ADD CONSTRAINT "break_records_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paid_leave_grants" ADD CONSTRAINT "paid_leave_grants_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paid_leave_consumptions" ADD CONSTRAINT "paid_leave_consumptions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paid_leave_consumptions" ADD CONSTRAINT "paid_leave_consumptions_source_grant_id_fkey" FOREIGN KEY ("source_grant_id") REFERENCES "paid_leave_grants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paid_leave_consumptions" ADD CONSTRAINT "paid_leave_consumptions_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
