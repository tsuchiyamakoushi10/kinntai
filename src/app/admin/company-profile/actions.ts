"use server";

import type { LaborNoticeType } from "@prisma/client";
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
  // 労働条件通知書 新フォーマットの判定に使う設定 (docs/labor-notice.md §6.1)
  employeeCount: number | null;
  hasSecondTypeCertification: boolean;
  fulltimeWeeklyHours: number;
  fulltimeMonthlyDays: number;
  variableHoursAgreementCoversNight: boolean;
  rehireContinueAfter65: boolean;
  jobPostingIndefiniteTypes: LaborNoticeType[];
  noticeNumberPrefix: string;
};

const NOTICE_TYPES: ReadonlyArray<LaborNoticeType> = ["FULL_TIME", "PART_TIME", "NIGHT_ONLY"];

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

  if (
    input.employeeCount !== null &&
    (!isPositiveInt(input.employeeCount) || input.employeeCount > 100_000)
  ) {
    return { ok: false, error: "従業員数は 0 以上の整数で入力してください。" };
  }
  if (!(input.fulltimeWeeklyHours > 0 && input.fulltimeWeeklyHours <= 40)) {
    return { ok: false, error: "正社員の1週の勤務時間は 40 時間以内で入力してください。" };
  }
  if (!(input.fulltimeMonthlyDays > 0 && input.fulltimeMonthlyDays <= 31)) {
    return { ok: false, error: "正社員の1か月の勤務日数は 31 日以内で入力してください。" };
  }
  if (!/^[A-Z]{1,6}$/.test(input.noticeNumberPrefix)) {
    return { ok: false, error: "通知書番号の頭文字は英大文字 1〜6 文字で入力してください。" };
  }
  if (!input.jobPostingIndefiniteTypes.every((t) => NOTICE_TYPES.includes(t))) {
    return { ok: false, error: "求人票の区分が不正です。" };
  }

  // クライアントから余計なキー (id 等) が来ても書き込まないよう、型の項目だけを詰め直す
  const data: CompanyProfileInput = {
    legalName: input.legalName,
    address: input.address,
    phone: input.phone,
    representativeTitle: input.representativeTitle,
    representativeName: input.representativeName,
    retirementAge: input.retirementAge,
    continuedEmploymentAge: input.continuedEmploymentAge,
    resignNoticeDays: input.resignNoticeDays,
    wageCutoffDay: input.wageCutoffDay,
    wagePaymentDay: input.wagePaymentDay,
    wagePaymentMethod: input.wagePaymentMethod,
    salaryRaisePeriod: input.salaryRaisePeriod,
    overtimeRateUnder60h: input.overtimeRateUnder60h,
    overtimeRateOver60h: input.overtimeRateOver60h,
    overtimeRateWithin: input.overtimeRateWithin,
    holidayLegalRate: input.holidayLegalRate,
    nightRate: input.nightRate,
    breakRuleText: input.breakRuleText,
    workRulesName: input.workRulesName,
    partTimeWorkRulesName: input.partTimeWorkRulesName,
    contactDepartment: input.contactDepartment,
    contactPersonTitle: input.contactPersonTitle,
    contactPersonName: input.contactPersonName,
    contactPhone: input.contactPhone,
    employeeCount: input.employeeCount,
    hasSecondTypeCertification: input.hasSecondTypeCertification,
    fulltimeWeeklyHours: input.fulltimeWeeklyHours,
    fulltimeMonthlyDays: input.fulltimeMonthlyDays,
    variableHoursAgreementCoversNight: input.variableHoursAgreementCoversNight,
    rehireContinueAfter65: input.rehireContinueAfter65,
    jobPostingIndefiniteTypes: input.jobPostingIndefiniteTypes,
    noticeNumberPrefix: input.noticeNumberPrefix,
  };

  const existing = await prisma.companyProfile.findFirst({ select: { id: true } });
  if (existing) {
    await prisma.companyProfile.update({ where: { id: existing.id }, data });
  } else {
    await prisma.companyProfile.create({ data });
  }

  revalidatePath("/admin/company-profile");

  return { ok: true };
}
