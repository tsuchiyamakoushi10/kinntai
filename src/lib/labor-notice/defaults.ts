/**
 * 作成画面の初期値づくり (純関数)。区分を選んだときのプリセット流し込み、
 * 更新版・無期切替の「前回の入力をコピー」を扱う。
 */
import {
  EMPLOYMENT_PRESETS,
  NIGHT_ONLY_DEFAULT_NIGHT_HOURS,
  NIGHT_ONLY_DEFAULT_TOTAL_YEN,
} from "./constants";
import { addDays } from "./dates";
import type { InsuranceSet, NoticeEmploymentType, NoticeInput, NoticeWageInput } from "./types";

/** JST の今日 ("YYYY-MM-DD") */
export function todayJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const DEFAULT_TIME: Record<
  NoticeEmploymentType,
  { daysPerWeek: number; hoursPerWeek: number; monthlyHours: number | null }
> = {
  FULL_TIME: { daysPerWeek: 5, hoursPerWeek: 37, monthlyHours: 160 },
  PART_TIME: { daysPerWeek: 2, hoursPerWeek: 16, monthlyHours: null },
  NIGHT_ONLY: { daysPerWeek: 1, hoursPerWeek: 14, monthlyHours: null },
};

function defaultWage(type: NoticeEmploymentType): NoticeWageInput {
  switch (type) {
    case "FULL_TIME":
      return {
        kind: "MONTHLY",
        baseYen: 0,
        qualification: "NONE",
        singleParentChildren: 0,
        managerAllowanceYen: 0,
        counselorAllowanceYen: 0,
      };
    case "PART_TIME":
      return { kind: "HOURLY", hourlyYen: 0, qualification: "NONE", worksNight: false };
    case "NIGHT_ONLY":
      return {
        kind: "NIGHT_DAILY",
        totalYen: NIGHT_ONLY_DEFAULT_TOTAL_YEN,
        nightHours: NIGHT_ONLY_DEFAULT_NIGHT_HOURS,
      };
  }
}

/**
 * 区分を選んだときの入力一式。従業員・勤務先・日付など区分に依らない値は `keep` から引き継ぐ。
 * 前の区分で個別に上書きした文言はリセットする (区分ごとに意味が違うため)。
 */
export function applyPreset(
  type: NoticeEmploymentType,
  keep: Pick<
    NoticeInput,
    | "employeeName"
    | "issuedOn"
    | "contractStartOn"
    | "officeId"
    | "jobDescription"
    | "priorFixedTermMonths"
    | "isPostRetirementRehire"
    | "isStudent"
  >,
): NoticeInput {
  const preset = EMPLOYMENT_PRESETS[type];
  return {
    ...keep,
    employmentType: type,
    fixedTermMonths: preset.defaultFixedTermMonths,
    convertsToIndefinite: preset.convertsToIndefinite,
    wage: defaultWage(type),
    patternCodes: preset.defaultPatternCodes,
    ...DEFAULT_TIME[type],
    weeklyHoursText: null,
    overrides: {},
    insuranceOverride: null,
  };
}

/**
 * 前回の通知書から次の契約の入力を作る。
 * - RENEW: 同じ条件で有期を更新 (通算月数を積む)
 * - TO_INDEFINITE: 契約期間だけ無期にする (パートの無期切替)
 */
export function nextContractInput(
  prev: NoticeInput,
  prevEndOn: string,
  mode: "RENEW" | "TO_INDEFINITE",
  issuedOn: string,
): NoticeInput {
  const startOn = addDays(prevEndOn, 1);
  if (mode === "TO_INDEFINITE") {
    return {
      ...prev,
      issuedOn,
      contractStartOn: startOn,
      fixedTermMonths: null,
      convertsToIndefinite: false,
    };
  }
  return {
    ...prev,
    issuedOn,
    contractStartOn: startOn,
    priorFixedTermMonths: prev.priorFixedTermMonths + (prev.fixedTermMonths ?? 0),
    convertsToIndefinite: false,
  };
}

/** 発行時に契約データへ写す値。docs/labor-notice.md §1 (入力は 1 回だけ)。 */
export function weeklyHoursCategory(
  hoursPerWeek: number,
): "UNDER_20" | "BETWEEN_20_30" | "BETWEEN_30_40" {
  if (hoursPerWeek < 20) return "UNDER_20";
  if (hoursPerWeek < 30) return "BETWEEN_20_30";
  return "BETWEEN_30_40";
}

export function sameInsuranceSet(a: InsuranceSet, b: InsuranceSet): boolean {
  return a.health === b.health && a.pension === b.pension && a.employment === b.employment;
}
