import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { toDateInputValue } from "@/lib/format";

import {
  type EmploymentContractFormState,
  type EmploymentContractFormValues,
  updateEmploymentContract,
} from "../../actions";
import { ContractForm } from "../../contract-form";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; contractId: string }>;
};

export default async function EditContractPage({ params }: Props) {
  await requireAdmin();
  const { id, contractId } = await params;

  const [employee, contract] = await Promise.all([
    prisma.employee.findUnique({
      where: { id },
      select: { id: true, lastName: true, firstName: true },
    }),
    prisma.employmentContract.findUnique({ where: { id: contractId } }),
  ]);

  if (!employee || !contract || contract.employeeId !== id) {
    notFound();
  }

  const initial: EmploymentContractFormValues = {
    contractStartOn: toDateInputValue(contract.contractStartOn),
    contractEndOn: toDateInputValue(contract.contractEndOn),
    employmentType: contract.employmentType,
    workingHoursPerDay: String(Number(contract.workingHoursPerDay)),
    workingDaysPerWeek: String(Number(contract.workingDaysPerWeek)),
    wageType: contract.wageType,
    wageAmount: String(contract.wageAmount),
    isRenewable: contract.isRenewable ? "on" : "",
    renewalCount: String(contract.renewalCount),
    hasRenewalLimit: contract.hasRenewalLimit ? "on" : "",
    renewalLimitCount: contract.renewalLimitCount?.toString() ?? "",
    renewalCriteria: contract.renewalCriteria ?? "",
    hasEmploymentInsurance: contract.hasEmploymentInsurance ? "on" : "",
    hasSocialInsurance: contract.hasSocialInsurance ? "on" : "",
    retirementAllowanceEligible:
      contract.retirementAllowanceEligible === null
        ? "auto"
        : contract.retirementAllowanceEligible
          ? "true"
          : "false",
    careerSubsidyTarget: contract.careerSubsidyTarget ? "on" : "",
    careerSubsidyNotes: contract.careerSubsidyNotes ?? "",
    notes: contract.notes ?? "",
  };

  const action = (
    state: EmploymentContractFormState,
    formData: FormData,
  ): Promise<EmploymentContractFormState> =>
    updateEmploymentContract(id, contractId, state, formData);

  const fullName = `${employee.lastName} ${employee.firstName}`;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/employees" className="hover:underline">
          従業員
        </Link>
        <span className="mx-1">/</span>
        <Link href={`/admin/employees/${id}`} className="hover:underline">
          {fullName}
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">雇用契約 編集</span>
      </nav>
      <h1 className="text-2xl font-bold text-slate-900">{fullName} の雇用契約を編集</h1>
      <ContractForm action={action} initial={initial} employeeId={id} submitLabel="保存する" />
    </div>
  );
}
