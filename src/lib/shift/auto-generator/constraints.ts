/**
 * 自動作成の前処理。
 *
 * docs/auto-shift-design.md §4.4 の「前処理」「必要量算出」を担う:
 *   - 当月の日付一覧 + DayKind を作る
 *   - 各従業員ごとの不可日集合 (不可曜日 / 希望休 / 既存占有 / 雇用期間外)
 *   - 前月末 NIGHT_IN → 当月 1 日 NIGHT_OUT の引き継ぎ判定
 *   - 月間所定労働日数の算出
 *
 * このモジュールも DB に触らない。入力は types.ts の素の値。
 */
import { DayKind, type ShiftKind } from "@prisma/client";

import { dayKindFor, holidaysInMonth } from "@/lib/calendar/holidays";

import type {
  EmployeeForGen,
  ExistingShift,
  PatternForGen,
  PreferenceForGen,
  PrevMonthNightIn,
} from "./types";

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export type DayInfo = {
  /** "YYYY-MM-DD" */
  date: string;
  dayKind: DayKind;
  /** 0=Sun ... 6=Sat (JST) */
  dayOfWeek: number;
  isHoliday: boolean;
};

/**
 * 当月の日付一覧 + 各日の DayKind を返す。
 * holidays は呼び出し側で `holidaysInMonth(ym)` の結果を渡してもよいが、
 * 内部でも再取得して整合性を担保する。
 */
export function buildMonthDays(targetMonth: string): DayInfo[] {
  if (!YM_RE.test(targetMonth)) {
    throw new Error(`invalid YYYY-MM: ${targetMonth}`);
  }
  const [yStr, mStr] = targetMonth.split("-") as [string, string];
  const year = Number(yStr);
  const month = Number(mStr); // 1-12
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const holidaySet = new Set(holidaysInMonth(targetMonth));

  const out: DayInfo[] = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    const dd = String(d).padStart(2, "0");
    const date = `${targetMonth}-${dd}`;
    // 0:00 UTC を JST 9:00 として扱い、Date#getUTCDay は JST 0:00 と一致する曜日を返す
    const dow = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const dayKind = dayKindFor(date);
    out.push({
      date,
      dayKind,
      dayOfWeek: dow,
      isHoliday: holidaySet.has(date),
    });
  }
  return out;
}

/**
 * 従業員ごとの「当月の不可日集合」。
 *
 * 含まれるのは:
 *   - 不可曜日に該当する日付
 *   - REQUESTED_OFF / UNAVAILABLE な preference の日付
 *   - existingShifts で既に占有されている日付
 *   - 入社日前日以前 / 退職日翌日以降の日付
 *
 * 戻り値は `Map<employeeId, Set<workDate>>`。検索を O(1) に保つため Set で持つ。
 */
export function buildUnavailableDays(
  employees: ReadonlyArray<EmployeeForGen>,
  days: ReadonlyArray<DayInfo>,
  preferences: ReadonlyArray<PreferenceForGen>,
  existingShifts: ReadonlyArray<ExistingShift>,
): Map<string, Set<string>> {
  const byEmployee = new Map<string, Set<string>>();
  for (const e of employees) {
    byEmployee.set(e.id, new Set<string>());
  }

  // 不可曜日 + 雇用期間外
  for (const e of employees) {
    const set = byEmployee.get(e.id)!;
    const dowSet = new Set(e.constraint?.unavailableDaysOfWeek ?? []);
    for (const d of days) {
      if (dowSet.has(d.dayOfWeek)) set.add(d.date);
      if (d.date < e.joinedOn) set.add(d.date);
      if (e.retiredOn !== null && d.date > e.retiredOn) set.add(d.date);
    }
  }

  // 希望休 / 勤務不可
  for (const p of preferences) {
    if (p.preferenceType !== "REQUESTED_OFF" && p.preferenceType !== "UNAVAILABLE") {
      continue;
    }
    if (!YMD_RE.test(p.targetDate)) continue;
    const set = byEmployee.get(p.employeeId);
    if (set) set.add(p.targetDate);
  }

  // 既存占有 (手動入力 + 保護対象)
  for (const s of existingShifts) {
    const set = byEmployee.get(s.employeeId);
    if (set) set.add(s.workDate);
  }

  return byEmployee;
}

