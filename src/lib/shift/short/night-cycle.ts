/**
 * ショートステイ等の夜勤サイクル割当 (案A / ショート設計書 §3 ステップ1)。
 *
 * 「夜入 → 翌日 夜明 → 翌々日 公休(望ましい)」を 1 か月分、先に組む。日中配置より先に
 * 夜勤を固めるのが介護現場の実務 (デイの常勤先取りに対し、ショートは夜勤先取り)。
 *
 * DB に触れない純粋関数。夜勤可否/上限は呼び出し側が nightCap で渡す
 * (0 = 夜勤不可、>0 = 月の上限。shift_constraints.max_night_shifts_per_month 由来)。
 * 決定論: 同じ入力なら同じ結果 (夜勤回数が同点なら employeeCode 順)。
 */

/** 当月の 1 日 (日付と日種)。 */
export type NightDay = {
  /** "YYYY-MM-DD" */
  date: string;
  /** その日に必要な夜入の数 (ショートは 1)。0 の日は夜勤を置かない。 */
  nightInRequired: number;
};

/** 夜勤割当に渡す職員。 */
export type NightEmployee = {
  id: string;
  /** 安定ソート用 (決定論)。 */
  employeeCode: string;
  /** 月の夜勤上限 (0 = 夜勤不可)。 */
  nightCap: number;
  /** 入れない日 ("YYYY-MM-DD")。希望休 / 勤務不可 / 雇用期間外。 */
  unavailableDates: ReadonlySet<string>;
  /** 夜勤希望の日 ("YYYY-MM-DD")。その日は優先的に夜入を割り当てる。 */
  preferredNightDates: ReadonlySet<string>;
};

export type NightCycleConfig = {
  /** 夜入の記号 (既定 "夜入")。 */
  nightInSymbol: string;
  /** 夜明の記号 (既定 "夜明")。 */
  nightOutSymbol: string;
};

export const DEFAULT_NIGHT_CYCLE_CONFIG: NightCycleConfig = {
  nightInSymbol: "夜入",
  nightOutSymbol: "夜明",
};

export type NightAssignment = {
  employeeId: string;
  date: string;
  baseSymbol: string;
};

export type NightCycleResult = {
  /** 夜入・夜明のセルのみ (公休/日中は後段の day-fill で埋める)。 */
  assignments: NightAssignment[];
  /** 日付 → その日 夜勤で塞がっている職員 (夜入 or 夜明)。day-fill が日中候補から外す。 */
  occupiedByDate: Map<string, Set<string>>;
  /** 夜明の翌日 ("employeeId|YYYY-MM-DD")。公休が望ましいセル (day-fill のヒント)。 */
  preferredOff: Set<string>;
  /** 職員ごとの夜勤回数 (夜入の数)。 */
  nightCountByEmployee: Record<string, number>;
  /** 夜入を 1 名も置けなかった日 (人員不足。最重要警告)。 */
  unfilledNightDays: string[];
};

export function assignNightCycle(
  days: ReadonlyArray<NightDay>,
  employees: ReadonlyArray<NightEmployee>,
  config: NightCycleConfig = DEFAULT_NIGHT_CYCLE_CONFIG,
): NightCycleResult {
  const sorted = [...employees].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
  const nightCount = new Map<string, number>(sorted.map((e) => [e.id, 0]));
  const occupiedByDate = new Map<string, Set<string>>();
  const preferredOff = new Set<string>();
  const assignments: NightAssignment[] = [];
  const unfilledNightDays: string[] = [];

  const occupiedOn = (date: string): Set<string> => {
    let set = occupiedByDate.get(date);
    if (!set) {
      set = new Set<string>();
      occupiedByDate.set(date, set);
    }
    return set;
  };

  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const nextDate = days[i + 1]?.date ?? null;
    const dayAfter = days[i + 2]?.date ?? null;

    for (let n = 0; n < day.nightInRequired; n++) {
      const occToday = occupiedOn(day.date);
      const candidates = sorted.filter((e) => {
        if (e.nightCap <= 0) return false; // 夜勤不可
        if ((nightCount.get(e.id) ?? 0) >= e.nightCap) return false; // 上限到達
        if (occToday.has(e.id)) return false; // 既に今日の夜勤(明け/入り)で塞がっている
        if (e.unavailableDates.has(day.date)) return false; // 当日が希望休/不可
        // 夜入を置くと翌日は必ず夜明。翌日が希望休なら置けない。
        if (nextDate && e.unavailableDates.has(nextDate)) return false;
        // 夜勤希望を出している人は「希望日のみ」夜勤可 (希望 = その人が夜勤に入れる日の指定)。
        // 希望を出していない人 (空) は全日ローテーション対象。
        if (e.preferredNightDates.size > 0 && !e.preferredNightDates.has(day.date)) return false;
        return true;
      });
      if (candidates.length === 0) {
        unfilledNightDays.push(day.date);
        break;
      }
      // その日を夜勤希望に出している人を最優先 → 夜勤回数が少ない人 → employeeCode。
      candidates.sort((a, b) => {
        const wantA = a.preferredNightDates.has(day.date) ? 1 : 0;
        const wantB = b.preferredNightDates.has(day.date) ? 1 : 0;
        if (wantA !== wantB) return wantB - wantA;
        const ca = nightCount.get(a.id) ?? 0;
        const cb = nightCount.get(b.id) ?? 0;
        if (ca !== cb) return ca - cb;
        return a.employeeCode.localeCompare(b.employeeCode);
      });
      const pick = candidates[0]!;

      assignments.push({ employeeId: pick.id, date: day.date, baseSymbol: config.nightInSymbol });
      occToday.add(pick.id);
      nightCount.set(pick.id, (nightCount.get(pick.id) ?? 0) + 1);

      // 翌日に夜明をペアで置く (グリッド内のときのみ)。
      if (nextDate) {
        assignments.push({
          employeeId: pick.id,
          date: nextDate,
          baseSymbol: config.nightOutSymbol,
        });
        occupiedOn(nextDate).add(pick.id);
      }
      // 夜明の翌日は公休が望ましい (soft)。
      if (dayAfter) preferredOff.add(`${pick.id}|${dayAfter}`);
    }
  }

  return {
    assignments,
    occupiedByDate,
    preferredOff,
    nightCountByEmployee: Object.fromEntries(nightCount),
    unfilledNightDays,
  };
}
