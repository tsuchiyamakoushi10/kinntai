/**
 * 自動作成の配置本体 (greedy)。
 *
 * docs/auto-shift-design.md §4.4 / §4.5 を実装。スコアリングと配置を
 * 1 ファイルにまとめる (MVP の規模なら分割しなくても読める)。
 *
 * 配置の流れ:
 *   1. 当月の (date, pattern, slot_index) を全列挙
 *   2. 配置順は date 昇順 → pattern.sortOrder 昇順
 *   3. 各 slot に対し、配置可能な候補 employee からスコア最大を採用
 *   4. NIGHT_IN を埋めたら翌日に同 employee の NIGHT_OUT も入れる
 *   5. 最後に「所定労働日数を超える未割当日」を OFF で埋める
 *
 * 決定論性: 入力の `seed` から Mulberry32 PRNG を作り、スコア同点時の
 * tiebreak に使う。同じ入力 → 同じ出力。
 */
import { EmploymentType } from "@prisma/client";

import {
  buildMonthDays,
  buildUnavailableDays,
  findOffPattern,
  monthlyRequiredWorkDays,
  resolveHangingNightOut,
  type DayInfo,
} from "./constraints";
import {
  DEFAULT_MAX_NIGHT_SHIFTS_PER_MONTH,
  MAX_CONSECUTIVE_WORK_DAYS,
  type EmployeeForGen,
  type GenerateInput,
  type PatternForGen,
  type ProposedShift,
} from "./types";

// =============================================================================
// PRNG (Mulberry32)
// =============================================================================

/** Mulberry32 PRNG。32bit シードから [0,1) を返す。十分高品質で決定論的。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =============================================================================
// Employee の動的状態 (配置中に更新)
// =============================================================================

type EmployeeState = {
  id: string;
  employmentType: EmploymentType;
  hasPreferredNight: boolean;
  isOnLeave: boolean;
  /** 当月の不可日集合 (前処理で構築済み)。 */
  unavailable: Set<string>;
  /** 当月割当て済みの (date -> shiftPatternId)。同日重複防止と連勤判定に使う。 */
  assignedByDate: Map<string, string>;
  /** 当月配置済の夜勤 (NIGHT_IN) 件数。 */
  nightShiftCount: number;
  /** 当月の所定労働日数 (上限の目安)。これを超えると追加配置をスコア減点。 */
  targetWorkDays: number;
  /** 制約からの月間夜勤上限 (override 許可フラグ込み)。 */
  maxNightShifts: number;
  allowNightShiftOverride: boolean;
  /** パートの年収アラート判定用。 */
  hourlyWageYen: number | null;
  capYen: number | null;
  /** 当年累積労働分 (パートの年収見込みを高速化するため都度更新)。 */
  totalWorkMinutesThisYear: number;
};

function initEmployeeState(
  e: EmployeeForGen,
  unavailable: Set<string>,
  daysInMonth: number,
  hasPreferredNight: boolean,
): EmployeeState {
  const target =
    e.constraint?.targetMonthlyWorkDays ?? monthlyRequiredWorkDays(e.weeklyWorkDays, daysInMonth);
  const maxNight = e.constraint?.maxNightShiftsPerMonth ?? DEFAULT_MAX_NIGHT_SHIFTS_PER_MONTH;
  return {
    id: e.id,
    employmentType: e.employmentType,
    hasPreferredNight,
    isOnLeave: e.isOnLeave,
    unavailable,
    assignedByDate: new Map<string, string>(),
    nightShiftCount: 0,
    targetWorkDays: target,
    maxNightShifts: maxNight,
    allowNightShiftOverride: e.constraint?.allowNightShiftOverride ?? true,
    hourlyWageYen: e.hourlyWageYen,
    capYen: e.constraint?.annualIncomeCapYen ?? null,
    totalWorkMinutesThisYear: 0,
  };
}

// =============================================================================
// スコアリング
// =============================================================================

