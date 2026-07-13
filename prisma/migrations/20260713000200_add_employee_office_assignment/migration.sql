-- 従業員の事業所配属/兼務 (応援) を表す employee_office_assignment を追加する。
-- role=primary は Employee.office_id と同一 (既存従業員からバックフィル)、role=support が応援。
-- 追加のみで非破壊。既存の勤務表・自動作成は Employee.office_id ベースのまま動く。

-- CreateEnum
CREATE TYPE "office_assignment_role" AS ENUM ('primary', 'support');

-- CreateTable
CREATE TABLE "employee_office_assignment" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "role" "office_assignment_role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_office_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_office_assignment_office_id_role_idx" ON "employee_office_assignment"("office_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "employee_office_assignment_employee_id_office_id_key" ON "employee_office_assignment"("employee_id", "office_id");

-- AddForeignKey
ALTER TABLE "employee_office_assignment" ADD CONSTRAINT "employee_office_assignment_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_office_assignment" ADD CONSTRAINT "employee_office_assignment_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: 既存の在籍データから primary 行を作る (office_id を持つ従業員のみ)。
INSERT INTO "employee_office_assignment" ("id", "employee_id", "office_id", "role", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", "office_id", 'primary', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "employees"
WHERE "office_id" IS NOT NULL
ON CONFLICT ("employee_id", "office_id") DO NOTHING;
