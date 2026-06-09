/**
 * 拠点コード → 自動生成の種別・設定の対応 (配線の一元化)。
 *
 * 自動生成 v2 (docs/auto-shift-design-v2.md) は拠点ごとに専用パスを使い分ける。生成の実体
 * (サーバアクション) とプレビュー (画面) の両方が「この拠点はどの生成器か」を知る必要があるため、
 * 二重定義を避けてここに集約する。
 *
 *   - デイ系 (generateDey): 午前/午後フィルのみ (夜勤なし)。例: デイサービス。
 *   - ショート系 (generateShort): 夜勤先取り + 午前/午後フィル。例: ショートステイ、ナーシングホーム。
 *     NRS(ナーシングホーム)はショートと同じ構造(夜勤あり)なので生成器を流用し、記号だけ差し替える
 *     (ショ日→日勤、ショ短A→日勤、ショ短Aの代わりも日勤。半日A/公休/夜入/夜明は共通)。
 *   - 厨房 (generateKitchen): 固定ロスター。厨房記号(0/0)は配置基準モデルに乗らないため専用。
 *   - 梨花 (generateRikaShifts): 午前/午後 + gain最大化。営業日固定(月火木金)・記号(梨2〜5)が
 *     特殊なため専用生成。ただし画面・保存・表示はデイ/ショートと同じパイプラインに乗せる
 *     (2026-06-09 統合)。旧 専用画面 /admin/shifts/rika は統合までのつなぎとして残す。
 *   - それ以外: 専用生成を持たないため自動作成 未対応 (呼び出し側で null 扱い)。
 *     旧 v1 汎用生成 (シフト枠ベース) は全拠点を専用パスへ移行したため撤去済み (2026-06-09)。
 */
import { RIKA_OFFICE_CODE } from "./rika/config";
import { SHORT_DEFAULT_CONFIG, type ShortConfig } from "./short/generate";
import { DEFAULT_NIGHT_CYCLE_CONFIG } from "./short/night-cycle";

/** デイ専用生成 (generateDey) を使う拠点コード。 */
export const DEY_OFFICE_CODES: ReadonlyArray<string> = ["DAY-CENTER"];

/** 厨房専用生成 (generateKitchen: 固定ロスター) を使う拠点コード。 */
export const KITCHEN_OFFICE_CODES: ReadonlyArray<string> = ["KITCHEN"];

/** 梨花専用生成 (generateRikaShifts: 午前/午後 + gain最大化) を使う拠点コード。 */
export const RIKA_OFFICE_CODES: ReadonlyArray<string> = [RIKA_OFFICE_CODE];

/**
 * ナーシングホーム用のショート系設定。ショートと同じ夜勤サイクル + 午前/午後フィルだが、
 * 終日記号が「日勤」(共通, 1/1)。NRS には ショ短A 等の拠点専用記号が無いため、
 * 非常勤の終日埋めも「日勤」を使う。
 */
export const NRS_SHORT_CONFIG: ShortConfig = {
  maxConsecutiveDays: 6,
  symbols: {
    fullDay: "日勤",
    partFullDay: "日勤",
    partAm: "半日A",
    off: "公休",
    paidLeave: "有休",
  },
  night: DEFAULT_NIGHT_CYCLE_CONFIG,
};

/** ショート系生成 (generateShort) を使う拠点コード → 記号設定。 */
export const SHORT_OFFICE_CONFIGS: Readonly<Record<string, ShortConfig>> = {
  "SHO-CENTER": SHORT_DEFAULT_CONFIG,
  "NRS-CENTER": NRS_SHORT_CONFIG,
};

/** デイ専用生成を使う拠点か。 */
export function isDeyOffice(officeCode: string): boolean {
  return DEY_OFFICE_CODES.includes(officeCode);
}

/** 厨房専用生成 (固定ロスター) を使う拠点か。 */
export function isKitchenOffice(officeCode: string): boolean {
  return KITCHEN_OFFICE_CODES.includes(officeCode);
}

/** 梨花専用生成を使う拠点か。 */
export function isRikaOffice(officeCode: string): boolean {
  return RIKA_OFFICE_CODES.includes(officeCode);
}

/**
 * ショート系生成を使う拠点なら記号設定を返す (使わなければ null)。
 * デイ判定 (isDeyOffice) を先に行い、これが null かつデイでもなければ v1 汎用生成にフォールバックする。
 */
export function shortConfigForOffice(officeCode: string): ShortConfig | null {
  return SHORT_OFFICE_CONFIGS[officeCode] ?? null;
}