/** 配置候補のスコア。docs/auto-shift-design.md §4.5 のルールを実装。 */
function scoreCandidate(
  state: EmployeeState,
  pattern: PatternForGen,
  day: DayInfo,
  consecutiveDays: number,
): number {
  let score = 0;

  // 雇用形態別のベース優先 (full_time > contract > part_time)
  if (pattern.shiftKind === "WORK" || pattern.shiftKind === "NIGHT_IN") {
    if (state.employmentType === EmploymentType.FULL_TIME) score += 30;
    else if (state.employmentType === EmploymentType.CONTRACT) score += 15;
    else score += 5;
  } else {
    // NIGHT_OUT 単独配置はスコアリング対象外 (NIGHT_IN とペアで配置)
    score += 0;
  }

  // 夜勤関連
  if (pattern.shiftKind === "NIGHT_IN") {
    if (state.hasPreferredNight) score += 50;
    const remainingTo4 = state.maxNightShifts - 1 - state.nightShiftCount;
    if (remainingTo4 < 0) {
      // 上限超過 (= state.nightShiftCount >= maxNightShifts)
      if (state.allowNightShiftOverride) score -= 80;
      else score -= 10000; // 実質除外
    } else if (remainingTo4 === 0) {
      // ちょうど上限ぎりぎり (4 件目)
      score -= 20;
    }
  }

  // 連続勤務
  if (consecutiveDays + 1 >= MAX_CONSECUTIVE_WORK_DAYS + 1) {
    score -= 200; // 7 日目以降は強制回避
  } else if (consecutiveDays + 1 === MAX_CONSECUTIVE_WORK_DAYS) {
    score -= 40; // 6 日目はやや回避
  }

  // 目標労働日に対する状態
  const assignedDays = state.assignedByDate.size;
  if (assignedDays >= state.targetWorkDays) {
    score -= 60; // 目標を超えてからの追加はあまり嬉しくない
  } else if (assignedDays < state.targetWorkDays * 0.5) {
    score += 20; // 目標の半分未満なら積極配置
  }

  // パートの年収アラート (capYen が設定されているとき)
  if (pattern.workMinutes > 0 && state.hourlyWageYen && state.hourlyWageYen > 0) {
    const cap = state.capYen ?? 1_300_000;
    const projected =
      ((state.totalWorkMinutesThisYear + pattern.workMinutes) / 60) * state.hourlyWageYen;
    if (projected > cap) score -= 120;
    else if (projected > cap * 0.8) score -= 30;
  }

  return score;
}

// =============================================================================
// 連続勤務日数の判定
// =============================================================================

/** date の前日まで何日連続で勤務系が入っているか。0 = 直前は休み or 月初。 */
function consecutiveWorkDays(state: EmployeeState, date: string): number {
  // date の 1 日前から遡って勤務系を数える。
  // 当月内のみ参照 (跨月の連勤チェックは MVP では省略)。
  let count = 0;
  let probe = previousYmd(date);
  while (state.assignedByDate.has(probe)) {
    count += 1;
    probe = previousYmd(probe);
  }
  return count;
}

function previousYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  const yy = String(dt.getUTCFullYear()).padStart(4, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function nextYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = String(dt.getUTCFullYear()).padStart(4, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// =============================================================================
// 配置メイン
// =============================================================================

export type PlacementResult = {
  proposedShifts: ProposedShift[];
  /** 各 slot の充足状況 ([date, patternCode] -> filled / required)。 */
  fill: {
    totalSlots: number;
    filledSlots: number;
    underfilled: Array<{
      date: string;
      shiftPatternId: string;
      shiftPatternCode: string;
      required: number;
      filled: number;
    }>;
  };
  /** 配置後の各従業員状態 (警告集約で使う)。 */
  employeeStates: ReadonlyMap<string, EmployeeState>;
  /** 引き継ぎ NIGHT_OUT で配置できなかった案件 (PREV_MONTH_NIGHT_HANGING)。 */
  hangingNightOut: Array<{ employeeId: string; date: string }>;
};

export function placeShifts(input: GenerateInput): PlacementResult {
  const rng = mulberry32(input.seed);
  const days = buildMonthDays(input.targetMonth);
  const unavailableByEmp = buildUnavailableDays(
    input.employees,
    days,
    input.preferences,
    input.existingShifts,
  );

  const preferredNightByEmp = new Set(
    input.preferences
      .filter((p) => p.preferenceType === "PREFERRED_NIGHT")
      .map((p) => p.employeeId),
  );

  const states = new Map<string, EmployeeState>();
  for (const e of input.employees) {
    if (e.isOnLeave) continue;
    states.set(
      e.id,
      initEmployeeState(
        e,
        unavailableByEmp.get(e.id) ?? new Set(),
        days.length,
        preferredNightByEmp.has(e.id),
      ),
    );
  }

  // 既存 shifts を「配置済」として state に反映 (連勤計算と年収見込みに必要)
  const patternById = new Map(input.shiftPatterns.map((p) => [p.id, p] as const));
  for (const s of input.existingShifts) {
    const st = states.get(s.employeeId);
    if (!st) continue;
    st.assignedByDate.set(s.workDate, s.shiftPatternId);
    const pat = patternById.get(s.shiftPatternId);
    if (pat) {
      if (pat.shiftKind === "NIGHT_IN") st.nightShiftCount += 1;
      if (pat.workMinutes > 0) st.totalWorkMinutesThisYear += pat.workMinutes;
    }
  }

  const proposed: ProposedShift[] = [];
  const hangingNightOut: Array<{ employeeId: string; date: string }> = [];

  // ---- 0. 前月末 NIGHT_IN → 当月 1 日 NIGHT_OUT を最優先で配置 ----
  const hanging = resolveHangingNightOut(
    input.prevMonthNightIn,
    input.shiftPatterns,
    input.targetMonth,
  );
  for (const h of hanging) {
    const st = states.get(h.employeeId);
    if (!st) continue;
    if (h.shiftPatternId === null) {
      hangingNightOut.push({ employeeId: h.employeeId, date: h.workDate });
      continue;
    }
    if (st.unavailable.has(h.workDate) || st.assignedByDate.has(h.workDate)) {
      // 不可日と衝突 / 既に占有 → 警告対象
      hangingNightOut.push({ employeeId: h.employeeId, date: h.workDate });
      continue;
    }
    st.assignedByDate.set(h.workDate, h.shiftPatternId);
    proposed.push({
      employeeId: h.employeeId,
      workDate: h.workDate,
      shiftPatternId: h.shiftPatternId,
    });
  }

  // ---- 1. 各日 × 勤務系 quota の slots を生成 ----
  const dayByDate = new Map(days.map((d) => [d.date, d] as const));
  type Slot = {
    date: string;
    pattern: PatternForGen;
    initialRequired: number;
    remaining: number;
  };
  const nightOutPattern = input.shiftPatterns.find((p) => p.shiftKind === "NIGHT_OUT");

  const slots: Slot[] = [];
  let totalSlots = 0;
  for (const day of days) {
    for (const q of input.quotas) {
      if (q.dayKind !== day.dayKind) continue;
      const pat = patternById.get(q.shiftPatternId);
      if (!pat) continue;
      if (pat.shiftKind !== "WORK" && pat.shiftKind !== "NIGHT_IN") continue;
      if (q.requiredCount <= 0) continue;
      slots.push({
        date: day.date,
        pattern: pat,
        initialRequired: q.requiredCount,
        remaining: q.requiredCount,
      });
      totalSlots += q.requiredCount;
    }
  }
  // 配置順: date 昇順 → pattern.sortOrder 昇順
  slots.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.pattern.sortOrder - b.pattern.sortOrder;
  });

  // ---- 2. greedy 配置 ----
  for (const slot of slots) {
    while (slot.remaining > 0) {
      const candidates: Array<{ state: EmployeeState; score: number }> = [];
      for (const st of states.values()) {
        if (st.isOnLeave) continue;
        if (st.unavailable.has(slot.date)) continue;
        if (st.assignedByDate.has(slot.date)) continue;
        // 夜勤の場合は翌日も使えるか確認 (NIGHT_OUT を入れる)
        if (slot.pattern.shiftKind === "NIGHT_IN") {
          const nextDate = nextYmd(slot.date);
          // 翌日が当月外 (= 月末の夜入) はそれでも配置 (翌月 1 日に prevMonthNightIn を渡す)
          if (dayByDate.has(nextDate)) {
            if (st.assignedByDate.has(nextDate)) continue;
            if (st.unavailable.has(nextDate)) continue;
          }
          if (!nightOutPattern) continue; // NIGHT_OUT パターンなしでは夜勤を組めない
        }
        const consec = consecutiveWorkDays(st, slot.date);
        if (consec >= MAX_CONSECUTIVE_WORK_DAYS) continue; // 7 日目以降を阻止
        const day = dayByDate.get(slot.date);
        if (!day) continue;
        const sc = scoreCandidate(st, slot.pattern, day, consec);
        if (sc <= -1000) continue;
        candidates.push({ state: st, score: sc });
      }
      if (candidates.length === 0) break;
      // スコア最大 → tiebreak は rng で安定化
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return rng() - 0.5;
      });
      const picked = candidates[0]!.state;
      picked.assignedByDate.set(slot.date, slot.pattern.id);
      if (slot.pattern.workMinutes > 0) {
        picked.totalWorkMinutesThisYear += slot.pattern.workMinutes;
      }
      proposed.push({
        employeeId: picked.id,
        workDate: slot.date,
        shiftPatternId: slot.pattern.id,
      });

      // NIGHT_IN なら翌日に NIGHT_OUT を自動配置
      if (slot.pattern.shiftKind === "NIGHT_IN") {
        picked.nightShiftCount += 1;
        const nextDate = nextYmd(slot.date);
        if (dayByDate.has(nextDate) && nightOutPattern) {
          picked.assignedByDate.set(nextDate, nightOutPattern.id);
          if (nightOutPattern.workMinutes > 0) {
            picked.totalWorkMinutesThisYear += nightOutPattern.workMinutes;
          }
          proposed.push({
            employeeId: picked.id,
            workDate: nextDate,
            shiftPatternId: nightOutPattern.id,
          });
        }
      }
      slot.remaining -= 1;
    }
  }

  // 充足状況の集計 (slot.remaining > 0 = 不足)
  const remainingTotal = slots.reduce((acc, s) => acc + s.remaining, 0);
  const filledSlots = totalSlots - remainingTotal;
  const underfilled: PlacementResult["fill"]["underfilled"] = slots
    .filter((s) => s.remaining > 0)
    .map((s) => ({
      date: s.date,
      shiftPatternId: s.pattern.id,
      shiftPatternCode: s.pattern.code,
      required: s.initialRequired,
      filled: s.initialRequired - s.remaining,
    }));

  // ---- 3. 公休埋め (未割当日に OFF を入れる) ----
  const offPattern = findOffPattern(input.shiftPatterns, input.officeId);
  if (offPattern) {
    for (const st of states.values()) {
      if (st.isOnLeave) continue;
      for (const day of days) {
        if (st.assignedByDate.has(day.date)) continue;
        if (st.unavailable.has(day.date)) {
          // 雇用期間外 / 既存占有日は OFF も入れない
          // (UNAVAILABLE_DOW は OFF で埋めても問題ないが、unavailable と
          //  雇用期間外を区別する情報を持っていないので、安全側で何もしない)
          continue;
        }
        st.assignedByDate.set(day.date, offPattern.id);
        proposed.push({
          employeeId: st.id,
          workDate: day.date,
          shiftPatternId: offPattern.id,
        });
      }
    }
  }

  return {
    proposedShifts: proposed,
    fill: {
      totalSlots,
      filledSlots,
      underfilled,
    },
    employeeStates: states,
    hangingNightOut,
  };
}

/** export for tests. */
export type { EmployeeState };
