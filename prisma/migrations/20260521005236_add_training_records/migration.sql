-- CreateEnum
CREATE TYPE "training_type" AS ENUM ('paid_self', 'company_paid');

-- CreateTable
CREATE TABLE "training_records" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "training_name" TEXT NOT NULL,
    "training_type" "training_type" NOT NULL,
    "cost_yen" INTEGER,
    "trained_on" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_records_employee_id_trained_on_idx" ON "training_records"("employee_id", "trained_on" DESC);

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_training_record_id_fkey" FOREIGN KEY ("training_record_id") REFERENCES "training_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
