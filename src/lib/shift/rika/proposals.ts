/**
 * generateRikaShifts() の結果を保存層・表示層が使う形に変換する純粋ヘルパ。
 *
 * デイ/ショートの proposals と同じ役割:
 *   - toRikaProposals: 勤務記号 (= ShiftPattern.code) を shiftPatternId に解決し、共通の
 *     保存形 ({employeeId, workDate, shiftPatternId}) にする。梨花の記号は CODE 基準なので
 *     name ではなく code で引く点だけがデイ/ショートと異なる。公休・希望休セルも (対応する
 *     ShiftPattern があれば) そのまま保存する = デイと同じく全セルを Shift として持つ。
 *   - summarizeRikaCoverage: 過不足の要約 (営業日数 / 充足日数 / 不足日 / 相談員不在日)。
 *
 * DB に触れない。記号→ID の対応表は呼び出し側が用意して渡す。
 */
import { buildRikaMonth } from "./grid";
import type { RikaGenResult } from "./generate";

export type RikaProposedShift = {
  employeeId: string;
  /** "YYYY-MM-DD" */
  workDate: string;
  shiftPatternId: string;
};

export type ToRikaProposalsResult = {
  proposedShifts: RikaProposedShift[];
  /** DB に対応 ShiftPattern (code) が無かった記号 (設定漏れ検知用)。 */
  missingSymbols: string[];
};

/**
 * 割当 (記号 code) を shiftPatternId に解決する。
 * 解決できない記号のセルは proposedShifts から除外し、missingSymbols に記録する。
 */
export function toRikaProposals(
  result: RikaGenResult,
  patternIdByCode: ReadonlyMap<string, string>,
): ToRikaProposalsResult {
  const proposedShifts: RikaProposedShift[] = [];
  const missing = new Set<string>();
  for (const c of result.cells) {
    const shiftPatternId = patternIdByCode.get(c.symbol);
    if (!shiftPatternId) {
      missing.add(c.symbol);
      continue;
    }
    proposedShifts.push({ employeeId: c.memberId, workDate: c.date, shiftPatternId });
  }
  return { proposedShifts, missingSymbols: [...missing] };
}

export type RikaCoverageSummary = {
  operatingDays: number;
  /** 午前/午後ともに不足のない営業日数。 */
  filledDays: number;
  /** 午前または午後が不足した営業日 (日付)。 */
  understaffedDays: string[];
  /** 相談員が 1 名も勤務しない営業日 (日付)。 */
  counselorMissingDays: string[];
  /** 目安勤務日数に未達の人数。 */
  targetUnreachedCount: number;
};

/** 過不足の要約 (画面の警告表示・run.stats 用)。 */
export function summarizeRikaCoverage(result: RikaGenResult, ym: string): RikaCoverageSummary {
  const operatingDays = buildRikaMonth(ym).filter((d) => d.isBusinessDay).length;

  const understaffedDays: string[] = [];
  const counselorMissingDays: string[] = [];
  let targetUnreachedCount = 0;
  for (const w of result.warnings) {
    if (w.code === "UNDERSTAFFED") understaffedDays.push(w.date);
    else if (w.code === "COUNSELOR_MISSING") counselorMissingDays.push(w.date);
    else if (w.code === "TARGET_UNREACHED") targetUnreachedCount++;
  }

  return {
    operatingDays,
    filledDays: operatingDays - understaffedDays.length,
    understaffedDays,
    counselorMissingDays,
    targetUnreachedCount,
  };
}
