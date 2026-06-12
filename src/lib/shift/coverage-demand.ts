/**
 * 拠点別 配置基準 (office_coverage_demands) の値と検証。
 *
 * 自動作成 v2 案A (docs/auto-shift-design-v2.md §10)。配置基準を「午前◯名・午後◯名」
 * (＋相談員・夜勤) で日種ごとに持つ。純粋関数として切り出し、サーバアクション / 画面 /
 * 生成ロジックから使う。DB I/O はしない。
 */
import type { DayKind } from "@prisma/client";

/** 1 日種ぶんの配置基準。office_coverage_demands の 1 行に対応 (キーの office/day_kind を除く)。 */
export type CoverageDemandValues = {
  amRequired: number;
  pmRequired: number;
  counselorAmRequired: number;
  counselorPmRequired: number;
  /** 午前/午後のうち看護師(看護職員)で必要な人数。 */
  nurseAmRequired: number;
  nursePmRequired: number;
  /** 午前のうち 8:15 出勤で必要な人数。デイの早出ロジック用。 */
  earlyAmRequired: number;
  nightInRequired: number;
  nightOutRequired: number;
};

/** 編集対象の日種 (順序固定。UI の列順とそろえる)。 */
export const DAY_KINDS: ReadonlyArray<DayKind> = [
  "WEEKDAY",
  "SATURDAY",
  "SUNDAY_HOLIDAY",
  "HOLIDAY",
];

export const DAY_KIND_LABELS: Record<DayKind, string> = {
  WEEKDAY: "平日",
  SATURDAY: "土",
  SUNDAY_HOLIDAY: "日",
  HOLIDAY: "祝",
};

/** 各項目の入力範囲。 */
export const COVERAGE_DEMAND_BOUNDS = {
  amRequired: { min: 0, max: 50 },
  pmRequired: { min: 0, max: 50 },
  counselorAmRequired: { min: 0, max: 10 },
  counselorPmRequired: { min: 0, max: 10 },
  nurseAmRequired: { min: 0, max: 10 },
  nursePmRequired: { min: 0, max: 10 },
  earlyAmRequired: { min: 0, max: 50 },
  nightInRequired: { min: 0, max: 10 },
  nightOutRequired: { min: 0, max: 10 },
} as const;

const FIELD_LABELS: Record<keyof CoverageDemandValues, string> = {
  amRequired: "午前の必要人数",
  pmRequired: "午後の必要人数",
  counselorAmRequired: "午前の相談員人数",
  counselorPmRequired: "午後の相談員人数",
  nurseAmRequired: "午前の看護師人数",
  nursePmRequired: "午後の看護師人数",
  earlyAmRequired: "うち8:15出勤の人数",
  nightInRequired: "夜入の必要数",
  nightOutRequired: "夜明の必要数",
};

export const EMPTY_COVERAGE_DEMAND: CoverageDemandValues = {
  amRequired: 0,
  pmRequired: 0,
  counselorAmRequired: 0,
  counselorPmRequired: 0,
  nurseAmRequired: 0,
  nursePmRequired: 0,
  earlyAmRequired: 0,
  nightInRequired: 0,
  nightOutRequired: 0,
};

/** その日種が営業日か (必要数の合計 > 0)。v2 §8④ と整合。 */
export function isOperatingDay(v: CoverageDemandValues): boolean {
  return v.amRequired + v.pmRequired + v.nightInRequired + v.nightOutRequired > 0;
}

export type ValidateResult =
  | { ok: true; values: CoverageDemandValues }
  | { ok: false; error: string };

/**
 * 配置基準 1 件を検証して正規化する。
 * - 6 項目すべて整数で範囲内。
 * - 相談員必要数が午前/午後の必要人数を超えないこと (相談員も総数に含まれるため)。
 */
export function validateCoverageDemand(input: unknown): ValidateResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "配置基準の形式が不正です。" };
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(COVERAGE_DEMAND_BOUNDS) as (keyof CoverageDemandValues)[];
  const out = {} as CoverageDemandValues;

  for (const key of keys) {
    const raw = record[key];
    if (typeof raw !== "number" || !Number.isInteger(raw)) {
      return { ok: false, error: `${FIELD_LABELS[key]}は整数で入力してください。` };
    }
    const { min, max } = COVERAGE_DEMAND_BOUNDS[key];
    if (raw < min || raw > max) {
      return {
        ok: false,
        error: `${FIELD_LABELS[key]}は ${min}〜${max} の範囲で入力してください。`,
      };
    }
    out[key] = raw;
  }

  if (out.counselorAmRequired > out.amRequired) {
    return { ok: false, error: "午前の相談員人数は午前の必要人数を超えられません。" };
  }
  if (out.counselorPmRequired > out.pmRequired) {
    return { ok: false, error: "午後の相談員人数は午後の必要人数を超えられません。" };
  }
  if (out.earlyAmRequired > out.amRequired) {
    return { ok: false, error: "8:15出勤の人数は午前の必要人数を超えられません。" };
  }
  if (out.nurseAmRequired > out.amRequired) {
    return { ok: false, error: "午前の看護師人数は午前の必要人数を超えられません。" };
  }
  if (out.nursePmRequired > out.pmRequired) {
    return { ok: false, error: "午後の看護師人数は午後の必要人数を超えられません。" };
  }

  return { ok: true, values: out };
}