/**
 * 前月末日 NIGHT_IN → 当月 1 日 NIGHT_OUT の引き継ぎ。
 *
 * 前月最終日に NIGHT_IN を持つ従業員に対し、当月 1 日の NIGHT_OUT パターンを返す。
 * 該当する NIGHT_OUT パターンが見つからない場合は null (呼び出し側で警告にする)。
 */
export function resolveHangingNightOut(
  prevMonthNightIn: ReadonlyArray<PrevMonthNightIn>,
  patterns: ReadonlyArray<PatternForGen>,
  targetMonth: string,
): Array<{ employeeId: string; workDate: string; shiftPatternId: string | null }> {
  if (!YM_RE.test(targetMonth)) {
    throw new Error(`invalid YYYY-MM: ${targetMonth}`);
  }
  const firstDay = `${targetMonth}-01`;
  // NIGHT_OUT パターン (拠点固有を優先、なければ共通)。
  // 実装では複数 NIGHT_OUT がある場合もありえるが、自動作成では最初の 1 つを採用。
  // 拠点別の NIGHT_OUT 切り替えが必要になったら office_id 引数を追加する。
  const nightOut = patterns.find((p) => p.shiftKind === "NIGHT_OUT");
  return prevMonthNightIn.map((n) => ({
    employeeId: n.employeeId,
    workDate: firstDay,
    shiftPatternId: nightOut ? nightOut.id : null,
  }));
}

/**
 * 月間所定労働日数の算出 (docs/auto-shift-design.md §7 論点 F の決定値)。
 *
 * 数式: `weeklyWorkDays * 月の週数(切り上げ)`
 *   - 月の週数 = ceil(daysInMonth / 7)
 *   - 例: 30 日の月で週 5 日勤務 → ceil(30/7)=5 → 25 日
 *   - 例: 30 日の月で週 3 日勤務 → 15 日
 *
 * 雇用契約の所定値より小さくなるケースもあるが、MVP では簡易式で十分。
 * Phase 2 で雇用契約と突き合わせる。
 */
export function monthlyRequiredWorkDays(weeklyWorkDays: number, daysInMonth: number): number {
  if (weeklyWorkDays <= 0) return 0;
  const weeks = Math.ceil(daysInMonth / 7);
  // 切り上げではなく weeks 倍してから四捨五入気味に。
  // weeklyWorkDays が 3.5 のような小数値の場合に丸める。
  return Math.round(weeklyWorkDays * weeks);
}

/**
 * shiftKind が「勤務系」(quota が定義されるカテゴリ) か。
 * 公休 / 有休 / 欠勤 / 希望休は配置パスでは扱わず、公休埋めは別パスで処理する。
 */
export function isWorkShiftKind(kind: ShiftKind): boolean {
  return kind === "WORK" || kind === "NIGHT_IN" || kind === "NIGHT_OUT";
}

/**
 * 公休パターン (`shiftKind = OFF`) を返す。複数あれば拠点固有を優先、なければ共通。
 * 公休埋めパスで使う。見つからなければ null。
 */
export function findOffPattern(
  patterns: ReadonlyArray<PatternForGen>,
  officeId: string,
): PatternForGen | null {
  const localFirst = [...patterns].sort((a, b) => {
    if (a.officeId === officeId && b.officeId !== officeId) return -1;
    if (a.officeId !== officeId && b.officeId === officeId) return 1;
    return a.sortOrder - b.sortOrder;
  });
  return localFirst.find((p) => p.shiftKind === "OFF") ?? null;
}
