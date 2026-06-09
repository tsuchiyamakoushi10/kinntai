/**
 * 拠点別シフト自動作成 設定 (office_shift_settings) の値と検証。
 *
 * 自動作成 v2 (docs/auto-shift-design-v2.md §4.1) で外出しした調整値。
 * 純粋関数として切り出し、サーバアクション (admin/shift-settings) と画面の双方から使う。
 */

/** 編集対象の設定値 (連勤上限 / 月の夜勤上限の既定 / パート年収上限の既定)。 */
export type OfficeShiftSettingValues = {
  /** 連勤上限 (これ以上は配置しない)。 */
  maxConsecutiveWorkDays: number;
  /** 月の夜勤上限の既定値 (個人制約で上書き可)。 */
  defaultMaxNightShiftsPerMonth: number;
  /** パート年収上限の既定値 (個人制約で上書き可)。 */
  defaultAnnualIncomeCapYen: number;
};

/** 各項目の入力範囲 (UI の min/max と検証で共有)。 */
export const OFFICE_SHIFT_SETTING_BOUNDS = {
  /** 連勤上限。1 日未満や 2 週間超は実務的にあり得ないため弾く。 */
  maxConsecutiveWorkDays: { min: 1, max: 14 },
  /** 月の夜勤上限の既定値。0 (夜勤なし拠点) 〜 月日数上限。 */
  defaultMaxNightShiftsPerMonth: { min: 0, max: 31 },
  /** パート年収上限の既定値 (円)。社保の壁 (130 万) 前後を中心に広めに許容。 */
  defaultAnnualIncomeCapYen: { min: 0, max: 9_999_999 },
} as const;

/** 既定値 (office_shift_settings の行が無い拠点に適用)。 */
export const OFFICE_SHIFT_SETTING_DEFAULTS: OfficeShiftSettingValues = {
  maxConsecutiveWorkDays: 6,
  defaultMaxNightShiftsPerMonth: 5,
  defaultAnnualIncomeCapYen: 1_300_000,
};

export type ValidateResult =
  | { ok: true; values: OfficeShiftSettingValues }
  | { ok: false; error: string };

const FIELD_LABELS: Record<keyof OfficeShiftSettingValues, string> = {
  maxConsecutiveWorkDays: "連勤の上限日数",
  defaultMaxNightShiftsPerMonth: "1 か月の夜勤回数の上限",
  defaultAnnualIncomeCapYen: "パートの年収上限",
};

/**
 * 設定値を検証して正規化する。
 *
 * - 3 項目すべて「整数」で、各項目の範囲内であること。
 * - 不明なキーや欠落、非数値は弾く。
 *
 * DB I/O はしない。サーバアクションはこの結果を upsert に渡すだけにする。
 */
export function validateOfficeShiftSetting(input: unknown): ValidateResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "設定の形式が不正です。" };
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(OFFICE_SHIFT_SETTING_BOUNDS) as (keyof OfficeShiftSettingValues)[];
  const out = {} as OfficeShiftSettingValues;

  for (const key of keys) {
    const raw = record[key];
    if (typeof raw !== "number" || !Number.isInteger(raw)) {
      return { ok: false, error: `${FIELD_LABELS[key]}は整数で入力してください。` };
    }
    const { min, max } = OFFICE_SHIFT_SETTING_BOUNDS[key];
    if (raw < min || raw > max) {
      return {
        ok: false,
        error: `${FIELD_LABELS[key]}は ${min}〜${max} の範囲で入力してください。`,
      };
    }
    out[key] = raw;
  }

  return { ok: true, values: out };
}
