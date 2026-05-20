-- CreateTable
CREATE TABLE "employment_contracts" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "contract_start_on" DATE NOT NULL,
    "contract_end_on" DATE,
    "employment_type" "employment_type" NOT NULL,
    "working_hours_per_day" DECIMAL(4,2) NOT NULL,
    "working_days_per_week" DECIMAL(3,1) NOT NULL,
    "wage_type" "wage_type" NOT NULL,
    "wage_amount" INTEGER NOT NULL,
    "is_renewable" BOOLEAN NOT NULL,
    "renewal_count" INTEGER NOT NULL DEFAULT 0,
    "has_renewal_limit" BOOLEAN NOT NULL DEFAULT false,
    "renewal_limit_count" INTEGER,
    "renewal_criteria" TEXT,
    "has_employment_insurance" BOOLEAN NOT NULL,
    "has_social_insurance" BOOLEAN NOT NULL,
    "retirement_allowance_eligible" BOOLEAN,
    "career_subsidy_target" BOOLEAN NOT NULL DEFAULT false,
    "career_subsidy_notes" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employment_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employment_contracts_employee_id_contract_start_on_idx" ON "employment_contracts"("employee_id", "contract_start_on" DESC);

-- AddForeignKey
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
