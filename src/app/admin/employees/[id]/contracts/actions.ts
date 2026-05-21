"use server";

import { EmploymentType, SpecialMeasureType, WageType, WeeklyHoursCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { parseDateInputValue } from "@/lib/format";

export type AllowanceInput = {
  name: string;
  amountYen: number;
  calculationMethod: string;
};

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
  // ---- 1-I で追加 (労働条件通知書出力用) ----
  workplaceInitial: string;
  workplaceScope: string;
  jobDescriptionInitial: string;
  jobDescriptionScope: string;
  weeklyHoursCategory: string; // "" / WeeklyHoursCategory 値
  shiftBasedSchedule: string; // "on" / ""
  hasEarlyEndPossibility: string;
  hasOvertime: string;
  hasBonus: string;
  bonusDescription: string;
  retirementAllowanceStartText: string;
  specialMeasureType: string; // SpecialMeasureType 値 (既定 "NONE")
  specialMeasureBusinessTitle: string;
  specialMeasureStartOn: string;
  specialMeasureEndOn: string;
  /** JSON 文字列で諸手当配列を運ぶ (動的行のため formData では扱いにくい) */
  allowancesJson: string;
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
  // 1-I 追加
  workplaceInitial: string | null;
  workplaceScope: string | null;
  jobDescriptionInitial: string | null;
  jobDescriptionScope: string | null;
  weeklyHoursCategory: WeeklyHoursCategory | null;
  shiftBasedSchedule: boolean;
  hasEarlyEndPossibility: boolean;
  hasOvertime: boolean;
  hasBonus: boolean;
  bonusDescription: string | null;
  retirementAllowanceStartText: string | null;
  specialMeasureType: SpecialMeasureType;
  specialMeasureBusinessTitle: string | null;
  specialMeasureStartOn: Date | null;
  specialMeasureEndOn: Date | null;
  allowances: AllowanceInput[];
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
    workplaceInitial: String(formData.get("workplaceInitial") ?? "").trim(),
    workplaceScope: String(formData.get("workplaceScope") ?? "").trim(),
    jobDescriptionInitial: String(formData.get("jobDescriptionInitial") ?? "").trim(),
    jobDescriptionScope: String(formData.get("jobDescriptionScope") ?? "").trim(),
    weeklyHoursCategory: String(formData.get("weeklyHoursCategory") ?? ""),
    shiftBasedSchedule: formData.get("shiftBasedSchedule") ? "on" : "",
    hasEarlyEndPossibility: formData.get("hasEarlyEndPossibility") ? "on" : "",
    hasOvertime: formData.get("hasOvertime") ? "on" : "",
    hasBonus: formData.get("hasBonus") ? "on" : "",
    bonusDescription: String(formData.get("bonusDescription") ?? "").trim(),
    retirementAllowanceStartText: String(formData.get("retirementAllowanceStartText") ?? "").trim(),
    specialMeasureType: String(formData.get("specialMeasureType") ?? "NONE"),
    specialMeasureBusinessTitle: String(formData.get("specialMeasureBusinessTitle") ?? "").trim(),
    specialMeasureStartOn: String(formData.get("specialMeasureStartOn") ?? "").trim(),
    specialMeasureEndOn: String(formData.get("specialMeasureEndOn") ?? "").trim(),
    allowancesJson: String(formData.get("allowancesJson") ?? "[]"),
  };
}

