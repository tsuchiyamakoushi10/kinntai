/**
 * generateShort() の結果を保存層・表示層が使う形に変換する純粋ヘルパ。
 *
 * - toShortProposals: 記号 (baseSymbol) を DB の shiftPatternId に解決し、共通の保存形
 *   ({employeeId, workDate, shiftPatternId}) にする。dey と同形なので既存の保存シェル
 *   (saveDraftRun) にそのまま渡せる。
 * - summarizeShortCoverage: 過不足の要約 (営業日数 / 充足日数 / 不足日 / 相談員不足日 /
 *   夜勤未充足日)。
 *
 * DB に触れない。記号→ID の対応表は呼び出し側が用意して渡す。
 */
import type { GenerateShortResult } from "./generate";

/** 保存形のシフト (dey の DeyProposedShift と同形)。 */
export type ShortProposedShift = {
  employeeId: string;
  /** "YYYY-MM-DD" */
  workDate: string;
  shiftPatternId: string;
};

export type ToShortProposalsResult = {
  proposedShifts: ShortProposedShift[];
  /** DB に対応パターンが無かった記号 (本来は起きない想定。設定漏れ検知用)。 */
  missingSymbols: string[];
};

/**
 * 割当 (記号) を shiftPatternId に解決する。
 * 解決できない記号のセルは proposedShifts から除外し、missingSymbols に記録する。
 */
export function toShortProposals(
  result: GenerateShortResult,
  patternIdByName: ReadonlyMap<string, string>,
): ToShortProposalsResult {
  const proposedShifts: ShortProposedShift[] = [];
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

export type ShortCoverageSummary = {
  operatingDays: number;
  /** 午前/午後ともに不足のない営業日数。 */
  filledDays: number;
  /** 午前または午後が不足した営業日 (日付)。 */
  amPmShortfallDays: string[];
  /** 相談員が午前または午後で不足した営業日 (日付)。 */
  counselorShortDays: string[];
  /** 夜入を 1 名も置けなかった日 (日付)。最重要警告。 */
  unfilledNightDays: string[];
};

/** 過不足の要約 (画面の警告表示・run.stats 用)。 */
export function summarizeShortCoverage(result: GenerateShortResult): ShortCoverageSummary {
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

  return {
    operatingDays,
    filledDays,
    amPmShortfallDays,
    counselorShortDays,
    unfilledNightDays: [...result.unfilledNightDays],
  };
}
