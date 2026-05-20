"use server";

import { EmploymentType, WageType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { parseDateInputValue } from "@/lib/format";

export type EmploymentContractFormValues = {
  contractStartOn: string;
  contractEndOn: string;
  employmentType: string;
  workingHoursPerDay: string;
  workingDaysPerWeek: string;
  wageType: string;
  wageAmount: string;
  isRenewable: string;
  renewalCount: string;
  hasRenewalLimit: string;
  renewalLimitCount: string;
  renewalCriteria: string;
  hasEmploymentInsurance: string;
  hasSocialInsurance: string;
  // "auto" / "true" / "false" (auto = NULL 保存)
  retirementAllowanceEligible: string;
  careerSubsidyTarget: string;
  careerSubsidyNotes: string;
  notes: string;
};

export type EmploymentContractFormState = {
  error?: string;
  values?: EmploymentContractFormValues;
};

type Parsed = {
  contractStartOn: Date;
  contractEndOn: Date | null;
  employmentType: EmploymentType;
  workingHoursPerDay: number;
  workingDaysPerWeek: number;
  wageType: WageType;
  wageAmount: number;
  isRenewable: boolean;
  renewalCount: number;
  hasRenewalLimit: boolean;
  renewalLimitCount: number | null;
  renewalCriteria: string;
  hasEmploymentInsurance: boolean;
  hasSocialInsurance: boolean;
  retirementAllowanceEligible: boolean | null;
  careerSubsidyTarget: boolean;
  careerSubsidyNotes: string;
  notes: string;
};

function readForm(formData: FormData): EmploymentContractFormValues {
  return {
    contractStartOn: String(formData.get("contractStartOn") ?? "").trim(),
    contractEndOn: String(formData.get("contractEndOn") ?? "").trim(),
    employmentType: String(formData.get("employmentType") ?? ""),
    workingHoursPerDay: String(formData.get("workingHoursPerDay") ?? "").trim(),
    workingDaysPerWeek: String(formData.get("workingDaysPerWeek") ?? "").trim(),
    wageType: String(formData.get("wageType") ?? ""),
    wageAmount: String(formData.get("wageAmount") ?? "").trim(),
    isRenewable: formData.get("isRenewable") ? "on" : "",
    renewalCount: String(formData.get("renewalCount") ?? "").trim(),
    hasRenewalLimit: formData.get("hasRenewalLimit") ? "on" : "",
    renewalLimitCount: String(formData.get("renewalLimitCount") ?? "").trim(),
    renewalCriteria: String(formData.get("renewalCriteria") ?? "").trim(),
    hasEmploymentInsurance: formData.get("hasEmploymentInsurance") ? "on" : "",
    hasSocialInsurance: formData.get("hasSocialInsurance") ? "on" : "",
    retirementAllowanceEligible: String(formData.get("retirementAllowanceEligible") ?? "auto"),
    careerSubsidyTarget: formData.get("careerSubsidyTarget") ? "on" : "",
    careerSubsidyNotes: String(formData.get("careerSubsidyNotes") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

function parseAndValidate(
  values: EmploymentContractFormValues,
): { ok: true; data: Parsed } | { ok: false; error: string } {
  const contractStartOn = parseDateInputValue(values.contractStartOn);
  if (!contractStartOn) {
    return { ok: false, error: "契約開始日を正しく入力してください。" };
  }

  let contractEndOn: Date | null = null;
  if (values.contractEndOn) {
    contractEndOn = parseDateInputValue(values.contractEndOn);
    if (!contractEndOn) {
      return { ok: false, error: "契約終了日を正しく入力してください。" };
    }
    if (contractEndOn.getTime() < contractStartOn.getTime()) {
      return { ok: false, error: "契約終了日は契約開始日以降にしてください。" };
    }
  }

  if (!(values.employmentType in EmploymentType)) {
    return { ok: false, error: "雇用形態を選択してください。" };
  }

  const workingHoursPerDay = Number(values.workingHoursPerDay);
  if (!Number.isFinite(workingHoursPerDay) || workingHoursPerDay < 0.5 || workingHoursPerDay > 12) {
    return { ok: false, error: "1 日の所定労働時間は 0.5〜12.0 の範囲で入力してください。" };
  }

  const workingDaysPerWeek = Number(values.workingDaysPerWeek);
  if (!Number.isFinite(workingDaysPerWeek) || workingDaysPerWeek < 0.5 || workingDaysPerWeek > 7) {
    return { ok: false, error: "週所定労働日数は 0.5〜7.0 の範囲で入力してください。" };
  }

  if (!(values.wageType in WageType)) {
    return { ok: false, error: "賃金形態（時給 / 月給）を選択してください。" };
  }

  const wageAmount = Number(values.wageAmount);
  if (!Number.isInteger(wageAmount) || wageAmount <= 0) {
    return { ok: false, error: "賃金額は 1 円以上の整数で入力してください。" };
  }

  const isRenewable = values.isRenewable === "on";
  const renewalCount = values.renewalCount ? Number(values.renewalCount) : 0;
  if (!Number.isInteger(renewalCount) || renewalCount < 0 || renewalCount > 999) {
    return { ok: false, error: "更新回数は 0〜999 の整数で入力してください。" };
  }

  const hasRenewalLimit = values.hasRenewalLimit === "on";
  let renewalLimitCount: number | null = null;
  if (hasRenewalLimit) {
    const n = Number(values.renewalLimitCount);
    if (!Number.isInteger(n) || n < 1 || n > 999) {
      return { ok: false, error: "更新上限回数は 1〜999 の整数で入力してください。" };
    }
    renewalLimitCount = n;
  }

  let retirementAllowanceEligible: boolean | null;
  switch (values.retirementAllowanceEligible) {
    case "auto":
      retirementAllowanceEligible = null;
      break;
    case "true":
      retirementAllowanceEligible = true;
      break;
    case "false":
      retirementAllowanceEligible = false;
      break;
    default:
      return { ok: false, error: "退職金対象の判定区分が不正です。" };
  }

  if (values.renewalCriteria.length > 500) {
    return { ok: false, error: "更新判断基準は 500 文字以内で入力してください。" };
  }
  if (values.careerSubsidyNotes.length > 500) {
    return { ok: false, error: "助成金メモは 500 文字以内で入力してください。" };
  }
  if (values.notes.length > 500) {
    return { ok: false, error: "備考は 500 文字以内で入力してください。" };
  }

  return {
    ok: true,
    data: {
      contractStartOn,
      contractEndOn,
      employmentType: values.employmentType as EmploymentType,
      workingHoursPerDay,
      workingDaysPerWeek,
      wageType: values.wageType as WageType,
      wageAmount,
      isRenewable,
      renewalCount,
      hasRenewalLimit,
      renewalLimitCount,
      renewalCriteria: values.renewalCriteria,
      hasEmploymentInsurance: values.hasEmploymentInsurance === "on",
      hasSocialInsurance: values.hasSocialInsurance === "on",
      retirementAllowanceEligible,
      careerSubsidyTarget: values.careerSubsidyTarget === "on",
      careerSubsidyNotes: values.careerSubsidyNotes,
      notes: values.notes,
    },
  };
}

export async function createEmploymentContract(
  employeeId: string,
  _prev: EmploymentContractFormState,
  formData: FormData,
): Promise<EmploymentContractFormState> {
  await requireAdmin();
  const values = readForm(formData);

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) return { error: "対象の従業員が見つかりませんでした。", values };

  const parsed = parseAndValidate(values);
  if (!parsed.ok) return { error: parsed.error, values };

  await prisma.employmentContract.create({
    data: {
      employeeId,
      ...parsed.data,
    },
  });

  revalidatePath(`/admin/employees/${employeeId}`);
  redirect(`/admin/employees/${employeeId}?tab=contracts`);
}

export async function updateEmploymentContract(
  employeeId: string,
  contractId: string,
  _prev: EmploymentContractFormState,
  formData: FormData,
): Promise<EmploymentContractFormState> {
  await requireAdmin();
  const values = readForm(formData);

  const existing = await prisma.employmentContract.findUnique({
    where: { id: contractId },
    select: { id: true, employeeId: true },
  });
  if (!existing || existing.employeeId !== employeeId) {
    return { error: "対象の契約が見つかりませんでした。", values };
  }

  const parsed = parseAndValidate(values);
  if (!parsed.ok) return { error: parsed.error, values };

  await prisma.employmentContract.update({
    where: { id: contractId },
    data: parsed.data,
  });

  revalidatePath(`/admin/employees/${employeeId}`);
  redirect(`/admin/employees/${employeeId}?tab=contracts`);
}

export async function deleteEmploymentContract(
  employeeId: string,
  contractId: string,
): Promise<void> {
  await requireAdmin();
  const existing = await prisma.employmentContract.findUnique({
    where: { id: contractId },
    select: { id: true, employeeId: true },
  });
  if (!existing || existing.employeeId !== employeeId) {
    redirect(`/admin/employees/${employeeId}?tab=contracts`);
  }

  await prisma.employmentContract.delete({ where: { id: contractId } });
  revalidatePath(`/admin/employees/${employeeId}`);
  redirect(`/admin/employees/${employeeId}?tab=contracts`);
}