function parseAllowances(
  json: string,
): { ok: true; value: AllowanceInput[] } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "諸手当のデータ形式が不正です。" };
  }
  if (!Array.isArray(raw)) return { ok: false, error: "諸手当のデータ形式が不正です。" };
  const out: AllowanceInput[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: "諸手当の各行が不正です。" };
    }
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const amountYenRaw = row.amountYen;
    const calculationMethod =
      typeof row.calculationMethod === "string" ? row.calculationMethod.trim() : "";
    // すべて空欄の行は読み飛ばす (UI で空 4 行が出る前提)
    if (
      name === "" &&
      (amountYenRaw === "" || amountYenRaw === 0 || amountYenRaw === undefined) &&
      calculationMethod === ""
    ) {
      continue;
    }
    if (name === "") return { ok: false, error: "諸手当の名称を入力してください。" };
    const amountYen = Number(amountYenRaw);
    if (!Number.isInteger(amountYen) || amountYen < 0 || amountYen > 10_000_000) {
      return { ok: false, error: "諸手当の金額は 0 以上 1000 万円以下の整数で入力してください。" };
    }
    out.push({ name, amountYen, calculationMethod });
  }
  return { ok: true, value: out };
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

  // 1-I: 拡張カラムの検証
  let weeklyHoursCategory: WeeklyHoursCategory | null = null;
  if (values.weeklyHoursCategory) {
    if (!(values.weeklyHoursCategory in WeeklyHoursCategory)) {
      return { ok: false, error: "週所定区分が不正です。" };
    }
    weeklyHoursCategory = values.weeklyHoursCategory as WeeklyHoursCategory;
  }
  const smtValue = values.specialMeasureType || "NONE";
  if (!(smtValue in SpecialMeasureType)) {
    return { ok: false, error: "有期雇用特例の区分が不正です。" };
  }
  const specialMeasureType = smtValue as SpecialMeasureType;

  let specialMeasureStartOn: Date | null = null;
  if (values.specialMeasureStartOn) {
    specialMeasureStartOn = parseDateInputValue(values.specialMeasureStartOn);
    if (!specialMeasureStartOn) {
      return { ok: false, error: "特定有期業務の開始日を正しく入力してください。" };
    }
  }
  let specialMeasureEndOn: Date | null = null;
  if (values.specialMeasureEndOn) {
    specialMeasureEndOn = parseDateInputValue(values.specialMeasureEndOn);
    if (!specialMeasureEndOn) {
      return { ok: false, error: "特定有期業務の完了日を正しく入力してください。" };
    }
  }

  const allowancesResult = parseAllowances(values.allowancesJson);
  if (!allowancesResult.ok) return allowancesResult;

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
      workplaceInitial: values.workplaceInitial || null,
      workplaceScope: values.workplaceScope || null,
      jobDescriptionInitial: values.jobDescriptionInitial || null,
      jobDescriptionScope: values.jobDescriptionScope || null,
      weeklyHoursCategory,
      shiftBasedSchedule: values.shiftBasedSchedule === "on",
      hasEarlyEndPossibility: values.hasEarlyEndPossibility === "on",
      hasOvertime: values.hasOvertime === "on",
      hasBonus: values.hasBonus === "on",
      bonusDescription: values.bonusDescription || null,
      retirementAllowanceStartText: values.retirementAllowanceStartText || null,
      specialMeasureType,
      specialMeasureBusinessTitle: values.specialMeasureBusinessTitle || null,
      specialMeasureStartOn,
      specialMeasureEndOn,
      allowances: allowancesResult.value,
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

  const { allowances, ...contractData } = parsed.data;
  await prisma.$transaction(async (tx) => {
    const created = await tx.employmentContract.create({
      data: { employeeId, ...contractData },
    });
    if (allowances.length > 0) {
      await tx.employmentContractAllowance.createMany({
        data: allowances.map((a, i) => ({
          contractId: created.id,
          sortOrder: i,
          name: a.name,
          amountYen: a.amountYen,
          calculationMethod: a.calculationMethod,
        })),
      });
    }
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

  const { allowances, ...contractData } = parsed.data;
  await prisma.$transaction(async (tx) => {
    await tx.employmentContract.update({ where: { id: contractId }, data: contractData });
    // 全削除→全 create で同期 (件数が少なく差分計算の複雑さを避ける)
    await tx.employmentContractAllowance.deleteMany({ where: { contractId } });
    if (allowances.length > 0) {
      await tx.employmentContractAllowance.createMany({
        data: allowances.map((a, i) => ({
          contractId,
          sortOrder: i,
          name: a.name,
          amountYen: a.amountYen,
          calculationMethod: a.calculationMethod,
        })),
      });
    }
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
