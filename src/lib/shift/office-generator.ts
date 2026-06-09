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
 * ナーシングホーム (NH) 用のショート系設定。ショートと同じ夜勤サイクル + 午前/午後フィルに、
 * NH 固有の (1) 終日記号=有日勤、(2) 固定配置 (田中/中里=有日勤・木下=日勤)、
 * (3) 夜勤可者の限定 (6名のみ正の nightCap・他は 0) を roster で持たせる
 * (設計書 / memory: project_nh_shift_2026_06_09)。氏名は Employee.lastName と突合。
 */
export const NRS_SHORT_CONFIG: ShortConfig = {
  maxConsecutiveDays: 6,
  symbols: {
    fullDay: "有日勤",
    partFullDay: "有日勤",
    partAm: "有早",
    off: "公休",
    paidLeave: "有休",
  },
  night: DEFAULT_NIGHT_CYCLE_CONFIG,
  roster: {
    // 夜勤可者 (6月実績の回数を上限の目安に)。
    新井和也: { nightCap: 8 },
    関口千恵子: { nightCap: 6 },
    石田美里: { nightCap: 6 },
    中村直子: { nightCap: 5 },
    大川理恵: { nightCap: 3 },
    高橋紋美: { nightCap: 2, isCounselor: true },
    // 固定配置 (毎営業日その記号・夜勤なし)。田中は日中メイン相談員。
    田中綾華: { fixedSymbol: "有日勤", nightCap: 0, isCounselor: true },
    中里薫: { fixedSymbol: "有日勤", nightCap: 0 },
    木下潤平: { fixedSymbol: "日勤", nightCap: 0 },
    // 日中フィル (夜勤なし)。續橋は DB 上 旧字。
    須賀みどり: { nightCap: 0 },
    今井一子: { nightCap: 0 },
    中田久美子: { nightCap: 0 },
    續橋ののか: { nightCap: 0 },
  },
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
