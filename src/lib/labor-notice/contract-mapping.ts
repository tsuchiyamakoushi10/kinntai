/**
 * 発行した通知書の内容を、雇用契約 (employment_contracts) と従業員の現在の条件
 * (employees のスナップショット列) に写す (純関数)。
 *
 * 社長の入力を 1 回で済ませるため、発行時にこの値で契約を作成/更新する。
 * docs/labor-notice.md §1。
 */
import { weeklyHoursCategory } from "./defaults";
import type { NoticeInput, NoticeView } from "./types";

export type ContractData = {
  contractStartOn: string;
  contractEndOn: string | null;
  employmentType: "FULL_TIME" | "PART_TIME_INSURED" | "PART_TIME_UNINSURED";
  workingHoursPerDay: number;
  workingDaysPerWeek: number;
  wageType: "HOURLY" | "MONTHLY" | "DAILY";
  wageAmount: number;
  isRenewable: boolean | null;
  renewalCriteria: string | null;
  hasEmploymentInsurance: boolean;
  hasSocialInsurance: boolean;
  workplaceInitial: string;
  workplaceScope: string;
  jobDescriptionInitial: string;
  jobDescriptionScope: string;
  weeklyHoursCategory: "UNDER_20" | "BETWEEN_20_30" | "BETWEEN_30_40";
  shiftBasedSchedule: boolean;
  hasOvertime: boolean;
  hasBonus: boolean;
  bonusDescription: string | null;
};

export type EmployeeSnapshot = {
  employmentType: ContractData["employmentType"];
  weeklyWorkDays: number;
  dailyWorkHours: number;
  baseWageType: ContractData["wageType"];
  baseWageAmount: number;
  /** 夜勤専従の通知書を出したときだけ立てる。他区分では勤務表の設定を勝手に外さない */
  nightShiftOnly?: true;
};

const startsWithYes = (s: string): boolean => s.trim().startsWith("有");

export function toContractData(input: NoticeInput, view: NoticeView): ContractData {
  const socialInsured = view.insurance.health === "ENROLLED";
  const employmentType =
    input.employmentType === "FULL_TIME"
      ? "FULL_TIME"
      : socialInsured
        ? "PART_TIME_INSURED"
        : "PART_TIME_UNINSURED";
  const w = input.wage;
  const wageType = w.kind === "MONTHLY" ? "MONTHLY" : w.kind === "HOURLY" ? "HOURLY" : "DAILY";
  const wageAmount =
    w.kind === "MONTHLY" ? w.baseYen : w.kind === "HOURLY" ? w.hourlyYen : w.totalYen;
  const isFixed = view.contract.endOn !== null;

  return {
    contractStartOn: view.contract.startOn,
    contractEndOn: view.contract.endOn,
    employmentType,
    workingHoursPerDay:
      input.daysPerWeek > 0 ? Math.round((input.hoursPerWeek / input.daysPerWeek) * 100) / 100 : 0,
    workingDaysPerWeek: input.daysPerWeek,
    wageType,
    wageAmount,
    // 無期へ切り替えるパートは「有期としての更新なし」
    isRenewable: isFixed ? !view.contract.convertsToIndefinite : null,
    renewalCriteria: isFixed ? view.contract.renewalCriteria.join("、") : null,
    hasEmploymentInsurance: view.insurance.employment === "ENROLLED",
    hasSocialInsurance: socialInsured,
    workplaceInitial: view.office.name,
    workplaceScope: view.workplaceScope,
    jobDescriptionInitial: view.jobDescription,
    jobDescriptionScope: view.jobScope,
    weeklyHoursCategory: weeklyHoursCategory(input.hoursPerWeek),
    shiftBasedSchedule: true,
    hasOvertime: startsWithYes(view.overtime),
    hasBonus: startsWithYes(view.bonus),
    bonusDescription: startsWithYes(view.bonus) ? view.bonus : null,
  };
}

export function toEmployeeSnapshot(input: NoticeInput, contract: ContractData): EmployeeSnapshot {
  return {
    employmentType: contract.employmentType,
    weeklyWorkDays: contract.workingDaysPerWeek,
    dailyWorkHours: contract.workingHoursPerDay,
    baseWageType: contract.wageType,
    baseWageAmount: contract.wageAmount,
    ...(input.employmentType === "NIGHT_ONLY" ? { nightShiftOnly: true as const } : {}),
  };
}
