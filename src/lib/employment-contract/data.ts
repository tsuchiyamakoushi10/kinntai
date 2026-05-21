/**
 * 雇用契約書 / 労働条件通知書の PDF 出力用 ViewModel の構築。
 *
 * DB から会社マスタ + 雇用契約 + 諸手当 + 従業員情報を読み、
 * `html-template.tsx` に渡せる素直な構造に変換する。
 */
import type { CompanyProfile, EmploymentContractAllowance } from "@prisma/client";

import { prisma } from "@/lib/db";

export type ContractViewModel = {
  /** 帳票タイトル ("労働条件通知書 兼 雇用契約書") を引数で差し替えるためのコンテキスト */
  documentTitle: string;
  /** 発行日 ("令和 X 年 Y 月 Z 日" 形式に整形済) */
  issuedOn: string;
  /** 会社情報 (社判等) */
  company: CompanyProfile;
  /** 従業員情報 */
  employee: {
    fullName: string;
    lastNameKana: string;
    firstNameKana: string;
  };
  /** 契約本体 + 諸手当 */
  contract: {
    contractStartOn: Date;
    contractEndOn: Date | null;
    isRenewable: boolean;
    hasRenewalLimit: boolean;
    renewalLimitCount: number | null;
    renewalCriteria: string | null;
    employmentType: string;
    workingHoursPerDay: number;
    workingDaysPerWeek: number;
    wageType: "HOURLY" | "MONTHLY";
    wageAmount: number;
    hasEmploymentInsurance: boolean;
    hasSocialInsurance: boolean;
    workplaceInitial: string;
    workplaceScope: string;
    jobDescriptionInitial: string;
    jobDescriptionScope: string;
    weeklyHoursCategory: "UNDER_20" | "BETWEEN_20_30" | "BETWEEN_30_40";
    shiftBasedSchedule: boolean;
    hasEarlyEndPossibility: boolean;
    hasOvertime: boolean;
    hasBonus: boolean;
    bonusDescription: string | null;
    retirementAllowanceStartText: string | null;
    specialMeasureType: "NONE" | "HIGH_SKILL" | "POST_RETIREMENT";
    specialMeasureBusinessTitle: string | null;
    specialMeasureStartOn: Date | null;
    specialMeasureEndOn: Date | null;
    allowances: ReadonlyArray<
      Pick<EmploymentContractAllowance, "name" | "amountYen" | "calculationMethod">
    >;
  };
};

/** "令和 X 年 Y 月 Z 日" 形式に整形 (令和元年 = 2019)。 */
export function formatReiwa(d: Date): string {
  const y = d.getUTCFullYear();
  const reiwa = y - 2018;
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `令和 ${reiwa} 年 ${m} 月 ${day} 日`;
}

/** DB から 1 契約分の ViewModel を取得する。
 *  必須項目が未入力でも値は返す (UI 側で canRenderContract で弾く前提)。 */
export async function loadContractViewModel(
  contractId: string,
  documentTitle: string,
): Promise<ContractViewModel | null> {
  const contract = await prisma.employmentContract.findUnique({
    where: { id: contractId },
    include: {
      employee: {
        select: { lastName: true, firstName: true, lastNameKana: true, firstNameKana: true },
      },
      allowances: {
        orderBy: { sortOrder: "asc" },
        select: { name: true, amountYen: true, calculationMethod: true },
      },
    },
  });
  if (!contract) return null;

  const company = await prisma.companyProfile.findFirst();
  if (!company) return null;

  return {
    documentTitle,
    issuedOn: formatReiwa(contract.contractStartOn),
    company,
    employee: {
      fullName: `${contract.employee.lastName} ${contract.employee.firstName}`,
      lastNameKana: contract.employee.lastNameKana,
      firstNameKana: contract.employee.firstNameKana,
    },
    contract: {
      contractStartOn: contract.contractStartOn,
      contractEndOn: contract.contractEndOn,
      isRenewable: contract.isRenewable,
      hasRenewalLimit: contract.hasRenewalLimit,
      renewalLimitCount: contract.renewalLimitCount,
      renewalCriteria: contract.renewalCriteria,
      employmentType: contract.employmentType,
      workingHoursPerDay: Number(contract.workingHoursPerDay),
      workingDaysPerWeek: Number(contract.workingDaysPerWeek),
      wageType: contract.wageType,
      wageAmount: contract.wageAmount,
      hasEmploymentInsurance: contract.hasEmploymentInsurance,
      hasSocialInsurance: contract.hasSocialInsurance,
      workplaceInitial: contract.workplaceInitial ?? "",
      workplaceScope: contract.workplaceScope ?? "",
      jobDescriptionInitial: contract.jobDescriptionInitial ?? "",
      jobDescriptionScope: contract.jobDescriptionScope ?? "",
      weeklyHoursCategory: contract.weeklyHoursCategory ?? "BETWEEN_30_40",
      shiftBasedSchedule: contract.shiftBasedSchedule,
      hasEarlyEndPossibility: contract.hasEarlyEndPossibility,
      hasOvertime: contract.hasOvertime,
      hasBonus: contract.hasBonus,
      bonusDescription: contract.bonusDescription,
      retirementAllowanceStartText: contract.retirementAllowanceStartText,
      specialMeasureType: contract.specialMeasureType,
      specialMeasureBusinessTitle: contract.specialMeasureBusinessTitle,
      specialMeasureStartOn: contract.specialMeasureStartOn,
      specialMeasureEndOn: contract.specialMeasureEndOn,
      allowances: contract.allowances,
    },
  };
}
