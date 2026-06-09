/**
 * generateKitchen() の結果を保存層・表示層が使う形に変換する純粋ヘルパ。
 *
 * - toKitchenProposals: 記号 (baseSymbol) を DB の shiftPatternId に解決し、共通の保存形
 *   ({employeeId, workDate, shiftPatternId}) にする (dey/short と同形)。
 * - summarizeKitchenCoverage: 過不足の要約 (営業日数 / 充足日数 / 不足日)。
 *
 * DB に触れない。記号→ID の対応表は呼び出し側が用意して渡す。
 */
import type { GenerateKitchenResult } from "./generate";

export type KitchenProposedShift = {
  employeeId: string;
  /** "YYYY-MM-DD" */
  workDate: string;
  shiftPatternId: string;
};

export type ToKitchenProposalsResult = {
  proposedShifts: KitchenProposedShift[];
  /** DB に対応パターンが無かった記号 (設定漏れ検知用)。 */
  missingSymbols: string[];
};

export function toKitchenProposals(
  result: GenerateKitchenResult,
  patternIdByName: ReadonlyMap<string, string>,
): ToKitchenProposalsResult {
  const proposedShifts: KitchenProposedShift[] = [];
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

export type KitchenCoverageSummary = {
  operatingDays: number;
  /** 必要人数を満たした営業日数。 */
  filledDays: number;
  /** 人員が不足した営業日 (日付)。 */
  shortfallDays: string[];
};

export function summarizeKitchenCoverage(result: GenerateKitchenResult): KitchenCoverageSummary {
  let operatingDays = 0;
  let filledDays = 0;
  const shortfallDays: string[] = [];

  for (const d of result.days) {
    if (!d.operating) continue;
    operatingDays++;
    if (d.shortfall > 0) shortfallDays.push(d.date);
    else filledDays++;
  }

  return { operatingDays, filledDays, shortfallDays };
}
