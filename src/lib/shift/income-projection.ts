/**
 * パート従業員の「年収 130 万円アラート」用、年間見込み年収の計算ロジック。
 *
 * 算出方針 (docs/database-design.md §2.9 準拠):
 *   - 当該年に割当てられた `shifts` × `shift_patterns` の労働時間 (= startTime, endTime, breakMinutes)
 *     を分単位で合算する。
 *   - 時給契約 (employment_contracts.wage_type = HOURLY) の `wage_amount` (= 時給) を
 *     使って金額に変換する。月給契約者は MVP では算定対象外 (`null` を返す)。
 *   - **未来分** (asOf より先のシフト) も計画ベースで含めて「見込み」とする。
 *     実労働ベースの再計算は Phase 2 で attendance_records を使って差し替える。
 *   - `annual_income_cap_yen` (制約) の 80% / 100% で 2 段階アラートを出す:
 *       - 100% 超 → "exceeded"
 *       - 80%  超 → "warn"
 *       - それ以下 → "ok"
 *     上限が未設定 (null) なら閾値 130 万円を既定値として扱う。
 *
 * このモジュールは DB に触らない純粋関数だけを定義する。テストの容易さと、
 * 将来の集計バッチで使い回せることを意図している。
 */

/** 法令上の「扶養範囲」目安の既定値 (円)。実運用では契約ごとに上書き可能。 */
export const DEFAULT_ANNUAL_INCOME_CAP_YEN = 1_300_000;

/** 段階アラート閾値 (上限に対する割合)。 */
export const WARN_RATIO = 0.8;
export const EXCEEDED_RATIO = 1.0;

export type ShiftPatternInput = {
  /** "HH:MM" 形式、`null` の場合は労働時間 0 として扱う (公休 / 有休 / 欠勤など)。 */
  startTime: string | null;
  /** "HH:MM" 形式、`null` の場合は労働時間 0。 */
  endTime: string | null;
  /** 跨ぎなら end は翌日扱い。 */
  crossesMidnight: boolean;
  /** 休憩分。`startTime`/`endTime` から差し引く。 */
  breakMinutes: number;
};

export type ShiftAssignment = {
  /** `YYYY-MM-DD`。年判定に使う。 */
  workDate: string;
  pattern: ShiftPatternInput;
};

export type IncomeProjectionInput = {
  /** 算出対象年 (例 2026)。 */
  year: number;
  /** 時給 (employment_contracts.wage_amount, 時給契約のみ)。月給契約者は null を渡す。 */
  hourlyWageYen: number | null;
  /** 年間年収上限 (shift_constraints.annual_income_cap_yen)。null なら既定 130 万円。 */
  capYen: number | null;
  /** その年に割当てられた全シフト。割当外の日は含めなくてよい。 */
  shifts: ReadonlyArray<ShiftAssignment>;
};

export type IncomeProjectionSeverity = "ok" | "warn" | "exceeded";

export type IncomeProjectionResult = {
  /** 算出対象年。 */
  year: number;
  /** 合計予定労働分 (休憩控除後)。 */
  totalWorkMinutes: number;
  /** 見込み年収 (円, 切り捨て)。時給未設定 (月給契約) なら null。 */
  projectedIncomeYen: number | null;
  /** 適用された上限 (capYen が null なら DEFAULT)。 */
  effectiveCapYen: number;
  /** 上限に対する割合 (0〜)。時給未設定なら null。 */
  ratio: number | null;
  /** アラート段階。projectedIncomeYen が null の場合は "ok"。 */
  severity: IncomeProjectionSeverity;
};

/**
 * "HH:MM" を 0:00 起点の分に変換する。"HH:MM:SS" など余分な末尾は無視する。
 * 不正値は null を返す。
 */
function parseTimeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(mm)) return null;
  if (h < 0 || h > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/**
 * シフトパターン 1 件の実労働分 (休憩控除後) を返す。
 *
 * - `startTime` / `endTime` のいずれかが null なら 0 (例: 公休)。
 * - `crossesMidnight` なら end に 24:00 を足してから差を取る。
 * - 休憩分は単純に差し引く (休憩 > 拘束 はあり得ない前提)。
 */
export function patternWorkMinutes(p: ShiftPatternInput): number {
  if (!p.startTime || !p.endTime) return 0;
  const start = parseTimeToMinutes(p.startTime);
  let end = parseTimeToMinutes(p.endTime);
  if (start === null || end === null) return 0;
  if (p.crossesMidnight) end += 24 * 60;
  const span = end - start;
  if (span <= 0) return 0;
  const work = span - Math.max(0, p.breakMinutes);
  return Math.max(0, work);
}

/**
 * 見込み年収 + アラート段階を返す。月給契約 (hourlyWageYen = null) の場合は
 * 金額計算をスキップし、severity = "ok" を返す。
 */
export function projectAnnualIncome(input: IncomeProjectionInput): IncomeProjectionResult {
  const yearPrefix = `${input.year}-`;
  let totalWorkMinutes = 0;
  for (const s of input.shifts) {
    if (!s.workDate.startsWith(yearPrefix)) continue;
    totalWorkMinutes += patternWorkMinutes(s.pattern);
  }

  const effectiveCapYen = input.capYen ?? DEFAULT_ANNUAL_INCOME_CAP_YEN;

  if (input.hourlyWageYen === null || input.hourlyWageYen <= 0) {
    return {
      year: input.year,
      totalWorkMinutes,
      projectedIncomeYen: null,
      effectiveCapYen,
      ratio: null,
      severity: "ok",
    };
  }

  // 切り捨て: 円未満は出さない (給与計算は別途切り捨て / 切り上げの方針があるため)
  const projectedIncomeYen = Math.floor((totalWorkMinutes / 60) * input.hourlyWageYen);
  const ratio = effectiveCapYen > 0 ? projectedIncomeYen / effectiveCapYen : 0;

  let severity: IncomeProjectionSeverity = "ok";
  if (ratio >= EXCEEDED_RATIO) severity = "exceeded";
  else if (ratio >= WARN_RATIO) severity = "warn";

  return {
    year: input.year,
    totalWorkMinutes,
    projectedIncomeYen,
    effectiveCapYen,
    ratio,
    severity,
  };
}
