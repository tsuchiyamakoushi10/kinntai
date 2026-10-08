/**
 * 労働条件通知書の個別計算 (純関数)。docs/labor-notice.md §3.2, §4 参照。
 */
import { computeGrantDays } from "@/lib/leave/grant-table";

import {
  EMPLOYMENT_INSURANCE_MIN_WEEKLY_HOURS,
  NIGHT_PREMIUM,
  OVERTIME_PREMIUM,
  SOCIAL_INSURANCE_EMPLOYER_THRESHOLDS,
  SOCIAL_INSURANCE_MIN_MONTHLY_WAGE_YEN,
  SOCIAL_INSURANCE_MIN_WEEKLY_HOURS,
  SOCIAL_INSURANCE_WAGE_REQUIREMENT_ABOLISHED_ON,
} from "./constants";
import { pickEffective } from "./dates";
import type { InsuranceSet, MinWage, NoticeWorkPattern } from "./types";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** 実働時間 (時間)。翌日終了は +24h。 */
export function workHours(
  p: Pick<NoticeWorkPattern, "start" | "end" | "endsNextDay" | "breakMinutes">,
): number {
  const end = toMinutes(p.end) + (p.endsNextDay ? 24 * 60 : 0);
  return (end - toMinutes(p.start) - p.breakMinutes) / 60;
}

/**
 * 夜勤専従の 1 回あたり総額を「基本日給 + 深夜割増」に分解する。
 * 変形労働時間制適用・時間外なしが前提。
 */
export function splitNightWage(
  totalYen: number,
  hours: number,
  nightHours: number,
): { baseYen: number; premiumYen: number; hourlyYen: number } {
  const baseYen = Math.floor(totalYen / (1 + (NIGHT_PREMIUM * nightHours) / hours));
  return { baseYen, premiumYen: totalYen - baseYen, hourlyYen: baseYen / hours };
}

/**
 * 割増込みの総額から逆算した「1 時間あたりの通常賃金」。最低賃金と比べる値。
 *   total = h × (実働 + 0.25 × 時間外時間 + 0.25 × 深夜時間)
 */
export function effectiveHourlyYen(args: {
  totalYen: number;
  workHours: number;
  nightHours: number;
  overtimeHours: number;
}): number {
  return (
    args.totalYen /
    (args.workHours + OVERTIME_PREMIUM * args.overtimeHours + NIGHT_PREMIUM * args.nightHours)
  );
}

/** 小数 1 桁に丸める (表示用)。 */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 雇い入れ 6 か月時点の年次有給休暇の付与日数。src/lib/leave の付与表を使う。 */
export function initialPaidLeaveDays(daysPerWeek: number, hoursPerWeek: number): number {
  return computeGrantDays({
    monthsSinceHired: 6,
    weeklyWorkDays: daysPerWeek,
    weeklyWorkHours: hoursPerWeek,
  });
}

export function minWageOn(
  minWages: ReadonlyArray<MinWage>,
  prefecture: string,
  onDate: string,
): MinWage | null {
  return pickEffective(
    minWages.filter((w) => w.prefecture === prefecture),
    onDate,
  );
}

export type InsuranceJudgeInput = {
  onDate: string;
  isFullTime: boolean;
  hoursPerWeek: number;
  daysPerWeek: number;
  /** 月額賃金の見込み (円) */
  monthlyWageYen: number;
  isStudent: boolean;
  /** 31 日以上の雇用見込みがあるか */
  expectedOver31Days: boolean;
  fulltimeWeeklyHours: number;
  fulltimeMonthlyDays: number;
  employeeCount: number | null;
};

/** 月所定日数の目安 (週日数 × 52 / 12) */
export function monthlyDaysFromWeekly(daysPerWeek: number): number {
  return (daysPerWeek * 52) / 12;
}

/** 社会保険・雇用保険の判定。docs/labor-notice.md §4.1。 */
export function judgeInsurance(input: InsuranceJudgeInput): InsuranceSet {
  const social = judgeSocialInsurance(input) ? "ENROLLED" : "NOT_ENROLLED";
  const eiHours = pickEffective(EMPLOYMENT_INSURANCE_MIN_WEEKLY_HOURS, input.onDate)?.hours ?? 20;
  const employment =
    input.hoursPerWeek >= eiHours && input.expectedOver31Days ? "ENROLLED" : "NOT_ENROLLED";
  return { health: social, pension: social, employment };
}

function judgeSocialInsurance(input: InsuranceJudgeInput): boolean {
  if (input.isFullTime) return true;

  // 1. 4 分の 3 基準
  const monthlyDays = monthlyDaysFromWeekly(input.daysPerWeek);
  if (
    input.hoursPerWeek >= (input.fulltimeWeeklyHours * 3) / 4 &&
    monthlyDays >= (input.fulltimeMonthlyDays * 3) / 4
  ) {
    return true;
  }

  // 2. 特定適用事業所の短時間労働者
  const threshold = pickEffective(SOCIAL_INSURANCE_EMPLOYER_THRESHOLDS, input.onDate);
  if (threshold === null || input.employeeCount === null) return false;
  if (input.employeeCount < threshold.minEmployees) return false;
  if (input.hoursPerWeek < SOCIAL_INSURANCE_MIN_WEEKLY_HOURS) return false;
  if (input.isStudent) return false;
  const wageAbolished =
    SOCIAL_INSURANCE_WAGE_REQUIREMENT_ABOLISHED_ON !== null &&
    SOCIAL_INSURANCE_WAGE_REQUIREMENT_ABOLISHED_ON <= input.onDate;
  if (!wageAbolished && input.monthlyWageYen < SOCIAL_INSURANCE_MIN_MONTHLY_WAGE_YEN) return false;
  return true;
}

/** "20,000円" */
export function formatYen(n: number): string {
  return `${n.toLocaleString("ja-JP")}円`;
}
