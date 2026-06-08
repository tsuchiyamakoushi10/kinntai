/**
 * 月次シフト自動作成の公開 API。
 *
 * docs/auto-shift-design.md §4 を実装。サーバアクション層からはこのモジュールの
 * `generateMonthlyShifts` だけを呼ぶ。DB 入出力はすべて呼び出し側が担う。
 *
 * 注意:
 *   - 入力データ (employees / shiftPatterns / quotas など) は呼び出し側で
 *     拠点 × 当月でフィルタしてから渡す。本モジュールでは再フィルタしない。
 *   - 出力 `removedShifts` は本モジュールでは常に空配列を返す。
 *     「前回 run 由来で今回配置されなかったセル」の判定は run のスナップショットが
 *     必要で、サーバアクション側で diff を算出するほうが整合する。
 *   - 結果は完全に決定論的: 同じ入力 + seed → 同じ proposedShifts / warnings。
 */
import { placeShifts } from "./placement";
import type { GenerateInput, GenerateOutput, RunStats } from "./types";
import { collectWarnings } from "./warnings";

export function generateMonthlyShifts(input: GenerateInput): GenerateOutput {
  const startedAt = Date.now();

  const placement = placeShifts(input);
  const warnings = collectWarnings(input, placement);

  const stats: RunStats = {
    input: {
      employees: input.employees.filter((e) => !e.isOnLeave).length,
      workingDaysInMonth: daysInTargetMonth(input.targetMonth),
      holidays: input.holidays,
    },
    fill: {
      totalSlots: placement.fill.totalSlots,
      filledSlots: placement.fill.filledSlots,
      rate:
        placement.fill.totalSlots === 0
          ? 1
          : placement.fill.filledSlots / placement.fill.totalSlots,
    },
    warnings,
    elapsedMs: Date.now() - startedAt,
    seed: input.seed,
  };

  return {
    proposedShifts: placement.proposedShifts,
    removedShifts: [],
    warnings,
    stats,
  };
}

function daysInTargetMonth(ym: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) {
    throw new Error(`invalid YYYY-MM: ${ym}`);
  }
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// 型を外から使いやすいよう re-export
export type {
  GenerateInput,
  GenerateOutput,
  Warning,
  WarningCode,
  RunStats,
  ProposedShift,
  EmployeeForGen,
  ShiftConstraintForGen,
  PatternForGen,
  QuotaForGen,
  PreferenceForGen,
  ExistingShift,
  PrevMonthNightIn,
  ShiftGenSetting,
} from "./types";

// 拠点別設定の既定値 (画面・サーバアクションから参照)
export { DEFAULT_SHIFT_GEN_SETTING } from "./types";
