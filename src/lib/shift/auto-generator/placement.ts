/**
 * 自動作成の配置本体 (フェーズ式)。
 *
 * docs/auto-shift-design-v2.md を実装。v1 の「スコア合算 greedy」を、
 * シフトを組む人間の手順そのままの **優先順位フェーズ** に置き換える。
 *
 * 配置の流れ:
 *   0. 前処理 + 前月末 NIGHT_IN の引き継ぎ (当月 1 日の NIGHT_OUT)
 *   1. 需要を確定 (各日 × 勤務系 quota の slots)
 *   2. 夜勤を先取り (NIGHT_IN を「夜勤希望が残る人」優先で。月の夜勤上限内)  ★案A
 *   3. 正社員(+契約) を配置 (勤務日数=目標に届くよう。目標まで遠い人優先)
 *   4. パートで穴埋め (希望休除外・年収上限を超えない範囲で。勤務少ない人優先)
 *   5. 公休埋め (未割当日に OFF)
 *
 * 全フェーズ共通のハード制約: 希望休/不可日/雇用期間外に入れない、連勤上限を超えない、
 * 1 人 1 日 1 コマ、夜勤を入れたら翌日に夜明けを対で置く。
 *
 * 決定論性: 入力の `seed` から Mulberry32 PRNG を作り、優先順が同点のときの
 * tiebreak に使う (候補ごとに 1 回引いてキー化)。同じ入力 + seed → 同じ出力。
 */
import { EmploymentType } from "@prisma/client";

import {
  buildMonthDays,
  buildUnavailableDays,
  findOffPattern,
  monthlyRequiredWorkDays,
  resolveHangingNightOut,
} from "./constraints";
import {
  DEFAULT_SHIFT_GEN_SETTING,
  type EmployeeForGen,
  type GenerateInput,
  type PatternForGen,
  type ProposedShift,
  type ShiftGenSetting,
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
  isOnLeave: boolean;
  /** 当月の不可日集合 (前処理で構築済み)。 */
  unavailable: Set<string>;
  /** 当月割当て済みの (date -> shiftPatternId)。同日重複防止と連勤判定に使う。 */
  assignedByDate: Map<string, string>;
  /** 当月の勤務日数 (WORK + NIGHT_IN。OFF / NIGHT_OUT は除く)。目標・公平判定に使う。 */
  workDayCount: number;
  /** 当月配置済の夜勤 (NIGHT_IN) 件数。 */
  nightShiftCount: number;
  /** 月の夜勤希望回数 (Phase 2 の優先に使う。0 = 希望なし)。 */
  desiredNightShifts: number;
  /** 当月の所定労働日数 (目標の目安)。 */
  targetWorkDays: number;
  /** 制約からの月間夜勤上限。 */
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
  setting: ShiftGenSetting,
): EmployeeState {
  const target =
    e.constraint?.targetMonthlyWorkDays ?? monthlyRequiredWorkDays(e.weeklyWorkDays, daysInMonth);
  const maxNight = e.constraint?.maxNightShiftsPerMonth ?? setting.defaultMaxNightShiftsPerMonth;
  return {
    id: e.id,
    employmentType: e.employmentType,
    isOnLeave: e.isOnLeave,
    unavailable,
    assignedByDate: new Map<string, string>(),
    workDayCount: 0,
    nightShiftCount: 0,
    desiredNightShifts: e.desiredNightShiftsPerMonth ?? 0,
    targetWorkDays: target,
    maxNightShifts: maxNight,
    allowNightShiftOverride: e.constraint?.allowNightShiftOverride ?? true,
    hourlyWageYen: e.hourlyWageYen,
    capYen: e.constraint?.annualIncomeCapYen ?? null,
    totalWorkMinutesThisYear: 0,
  };
}

// =============================================================================
// 連続勤務日数の判定
// =============================================================================

/** date の前日まで何日連続で勤務系が入っているか。0 = 直前は休み or 月初。 */
function consecutiveWorkDays(state: EmployeeState, date: string): number {
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
  return ymdOf(dt);
}

function nextYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return ymdOf(dt);
}

function ymdOf(dt: Date): string {
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
  /** 各 slot の充足状況。 */
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

type Slot = {
  date: string;
  pattern: PatternForGen;
  initialRequired: number;
  remaining: number;
};

export function placeShifts(input: GenerateInput): PlacementResult {
  const setting = input.setting ?? DEFAULT_SHIFT_GEN_SETTING;
  const maxConsec = setting.maxConsecutiveWorkDays;
  const rng = mulberry32(input.seed);
  const days = buildMonthDays(input.targetMonth);
  const dayByDate = new Map(days.map((d) => [d.date, d] as const));
  const unavailableByEmp = buildUnavailableDays(
    input.employees,
    days,
    input.preferences,
    input.existingShifts,
  );

  const states = new Map<string, EmployeeState>();
  for (const e of input.employees) {
    if (e.isOnLeave) continue;
    states.set(
      e.id,
      initEmployeeState(e, unavailableByEmp.get(e.id) ?? new Set(), days.length, setting),
    );
  }

  const patternById = new Map(input.shiftPatterns.map((p) => [p.id, p] as const));

  // 既存 shifts を「配置済」として state に反映 (連勤計算・勤務日数・年収見込みに必要)
  for (const s of input.existingShifts) {
    const st = states.get(s.employeeId);
    if (!st) continue;
    st.assignedByDate.set(s.workDate, s.shiftPatternId);
    const pat = patternById.get(s.shiftPatternId);
    if (pat) {
      if (pat.shiftKind === "NIGHT_IN") st.nightShiftCount += 1;
      if (pat.shiftKind === "WORK" || pat.shiftKind === "NIGHT_IN") st.workDayCount += 1;
      if (pat.workMinutes > 0) st.totalWorkMinutesThisYear += pat.workMinutes;
    }
  }

  const proposed: ProposedShift[] = [];
  const hangingNightOut: Array<{ employeeId: string; date: string }> = [];
  const nightOutPattern = input.shiftPatterns.find((p) => p.shiftKind === "NIGHT_OUT");

  // ---- 配置の共通処理 ----
  const place = (st: EmployeeState, date: string, pattern: PatternForGen): void => {
    st.assignedByDate.set(date, pattern.id);
    if (pattern.shiftKind === "WORK" || pattern.shiftKind === "NIGHT_IN") st.workDayCount += 1;
    if (pattern.workMinutes > 0) st.totalWorkMinutesThisYear += pattern.workMinutes;
    proposed.push({ employeeId: st.id, workDate: date, shiftPatternId: pattern.id });
  };

  /** 勤務系で「その日に入れるか」(休み系/不可日/連勤上限/重複を弾く)。 */
  const canWork = (st: EmployeeState, date: string): boolean => {
    if (st.isOnLeave) return false;
    if (st.unavailable.has(date)) return false;
    if (st.assignedByDate.has(date)) return false;
    if (consecutiveWorkDays(st, date) >= maxConsec) return false;
    return true;
  };

  // ---- Phase 0: 前月末 NIGHT_IN → 当月 1 日 NIGHT_OUT を最優先で配置 ----
  const hanging = resolveHangingNightOut(
    input.prevMonthNightIn,
    input.shiftPatterns,
    input.targetMonth,
  );
  for (const h of hanging) {
    const st = states.get(h.employeeId);
    if (!st) continue;
    if (
      h.shiftPatternId === null ||
      st.unavailable.has(h.workDate) ||
      st.assignedByDate.has(h.workDate)
    ) {
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

  // ---- Phase 1: 需要を確定 (各日 × 勤務系 quota の slots) ----
  const existingCountByKey = new Map<string, number>();
  for (const s of input.existingShifts) {
    const k = `${s.workDate}:${s.shiftPatternId}`;
    existingCountByKey.set(k, (existingCountByKey.get(k) ?? 0) + 1);
  }

  const nightSlots: Slot[] = [];
  const workSlots: Slot[] = [];
  let totalSlots = 0;
  for (const day of days) {
    for (const q of input.quotas) {
      if (q.dayKind !== day.dayKind) continue;
      const pat = patternById.get(q.shiftPatternId);
      if (!pat) continue;
      if (pat.shiftKind !== "WORK" && pat.shiftKind !== "NIGHT_IN") continue;
      if (q.requiredCount <= 0) continue;
      const alreadyFilled = existingCountByKey.get(`${day.date}:${pat.id}`) ?? 0;
      const remaining = Math.max(0, q.requiredCount - alreadyFilled);
      const slot: Slot = {
        date: day.date,
        pattern: pat,
        initialRequired: q.requiredCount,
        remaining,
      };
      (pat.shiftKind === "NIGHT_IN" ? nightSlots : workSlots).push(slot);
      totalSlots += q.requiredCount;
    }
  }
  const bySlotOrder = (a: Slot, b: Slot): number => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.pattern.sortOrder - b.pattern.sortOrder;
  };
  nightSlots.sort(bySlotOrder);
  workSlots.sort(bySlotOrder);

  // ---- Phase 2: 夜勤を先取り (案A) ----
  // 夜勤希望が残る人を優先。月の夜勤上限内で、上限を超える override は最終手段。
  for (const slot of nightSlots) {
    while (slot.remaining > 0) {
      type NightCand = {
        st: EmployeeState;
        desiredRemaining: number;
        over: boolean;
        tiebreak: number;
      };
      const cands: NightCand[] = [];
      for (const st of states.values()) {
        if (!canWork(st, slot.date)) continue;
        // 翌日に夜明けを置けるか (当月外の月末夜入は許容して翌月へ引き継ぐ)
        const nextDate = nextYmd(slot.date);
        if (
          dayByDate.has(nextDate) &&
          (st.assignedByDate.has(nextDate) || st.unavailable.has(nextDate))
        ) {
          continue;
        }
        if (!nightOutPattern) continue;
        const over = st.nightShiftCount >= st.maxNightShifts;
        if (over && !st.allowNightShiftOverride) continue;
        cands.push({
          st,
          // 希望を満たした人どうしは 0 で同列にし、超過分は夜勤回数で公平化する
          // (低い希望を超えた人を不当に優先しないよう 0 でクランプ)。
          desiredRemaining: Math.max(0, st.desiredNightShifts - st.nightShiftCount),
          over,
          tiebreak: rng(),
        });
      }
      // 上限内の人を優先。全員上限超なら override 可の人だけで埋める。
      const within = cands.filter((c) => !c.over);
      const pool = within.length > 0 ? within : cands;
      if (pool.length === 0) break;
      pool.sort(
        (a, b) =>
          b.desiredRemaining - a.desiredRemaining || // 夜勤希望が残る人を優先
          a.st.nightShiftCount - b.st.nightShiftCount || // 夜勤が少ない人 (偏り防止)
          a.tiebreak - b.tiebreak,
      );
      const picked = pool[0]!.st;
      place(picked, slot.date, slot.pattern);
      picked.nightShiftCount += 1;
      const nextDate = nextYmd(slot.date);
      if (dayByDate.has(nextDate) && nightOutPattern) {
        place(picked, nextDate, nightOutPattern);
        picked.workDayCount -= 1; // 夜明けは勤務日数に数えない (place が +1 した分を戻す)
      }
      slot.remaining -= 1;
    }
  }

  // ---- Phase 3: 正社員(+契約) を配置 ----
  // 目標まで遠い人を優先 (皆が契約日数に近づくよう公平に)。正社員 → 契約 の順。
  for (const slot of workSlots) {
    while (slot.remaining > 0) {
      type WorkCand = {
        st: EmployeeState;
        empRank: number;
        targetRemaining: number;
        tiebreak: number;
      };
      const cands: WorkCand[] = [];
      for (const st of states.values()) {
        if (
          st.employmentType !== EmploymentType.FULL_TIME &&
          st.employmentType !== EmploymentType.CONTRACT
        ) {
          continue;
        }
        if (!canWork(st, slot.date)) continue;
        cands.push({
          st,
          empRank: st.employmentType === EmploymentType.FULL_TIME ? 0 : 1,
          targetRemaining: st.targetWorkDays - st.workDayCount,
          tiebreak: rng(),
        });
      }
      if (cands.length === 0) break;
      cands.sort(
        (a, b) =>
          a.empRank - b.empRank || // 正社員を契約より先
          b.targetRemaining - a.targetRemaining || // 目標まで遠い人を優先 (達した人は後回し)
          a.st.workDayCount - b.st.workDayCount || // 勤務日数が少ない人
          a.tiebreak - b.tiebreak,
      );
      place(cands[0]!.st, slot.date, slot.pattern);
      slot.remaining -= 1;
    }
  }

  // ---- Phase 4: パートで穴埋め ----
  // 希望休は canWork で除外済み。年収上限を超えない範囲で、勤務日数が少ない人を優先。
  for (const slot of workSlots) {
    while (slot.remaining > 0) {
      type PartCand = { st: EmployeeState; over: boolean; room: number; tiebreak: number };
      const cands: PartCand[] = [];
      for (const st of states.values()) {
        if (st.employmentType !== EmploymentType.PART_TIME) continue;
        if (!canWork(st, slot.date)) continue;
        const cap = st.capYen ?? setting.defaultAnnualIncomeCapYen;
        const wage = st.hourlyWageYen ?? 0;
        const projected =
          wage > 0 ? ((st.totalWorkMinutesThisYear + slot.pattern.workMinutes) / 60) * wage : 0;
        cands.push({ st, over: projected > cap, room: cap - projected, tiebreak: rng() });
      }
      if (cands.length === 0) break;
      // 上限を超えない人を優先。全員超える場合のみ最終手段で配置 (人員確保 > 年収厳守)。
      const within = cands.filter((c) => !c.over);
      const pool = within.length > 0 ? within : cands;
      pool.sort(
        (a, b) =>
          a.st.workDayCount - b.st.workDayCount || // 勤務日数が少ない人 (公平分散)
          b.room - a.room || // 年収に余裕がある人
          a.tiebreak - b.tiebreak,
      );
      place(pool[0]!.st, slot.date, slot.pattern);
      slot.remaining -= 1;
    }
  }

  // 充足状況の集計
  const allSlots = [...nightSlots, ...workSlots];
  const remainingTotal = allSlots.reduce((acc, s) => acc + s.remaining, 0);
  const filledSlots = totalSlots - remainingTotal;
  const underfilled: PlacementResult["fill"]["underfilled"] = allSlots
    .filter((s) => s.remaining > 0)
    .map((s) => ({
      date: s.date,
      shiftPatternId: s.pattern.id,
      shiftPatternCode: s.pattern.code,
      required: s.initialRequired,
      filled: s.initialRequired - s.remaining,
    }))
    .sort((a, b) =>
      a.date !== b.date
        ? a.date < b.date
          ? -1
          : 1
        : a.shiftPatternCode.localeCompare(b.shiftPatternCode),
    );

  // ---- Phase 5: 公休埋め (未割当日に OFF) ----
  const offPattern = findOffPattern(input.shiftPatterns, input.officeId);
  if (offPattern) {
    for (const st of states.values()) {
      if (st.isOnLeave) continue;
      for (const day of days) {
        if (st.assignedByDate.has(day.date)) continue;
        // 雇用期間外 / 既存占有日は OFF も入れない (unavailable と区別する情報が無いため安全側)
        if (st.unavailable.has(day.date)) continue;
        st.assignedByDate.set(day.date, offPattern.id);
        proposed.push({ employeeId: st.id, workDate: day.date, shiftPatternId: offPattern.id });
      }
    }
  }

  return {
    proposedShifts: proposed,
    fill: { totalSlots, filledSlots, underfilled },
    employeeStates: states,
    hangingNightOut,
  };
}

/** export for tests. */
export type { EmployeeState };
