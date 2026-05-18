/**
 * 打刻データから実労働時間 / 休憩時間 / 残業 / 深夜時間を算出するロジック。
 *
 * - すべて分単位で扱い、秒は切り捨てる。表示は分単位 (CLAUDE.md §3.2)。
 * - 進行中 (clockOutAt = null) は実労働 0 とする。途中経過の見積もりは
 *   呼び出し側で行う方針 (集計は確定打刻に対してのみ意味を持つ)。
 * - 進行中の休憩 (breakEndAt = null) は休憩計に含めない。
 * - 夜勤跨ぎは clockOutAt が翌日になるだけなので timestamptz の差で吸収される。
 *
 * 残業: 簡易ロジックとして「日の実労働 - 所定労働時間 (dailyWorkHours)」のうち
 * 0 未満は切り捨て。週 40h 縛り (法定外残業) は MVP では扱わない。
 * 深夜: JST 22:00-翌5:00 の重なり分。休憩中は深夜にもカウントしない。
 */

export type AttendanceInput = {
  clockInAt: Date | null;
  clockOutAt: Date | null;
  breakRecords: ReadonlyArray<{ breakStartAt: Date; breakEndAt: Date | null }>;
};

export type AttendanceSummary = {
  /** 拘束時間 (退勤 - 出勤)。進行中は 0。 */
  spanMinutes: number;
  /** 休憩計 (確定休憩のみ)。 */
  breakMinutes: number;
  /** 実労働分 = max(0, spanMinutes - breakMinutes)。進行中は 0。 */
  workMinutes: number;
};

function diffMinutes(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 60_000);
}

export function summarize(a: AttendanceInput): AttendanceSummary {
  if (!a.clockInAt || !a.clockOutAt) {
    // 退勤未済は実労働を確定させない。休憩計は参考値として返さず 0 にする。
    return { spanMinutes: 0, breakMinutes: 0, workMinutes: 0 };
  }
  const span = diffMinutes(a.clockInAt, a.clockOutAt);
  const breakMinutes = a.breakRecords.reduce((acc, b) => {
    if (!b.breakEndAt) return acc; // 進行中休憩は除外
    return acc + Math.max(0, diffMinutes(b.breakStartAt, b.breakEndAt));
  }, 0);
  const span0 = Math.max(0, span);
  return {
    spanMinutes: span0,
    breakMinutes,
    workMinutes: Math.max(0, span0 - breakMinutes),
  };
}

/**
 * 分を "H:MM" にフォーマット。マイナスや 0 は "0:00"。
 * 一覧の数値カラム向け (画面表示は呼び出し側で空欄/—に置き換える)。
 */
export function formatMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0:00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * 所定労働時間を超えた分 (= 所定外残業)。1 日単位の素朴な計算。
 * 週 40h 縛りや法定 / 所定の区別は MVP では行わない。
 */
export function overtimeMinutes(workMinutes: number, dailyWorkHours: number): number {
  if (!Number.isFinite(workMinutes) || workMinutes <= 0) return 0;
  if (!Number.isFinite(dailyWorkHours) || dailyWorkHours <= 0) return 0;
  const expected = Math.round(dailyWorkHours * 60);
  return Math.max(0, workMinutes - expected);
}

/**
 * `[from, to)` のうち JST 22:00 - 翌 5:00 と重なる分数。
 *
 * JST 22:00 = UTC 13:00、JST 翌 5:00 = UTC 20:00 なので、UTC 日付ごとに
 * 13:00-20:00 の 7 時間窓を切り出し、`[from, to)` との共通区間を合計する。
 * 夜勤跨ぎ (例: JST 16:30 出勤 → 翌 8:30 退勤) でも、2 日分の窓に
 * またがって正しく加算される。
 */
export function nightOverlapMinutes(from: Date, to: Date): number {
  if (!(from instanceof Date) || !(to instanceof Date)) return 0;
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  if (toMs <= fromMs) return 0;

  // 走査開始日は `from` の UTC 暦日。窓は最大 [d-1 13:00, d 20:00) も触りうるので、
  // 安全側に 1 日前から始める。
  const startCursor = new Date(fromMs);
  startCursor.setUTCHours(0, 0, 0, 0);
  startCursor.setUTCDate(startCursor.getUTCDate() - 1);

  let total = 0;
  for (
    const cursor = new Date(startCursor);
    cursor.getTime() < toMs;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const windowStart = new Date(cursor);
    windowStart.setUTCHours(13, 0, 0, 0); // JST 22:00
    const windowEnd = new Date(cursor);
    windowEnd.setUTCHours(20, 0, 0, 0); // JST 翌 5:00
    const overlapStart = Math.max(fromMs, windowStart.getTime());
    const overlapEnd = Math.min(toMs, windowEnd.getTime());
    if (overlapEnd > overlapStart) {
      total += Math.floor((overlapEnd - overlapStart) / 60_000);
    }
  }
  return total;
}

/**
 * 1 日分の深夜労働時間 (分)。拘束時間内の深夜帯から、休憩中の深夜帯を差し引く。
 */
export function nightMinutes(a: AttendanceInput): number {
  if (!a.clockInAt || !a.clockOutAt) return 0;
  const spanNight = nightOverlapMinutes(a.clockInAt, a.clockOutAt);
  const breakNight = a.breakRecords.reduce((acc, b) => {
    if (!b.breakEndAt) return acc;
    return acc + nightOverlapMinutes(b.breakStartAt, b.breakEndAt);
  }, 0);
  return Math.max(0, spanNight - breakNight);
}
