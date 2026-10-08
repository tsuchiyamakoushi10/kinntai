/**
 * シフト確定時の「本業 (副業先) との労働時間の通算」チェック (純関数)。
 *
 * 労基法 38 条により労働時間は事業場を異にしても通算する。結いの心との契約が
 * 本業より後なら、通算で 1 日 8 時間・週 40 時間を超えた分は結いの心が割増を払う。
 * 警告のみで、シフト確定は止めない。docs/labor-notice.md §4.0 参照。
 */
import { effectiveHourlyYen, splitNightWage } from "./calc";
import { LEGAL_DAILY_HOURS, LEGAL_WEEKLY_HOURS, OVERTIME_PREMIUM } from "./constants";

export type SideJob = {
  /** 本業の勤務曜日 (0=日〜6=土) */
  weekdays: ReadonlyArray<number>;
  dailyHours: number;
  weeklyHours: number;
  /** 本業の契約が結いの心より先か */
  contractedBeforeUs: boolean;
};

export type ShiftPay = { kind: "DAILY"; totalYen: number } | { kind: "HOURLY"; hourlyYen: number };

export type SideJobShift = {
  /** 勤務の開始日 (夜勤は入りの日) */
  workDate: string;
  label: string;
  workHours: number;
  nightHours: number;
  pay: ShiftPay;
};

export type ShiftAlternative = { label: string; workHours: number; nightHours: number };

export type SideJobWarning = {
  workDate: string;
  label: string;
  /** 本業と合わせた当日の労働時間 */
  combinedDailyHours: number;
  /** 本業と合わせた週の労働時間 (この勤務まで) */
  combinedWeeklyHours: number;
  overtimeHours: number;
  /** 時間外割増の概算 (円) */
  overtimePremiumYen: number;
  /** 割増込みの総額から逆算した時給換算 (日給払いのみ) */
  effectiveHourlyYen: number | null;
  belowMinWage: boolean;
  /** 差し替え候補 (短縮夜勤など) で入れた場合 */
  alternative: { label: string; effectiveHourlyYen: number; belowMinWage: boolean } | null;
};

function weekday(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

function overtimeOf(args: {
  hours: number;
  sideDaily: number;
  weeklyBefore: number;
  variableHours: boolean;
}): number {
  // 変形労働時間制ではシフトで定めた時間までは 1 日 8 時間を超えても時間外にならない
  const dailyLimit = args.variableHours
    ? Math.max(LEGAL_DAILY_HOURS, args.hours)
    : LEGAL_DAILY_HOURS;
  const daily = Math.max(0, Math.min(args.hours, args.sideDaily + args.hours - dailyLimit));
  const weekly = Math.max(
    0,
    Math.min(args.hours, args.weeklyBefore + args.hours - LEGAL_WEEKLY_HOURS),
  );
  return Math.max(daily, weekly);
}

/**
 * 1 週間分 (就業規則上の週) の結いの心のシフトを渡す。
 * 本業の時間は週の頭からすべて先に働いたものとして数える (先に契約した側が先順位)。
 */
export function checkSideJobOvertime(args: {
  sideJobs: ReadonlyArray<SideJob>;
  weekShifts: ReadonlyArray<SideJobShift>;
  minWageYen: number | null;
  /** 1 か月単位の変形労働時間制が適用されるか */
  variableHours: boolean;
  /** 夜勤に対する差し替え候補。日給払いの勤務にだけ使う */
  alternative?: ShiftAlternative | null;
}): SideJobWarning[] {
  const earlier = args.sideJobs.filter((j) => j.contractedBeforeUs);
  if (earlier.length === 0) return [];

  const sideWeekly = earlier.reduce((sum, j) => sum + j.weeklyHours, 0);
  const sorted = [...args.weekShifts].sort((a, b) => a.workDate.localeCompare(b.workDate));
  const warnings: SideJobWarning[] = [];
  let oursSoFar = 0;

  for (const shift of sorted) {
    const dow = weekday(shift.workDate);
    const sideDaily = earlier
      .filter((j) => j.weekdays.includes(dow))
      .reduce((sum, j) => sum + j.dailyHours, 0);
    const weeklyBefore = sideWeekly + oursSoFar;
    const overtimeHours = overtimeOf({
      hours: shift.workHours,
      sideDaily,
      weeklyBefore,
      variableHours: args.variableHours,
    });
    oursSoFar += shift.workHours;
    if (overtimeHours <= 0) continue;

    let premium: number;
    let hourly: number | null = null;
    let alternative: SideJobWarning["alternative"] = null;
    if (shift.pay.kind === "DAILY") {
      const total = shift.pay.totalYen;
      const { baseYen } = splitNightWage(total, shift.workHours, shift.nightHours);
      premium = Math.round(overtimeHours * (baseYen / shift.workHours) * OVERTIME_PREMIUM);
      hourly = effectiveHourlyYen({
        totalYen: total,
        workHours: shift.workHours,
        nightHours: shift.nightHours,
        overtimeHours,
      });
      if (args.alternative) {
        const alt = args.alternative;
        const altOvertime = overtimeOf({
          hours: alt.workHours,
          sideDaily,
          weeklyBefore,
          variableHours: args.variableHours,
        });
        const altHourly = effectiveHourlyYen({
          totalYen: total,
          workHours: alt.workHours,
          nightHours: alt.nightHours,
          overtimeHours: altOvertime,
        });
        alternative = {
          label: alt.label,
          effectiveHourlyYen: altHourly,
          belowMinWage: args.minWageYen !== null && altHourly < args.minWageYen,
        };
      }
    } else {
      premium = Math.round(overtimeHours * shift.pay.hourlyYen * OVERTIME_PREMIUM);
    }

    warnings.push({
      workDate: shift.workDate,
      label: shift.label,
      combinedDailyHours: sideDaily + shift.workHours,
      combinedWeeklyHours: weeklyBefore + shift.workHours,
      overtimeHours,
      overtimePremiumYen: premium,
      effectiveHourlyYen: hourly,
      belowMinWage: hourly !== null && args.minWageYen !== null && hourly < args.minWageYen,
      alternative,
    });
  }
  return warnings;
}
