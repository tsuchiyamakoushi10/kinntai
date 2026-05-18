/**
 * 打刻の状態マシン。
 *
 * AttendanceRecord と BreakRecord の状態から「今どの状態にいるか」と
 * 「次にできる打刻アクション」を導く。Server Action から呼んで遷移可否を
 * 検証する。
 *
 * 状態定義:
 *   - NONE       : 出勤打刻前（今日の attendance_records が無い）
 *   - WORKING    : 出勤済 / 休憩していない
 *   - ON_BREAK   : 休憩中（最新の break_records.break_end_at が null）
 *   - FINISHED   : 退勤済（clock_out_at が入っている）
 */

export type PunchState = "NONE" | "WORKING" | "ON_BREAK" | "FINISHED";

export type PunchAction = "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";

export type AttendanceLike = {
  clockInAt: Date | null;
  clockOutAt: Date | null;
} | null;

export type BreakLike = {
  breakStartAt: Date;
  breakEndAt: Date | null;
};

export function deriveState(attendance: AttendanceLike, breaks: BreakLike[]): PunchState {
  if (!attendance || attendance.clockInAt === null) return "NONE";
  if (attendance.clockOutAt !== null) return "FINISHED";
  const open = breaks.find((b) => b.breakEndAt === null);
  return open ? "ON_BREAK" : "WORKING";
}

const ALLOWED: Record<PunchState, ReadonlyArray<PunchAction>> = {
  NONE: ["CLOCK_IN"],
  WORKING: ["BREAK_START", "CLOCK_OUT"],
  ON_BREAK: ["BREAK_END"],
  // 同じ業務日中に再出勤は許可しない（修正は管理者経由）
  FINISHED: [],
};

export function canPunch(state: PunchState, action: PunchAction): boolean {
  return ALLOWED[state].includes(action);
}

export function allowedActions(state: PunchState): ReadonlyArray<PunchAction> {
  return ALLOWED[state];
}

/**
 * 連打防止: 直近の同種打刻からの最小間隔（ミリ秒）。
 * CLAUDE.md §3.1「打刻直後 3 秒間は同種打刻を抑止」。
 */
export const PUNCH_DEBOUNCE_MS = 3_000;

export type DebounceContext = {
  /** 直近の打刻時刻（同種・別種問わず最新のもの）。 */
  lastPunchAt: Date | null;
  /** 直近の同種打刻のうち最新のもの。 */
  lastSameKindAt: Date | null;
};

export function isDebouncing(
  ctx: DebounceContext,
  now: Date,
  ms: number = PUNCH_DEBOUNCE_MS,
): boolean {
  if (!ctx.lastSameKindAt) return false;
  return now.getTime() - ctx.lastSameKindAt.getTime() < ms;
}

/**
 * 各状態 / アクション向けのユーザー向け文言。専門用語を避ける。
 */
export const ACTION_LABELS: Record<PunchAction, string> = {
  CLOCK_IN: "出勤",
  CLOCK_OUT: "退勤",
  BREAK_START: "休憩開始",
  BREAK_END: "休憩終了",
};

export const STATE_LABELS: Record<PunchState, string> = {
  NONE: "出勤前",
  WORKING: "勤務中",
  ON_BREAK: "休憩中",
  FINISHED: "退勤済",
};
