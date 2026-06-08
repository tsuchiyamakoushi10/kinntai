/**
 * generateDey() の結果を保存層・表示層が使う形に変換する純粋ヘルパ。
 *
 * - toDeyProposals: 記号 (baseSymbol) を DB の shiftPatternId に解決し、共通の保存形
 *   ({employeeId, workDate, shiftPatternId}) にする。v2 の proposedShifts と同形なので
 *   既存の保存シェル (saveDraftRun) にそのまま渡せる。
 * - summarizeDeyCoverage: 過不足の要約 (営業日数 / 充足日数 / 不足日 / 相談員不足日)。
 *
 * DB に触れない。記号→ID の対応表は呼び出し側が用意して渡す。
 */
import type { GenerateDeyResult } from "./generate";

/** 保存形のシフト (v2 の ProposedShift と同形)。 */
export type DeyProposedShift = {
  employeeId: string;
  /** "YYYY-MM-DD" */
  workDate: string;
  shiftPatternId: string;
};

export type ToProposalsResult = {
  proposedShifts: DeyProposedShift[];
  /** DB に対応パターンが無かった記号 (本来は起きない想定。設定漏れ検知用)。 */
  missingSymbols: string[];
};

/**
 * 割当 (記号) を shiftPatternId に解決する。
 * 解決できない記号のセルは proposedShifts から除外し、missingSymbols に記録する。
 */
export function toDeyProposals(
  result: GenerateDeyResult,
  patternIdByName: ReadonlyMap<string, string>,
): ToProposalsResult {
  const proposedShifts: DeyProposedShift[] = [];
  const missing = new Set<string>();
  for (const a of result.assignments) {
    const shiftPatternId = patternIdByName.get(a.baseSymbol);
    if (!shiftPatternId) {
      missing.add(a.baseSymbol);
      continue;
    }
    proposedShifts.push({ employeeId: a.employeeId, workDate: a.date, shiftPatternId });
  }
  return { proposedShifts, missingSymbols: [...missing] };
}

export type DeyCoverageSummary = {
  operatingDays: number;
  /** 午前/午後ともに不足のない営業日数。 */
  filledDays: number;
  /** 午前または午後が不足した営業日 (日付)。 */
  amPmShortfallDays: string[];
  /** 相談員が午前または午後で不足した営業日 (日付)。 */
  counselorShortDays: string[];
};

/** 過不足の要約 (画面の警告表示・run.stats 用)。 */
export function summarizeDeyCoverage(result: GenerateDeyResult): DeyCoverageSummary {
  let operatingDays = 0;
  let filledDays = 0;
  const amPmShortfallDays: string[] = [];
  const counselorShortDays: string[] = [];

  for (const d of result.days) {
    if (!d.operating || !d.coverage) continue;
    operatingDays++;
    const c = d.coverage;
    const short = c.amShortfall > 0 || c.pmShortfall > 0;
    if (short) amPmShortfallDays.push(d.date);
    else filledDays++;
    if (c.counselorAmShort || c.counselorPmShort) counselorShortDays.push(d.date);
  }

  return { operatingDays, filledDays, amPmShortfallDays, counselorShortDays };
}
