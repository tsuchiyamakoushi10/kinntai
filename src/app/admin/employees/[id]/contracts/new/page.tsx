import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { toDateInputValue } from "@/lib/format";

import {
  createEmploymentContract,
  type EmploymentContractFormState,
  type EmploymentContractFormValues,
} from "../actions";
import { ContractForm } from "../contract-form";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function NewContractPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      employmentType: true,
      weeklyWorkDays: true,
      dailyWorkHours: true,
      baseWageType: true,
      baseWageAmount: true,
      hiredAt: true,
    },
  });
  if (!employee) notFound();

  // 直近の契約を初期値に流用する。なければ employees 側のスナップショットを使う。
  const latestContract = await prisma.employmentContract.findFirst({
    where: { employeeId: id },
    orderBy: { contractStartOn: "desc" },
  });

  const initial: EmploymentContractFormValues = {
    contractStartOn: latestContract?.contractEndOn
      ? toDateInputValue(addDays(latestContract.contractEndOn, 1))
      : toDateInputValue(employee.hiredAt),
    contractEndOn: "",
    employmentType: latestContract?.employmentType ?? employee.employmentType ?? "",
    workingHoursPerDay: (() => {
      const v = latestContract?.workingHoursPerDay ?? employee.dailyWorkHours;
      return v !== null && v !== undefined ? String(Number(v)) : "";
    })(),
    workingDaysPerWeek: (() => {
      const v = latestContract?.workingDaysPerWeek ?? employee.weeklyWorkDays;
      return v !== null && v !== undefined ? String(Number(v)) : "";
    })(),
    wageType: latestContract?.wageType ?? employee.baseWageType ?? "",
    wageAmount: (() => {
      const v = latestContract?.wageAmount ?? employee.baseWageAmount;
      return v !== null && v !== undefined ? String(v) : "";
    })(),
    isRenewable: latestContract?.isRenewable ? "on" : "",
    renewalCount: latestContract ? String((latestContract.renewalCount ?? 0) + 1) : "0",
    hasRenewalLimit: latestContract?.hasRenewalLimit ? "on" : "",
    renewalLimitCount: latestContract?.renewalLimitCount?.toString() ?? "",
    renewalCriteria: latestContract?.renewalCriteria ?? "",
    hasEmploymentInsurance: latestContract?.hasEmploymentInsurance ? "on" : "on",
    hasSocialInsurance: latestContract?.hasSocialInsurance ? "on" : "",
    retirementAllowanceEligible:
      latestContract?.retirementAllowanceEligible === null ||
      latestContract?.retirementAllowanceEligible === undefined
        ? "auto"
        : latestContract.retirementAllowanceEligible
          ? "true"
          : "false",
    careerSubsidyTarget: latestContract?.careerSubsidyTarget ? "on" : "",
    careerSubsidyNotes: latestContract?.careerSubsidyNotes ?? "",
    notes: "",
    // 1-I: 拡張カラム (直近契約からコピー、なければ既定値)
    workplaceInitial: latestContract?.workplaceInitial ?? "",
    workplaceScope:
      latestContract?.workplaceScope ?? "会社が運営する全事業所その他業務に関連する場所",
    jobDescriptionInitial: latestContract?.jobDescriptionInitial ?? "",
    jobDescriptionScope: latestContract?.jobDescriptionScope ?? "変更なし",
    weeklyHoursCategory: latestContract?.weeklyHoursCategory ?? "",
    shiftBasedSchedule: latestContract?.shiftBasedSchedule === false ? "" : "on",
    hasEarlyEndPossibility: latestContract?.hasEarlyEndPossibility === false ? "" : "on",
    hasOvertime: latestContract?.hasOvertime ? "on" : "",
    hasBonus: latestContract?.hasBonus ? "on" : "",
    bonusDescription: latestContract?.bonusDescription ?? "",
    retirementAllowanceStartText: latestContract?.retirementAllowanceStartText ?? "",
    specialMeasureType: latestContract?.specialMeasureType ?? "NONE",
    specialMeasureBusinessTitle: latestContract?.specialMeasureBusinessTitle ?? "",
    specialMeasureStartOn: "",
    specialMeasureEndOn: "",
    allowancesJson: "[]",
  };

  const action = (
    state: EmploymentContractFormState,
    formData: FormData,
  ): Promise<EmploymentContractFormState> => createEmploymentContract(id, state, formData);

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
        <span className="text-slate-700">雇用契約 新規</span>
      </nav>
      <h1 className="text-2xl font-bold text-slate-900">{fullName} の新規雇用契約</h1>
      <p className="-mt-2 text-sm text-slate-500">
        直近契約の内容を初期値として流用しています。更新時は契約開始日と更新回数を確認してください。
      </p>
      <ContractForm
        action={action}
        initial={initial}
        employeeId={id}
        submitLabel="契約を登録する"
      />
    </div>
  );
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
