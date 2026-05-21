"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

export type CompanyProfileInput = {
  legalName: string;
  address: string;
  phone: string;
  representativeTitle: string;
  representativeName: string;
  retirementAge: number;
  continuedEmploymentAge: number;
  resignNoticeDays: number;
  wageCutoffDay: string;
  wagePaymentDay: string;
  wagePaymentMethod: string;
  salaryRaisePeriod: string;
  overtimeRateUnder60h: number;
  overtimeRateOver60h: number;
  overtimeRateWithin: number;
  holidayLegalRate: number;
  nightRate: number;
  breakRuleText: string;
  workRulesName: string;
  partTimeWorkRulesName: string;
  contactDepartment: string;
  contactPersonTitle: string;
  contactPersonName: string;
  contactPhone: string;
};

export type SaveCompanyProfileResult = { ok: true } | { ok: false; error: string };

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/**
 * 会社マスタを保存する。シングルトン制約は app レベル:
 *   - 既に行があれば update
 *   - 無ければ create
 *
 * 数値項目 (定年 / 継続雇用年齢 / 割増率) は範囲チェック。
 */
export async function saveCompanyProfile(
  input: CompanyProfileInput,
): Promise<SaveCompanyProfileResult> {
  await requireAdmin();

  // 必須テキスト項目のチェック
  const textKeys: ReadonlyArray<keyof CompanyProfileInput> = [
    "legalName",
    "address",
    "phone",
    "representativeTitle",
    "representativeName",
    "wageCutoffDay",
    "wagePaymentDay",
    "wagePaymentMethod",
    "salaryRaisePeriod",
    "breakRuleText",
    "workRulesName",
    "partTimeWorkRulesName",
    "contactDepartment",
    "contactPersonTitle",
    "contactPersonName",
    "contactPhone",
  ];
  for (const k of textKeys) {
    if (!isNonEmpty(input[k])) {
      return { ok: false, error: `${k} は必須です。` };
    }
  }

  // 数値項目のチェック
  if (!isPositiveInt(input.retirementAge) || input.retirementAge < 50 || input.retirementAge > 90) {
    return { ok: false, error: "定年は 50〜90 の整数で入力してください。" };
  }
  if (
    !isPositiveInt(input.continuedEmploymentAge) ||
    input.continuedEmploymentAge < input.retirementAge ||
    input.continuedEmploymentAge > 100
  ) {
    return { ok: false, error: "継続雇用の上限年齢は定年以上 100 以下で入力してください。" };
  }
  if (!isPositiveInt(input.resignNoticeDays) || input.resignNoticeDays > 365) {
    return { ok: false, error: "自己都合退職の事前申出日数は 0〜365 日で入力してください。" };
  }
  const rateKeys: ReadonlyArray<keyof CompanyProfileInput> = [
    "overtimeRateUnder60h",
    "overtimeRateOver60h",
    "overtimeRateWithin",
    "holidayLegalRate",
    "nightRate",
  ];
  for (const k of rateKeys) {
    const v = input[k];
    if (!isPositiveInt(v) || v > 200) {
      return { ok: false, error: `${k} は 0〜200 の整数 (%) で入力してください。` };
    }
  }

  const existing = await prisma.companyProfile.findFirst({ select: { id: true } });
  if (existing) {
    await prisma.companyProfile.update({
      where: { id: existing.id },
      data: input,
    });
  } else {
    await prisma.companyProfile.create({ data: input });
  }

  revalidatePath("/admin/company-profile");

  return { ok: true };
}
