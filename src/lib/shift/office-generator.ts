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
 *   - それ以外: 当面 v1 の汎用生成 (シフト枠ベース)。梨花は専用画面のため対象外。
 */
import { SHORT_DEFAULT_CONFIG, type ShortConfig } from "./short/generate";
import { DEFAULT_NIGHT_CYCLE_CONFIG } from "./short/night-cycle";

/** デイ専用生成 (generateDey) を使う拠点コード。 */
export const DEY_OFFICE_CODES: ReadonlyArray<string> = ["DAY-CENTER"];

/**
 * ナーシングホーム用のショート系設定。ショートと同じ夜勤サイクル + 午前/午後フィルだが、
 * 終日記号が「日勤」(共通, 1/1)。NRS には ショ短A 等の拠点専用記号が無いため、
 * 非常勤の終日埋めも「日勤」を使う。
 */
export const NRS_SHORT_CONFIG: ShortConfig = {
  maxConsecutiveDays: 6,
  symbols: { fullDay: "日勤", partFullDay: "日勤", partAm: "半日A", off: "公休" },
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

/**
 * ショート系生成を使う拠点なら記号設定を返す (使わなければ null)。
 * デイ判定 (isDeyOffice) を先に行い、これが null かつデイでもなければ v1 汎用生成にフォールバックする。
 */
export function shortConfigForOffice(officeCode: string): ShortConfig | null {
  return SHORT_OFFICE_CONFIGS[officeCode] ?? null;
}
