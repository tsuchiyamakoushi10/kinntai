/**
 * 自動作成結果から警告を集約する。
 *
 * docs/auto-shift-design.md §4.6 のコード一覧と §3.2 の stats.warnings 形式に従う。
 * placement.ts の出力 (PlacementResult) と入力 (GenerateInput) を突き合わせて、
 * 8 種類の警告を組み立てる。
 *
 * placement.ts と分けた理由は、配置ロジックと警告判定で読み手の関心が違うため。
 * 警告は after-the-fact の集計でテストもしやすい。
 */
import { buildMonthDays } from "./constraints";
import type { PlacementResult } from "./placement";
import {
  DEFAULT_MAX_NIGHT_SHIFTS_PER_MONTH,
  type GenerateInput,
  type PatternForGen,
  type Warning,
} from "./types";

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 1 か月 (例 "2026-06") の年部分を取り出す。 */
function yearOf(targetMonth: string): number {
  if (!YM_RE.test(targetMonth)) {
    throw new Error(`invalid YYYY-MM: ${targetMonth}`);
  }
  return Number(targetMonth.slice(0, 4));
}

export function collectWarnings(input: GenerateInput, placement: PlacementResult): Warning[] {
  const warnings: Warning[] = [];

  // ---- QUOTA_UNDERFILLED: 配置できなかった枠 ----
  for (const u of placement.fill.underfilled) {
    warnings.push({
      code: "QUOTA_UNDERFILLED",
      date: u.date,
      shiftPatternCode: u.shiftPatternCode,
      required: u.required,
      filled: u.filled,
    });
  }

  // ---- PREV_MONTH_NIGHT_HANGING: 前月末 NIGHT_IN を引き継げなかった ----
  for (const h of placement.hangingNightOut) {
    warnings.push({
      code: "PREV_MONTH_NIGHT_HANGING",
      employeeId: h.employeeId,
      date: h.date,
    });
  }

  // ---- NIGHT_SHIFT_OVER_LIMIT / TARGET_WORKDAYS_UNREACHED ----
  // placement 後の employee state を見て、上限を越えた件数 / 目標未達の件数を出す
  const empById = new Map(input.employees.map((e) => [e.id, e] as const));
  for (const [empId, state] of placement.employeeStates) {
    const emp = empById.get(empId);
    if (!emp) continue;

    const maxNight = emp.constraint?.maxNightShiftsPerMonth ?? DEFAULT_MAX_NIGHT_SHIFTS_PER_MONTH;
    if (state.nightShiftCount > maxNight) {
      warnings.push({
        code: "NIGHT_SHIFT_OVER_LIMIT",
        employeeId: empId,
        month: input.targetMonth,
        limit: maxNight,
        assigned: state.nightShiftCount,
      });
    }

    // 目標未達: targetMonthlyWorkDays が設定されていて、配置済勤務日数が下回る
    // assignedByDate には OFF も含まれるので、勤務系の件数だけ数え直す
    const target = emp.constraint?.targetMonthlyWorkDays;
    if (target !== null && target !== undefined && target > 0) {
      const workDays = countWorkDays(state.assignedByDate, input.shiftPatterns);
      if (workDays < target) {
        warnings.push({
          code: "TARGET_WORKDAYS_UNREACHED",
          employeeId: empId,
          month: input.targetMonth,
          target,
          assigned: workDays,
        });
      }
    }
  }

  // ---- INCOME_CAP_EXCEEDED: パートの見込み年収が上限超 ----
  // placement で workMinutes を累積しているので、それと時給で評価。
  // 制約に capYen がなければ既定 130 万円。月給契約 (hourlyWageYen=null) はスキップ。
  const year = yearOf(input.targetMonth);
  for (const [empId, state] of placement.employeeStates) {
    if (!state.hourlyWageYen || state.hourlyWageYen <= 0) continue;
    const cap = state.capYen ?? 1_300_000;
    const projected = Math.floor((state.totalWorkMinutesThisYear / 60) * state.hourlyWageYen);
    if (projected > cap) {
      warnings.push({
        code: "INCOME_CAP_EXCEEDED",
        employeeId: empId,
        year,
        capYen: cap,
        projectedYen: projected,
      });
    }
  }

  // ---- UNAVAILABLE_DOW_VIOLATED: 不可曜日に既存 shifts が乗っているケース ----
  // (再実行で保護対象が不可曜日に当たる場合。今回の自動配置自体は不可曜日を除外している)
  const dowByEmp = new Map(
    input.employees.map((e) => [e.id, new Set(e.constraint?.unavailableDaysOfWeek ?? [])]),
  );
  for (const s of input.existingShifts) {
    const dows = dowByEmp.get(s.employeeId);
    if (!dows || dows.size === 0) continue;
    const dow = new Date(`${s.workDate}T00:00:00.000Z`).getUTCDay();
    if (dows.has(dow)) {
      warnings.push({
        code: "UNAVAILABLE_DOW_VIOLATED",
        employeeId: s.employeeId,
        date: s.workDate,
        dayOfWeek: dow,
      });
    }
  }

  // ---- QUOTA_OVERFILLED: 既存 + 提案を合わせた件数が必要人員数を超える ----
  // 主に「保護対象 existingShifts が quota より多く乗っている」ケースで発生する。
  // 同 (date, patternId) の総件数を quota (dayKind 経由) と比較。
  const monthDays = buildMonthDays(input.targetMonth);
  const dayKindByDate = new Map(monthDays.map((d) => [d.date, d.dayKind] as const));
  const quotaByKey = new Map<string, number>();
  for (const q of input.quotas) {
    quotaByKey.set(`${q.shiftPatternId}:${q.dayKind}`, q.requiredCount);
  }
  const countByKey = new Map<string, number>();
  const countSource = [
    ...input.existingShifts.map((s) => ({
      date: s.workDate,
      shiftPatternId: s.shiftPatternId,
    })),
    ...placement.proposedShifts.map((s) => ({
      date: s.workDate,
      shiftPatternId: s.shiftPatternId,
    })),
  ];
  for (const s of countSource) {
    const key = `${s.date}:${s.shiftPatternId}`;
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
  }
  const patternCodeById = new Map(input.shiftPatterns.map((p) => [p.id, p.code] as const));
  const reportedOver = new Set<string>();
  for (const [key, count] of countByKey) {
    const idx = key.indexOf(":");
    const date = key.slice(0, idx);
    const patternId = key.slice(idx + 1);
    const dayKind = dayKindByDate.get(date);
    if (!dayKind) continue;
    const required = quotaByKey.get(`${patternId}:${dayKind}`) ?? 0;
    if (count > required) {
      if (reportedOver.has(key)) continue;
      reportedOver.add(key);
      warnings.push({
        code: "QUOTA_OVERFILLED",
        date,
        shiftPatternCode: patternCodeById.get(patternId) ?? patternId,
        required,
        filled: count,
      });
    }
  }

  // ---- INACTIVE_PATTERN_REFERENCED: 入力 quota が無効化パターンを参照 ----
  // placement.ts の patternById に存在しない shift_pattern_id を quota が指している場合。
  const validPatternIds = new Set(input.shiftPatterns.map((p) => p.id));
  const reported = new Set<string>();
  for (const q of input.quotas) {
    if (validPatternIds.has(q.shiftPatternId)) continue;
    if (reported.has(q.shiftPatternId)) continue;
    reported.add(q.shiftPatternId);
    warnings.push({
      code: "INACTIVE_PATTERN_REFERENCED",
      shiftPatternId: q.shiftPatternId,
    });
  }

  return warnings;
}

/** assignedByDate のうち、勤務系 (WORK / NIGHT_IN) を数える (NIGHT_OUT / OFF は除く)。 */
function countWorkDays(
  assignedByDate: Map<string, string>,
  patterns: ReadonlyArray<PatternForGen>,
): number {
  const patternKind = new Map(patterns.map((p) => [p.id, p.shiftKind] as const));
  let n = 0;
  for (const patternId of assignedByDate.values()) {
    const kind = patternKind.get(patternId);
    if (kind === "WORK" || kind === "NIGHT_IN") n += 1;
  }
  return n;
}
