/**
 * ショートステイ等の夜勤サイクル割当 (案A / ショート設計書 §3 ステップ1)。
 *
 * 「夜入 → 翌日 夜明 → 翌々日 公休(望ましい)」を 1 か月分、先に組む。日中配置より先に
 * 夜勤を固めるのが介護現場の実務 (デイの常勤先取りに対し、ショートは夜勤先取り)。
 *
 * 方針: **夜勤を全部埋めることを最優先**する。夜勤希望 (preferredNightDates) は尊重して
 * 先に組むが、人手が足りず空く日が出るくらいなら、月の上限 (nightCap) を超えてでも・
 * 希望を出した人を希望外の日に回してでも埋める (「埋まらないより超える」)。ただし
 * 「夜勤をしない人 (nightCap 0)」「当日/翌日が休み」「当日すでに夜勤で塞がり」だけは
 * 絶対に侵さない (ハード制約)。
 *
 * DB に触れない純粋関数。夜勤可否/上限は呼び出し側が nightCap で渡す
 * (0 = 夜勤不可、>0 = 月の上限のめやす。shift_constraints.max_night_shifts_per_month 由来。
 *  上限は埋めるためなら超えてよいソフト値)。
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
  /**
   * 夜勤専従か。true の人は希望日 (preferredNightDates) のみ夜勤可。希望が空なら夜勤に入れない。
   * (通常の従業員は希望が空なら全日ローテ対象だが、専従は希望外日に入れない。)
   */
  nightOnly?: boolean;
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
      // ハード制約: これを満たさない人は何があっても夜入に置かない (物理的に不可 / 休みを侵さない)。
      const candidates = sorted.filter((e) => {
        if (e.nightCap <= 0) return false; // 夜勤をしない職員 (絶対に置かない)
        if (occToday.has(e.id)) return false; // 既に今日の夜勤(明け/入り)で塞がっている
        if (e.unavailableDates.has(day.date)) return false; // 当日が希望休/不可
        // 夜入を置くと翌日は必ず夜明。翌日が希望休なら置けない。
        if (nextDate && e.unavailableDates.has(nextDate)) return false;
        // 夜勤専従は希望日以外には一切入れない (希望が空なら夜勤なし)。
        if (e.nightOnly && !e.preferredNightDates.has(day.date)) return false;
        return true;
      });
      if (candidates.length === 0) {
        unfilledNightDays.push(day.date);
        break;
      }
      // 夜勤は全部埋めるのが最優先。上限(nightCap)・希望日の制限はソフト扱いにし、
      // 「埋まらないより超える」を選ぶ。penalty が小さいほど先に選ぶ:
      //   0  : その日を夜勤希望に出している人 (希望は最優先で必ず組む。上限も無視)
      //   1  : 通常ローテ枠 (希望未提出 かつ 上限内)
      //   +2 : 上限超過 (足りないので増やす)
      //   +4 : 希望を出した人を希望外の日に回す (やむを得ないときだけ)
      const penalty = (e: NightEmployee): number => {
        if (e.preferredNightDates.has(day.date)) return 0;
        let p = 1;
        if ((nightCount.get(e.id) ?? 0) >= e.nightCap) p += 2; // 上限超過
        if (e.preferredNightDates.size > 0) p += 4; // 希望を出しているのに今日は希望外
        return p;
      };
      candidates.sort((a, b) => {
        const pa = penalty(a);
        const pb = penalty(b);
        if (pa !== pb) return pa - pb;
        // 同じ優先度なら夜勤回数が少ない人から (負担を分散) → employeeCode。
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
