/**
 * 打刻データから実労働時間 / 休憩時間を算出するロジック。
 *
 * - すべて分単位で扱い、秒は切り捨てる。表示は分単位 (CLAUDE.md §3.2)。
 * - 進行中 (clockOutAt = null) は実労働 0 とする。途中経過の見積もりは
 *   呼び出し側で行う方針 (集計は確定打刻に対してのみ意味を持つ)。
 * - 進行中の休憩 (breakEndAt = null) は休憩計に含めない。
 * - 夜勤跨ぎは clockOutAt が翌日になるだけなので timestamptz の差で吸収される。
 *
 * 残業 / 深夜時間の按分はシフトパターンとの突合が必要なため、ここでは扱わない。
 * Phase 1-E で別モジュールに分離する。
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
