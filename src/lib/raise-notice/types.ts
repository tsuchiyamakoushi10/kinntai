/**
 * 昇給通知書の入力・出力の型。docs/raise-notice.md 参照。
 * 日付は労働条件通知書と同じく JST の業務日付を "YYYY-MM-DD" 文字列で扱う。
 */
import type { NoticeWageInput } from "@/lib/labor-notice/types";

/** 賃金の形。労働条件通知書の賃金 (NoticeWageInput) の kind と同じ */
export type RaiseWageKind = NoticeWageInput["kind"];

/**
 * 金額の行。BASE / QUALIFICATION / ALLOWANCE は労働条件通知書の賃金項目に対応し、
 * 発行時に次回の通知書へ引き継ぐ。OTHER は書面に載せるだけ。
 * ALLOWANCE は人ごとの手当 (labor-notice.md §2.2) で、`code` で種類を指す。
 */
export type RaiseRowKey = "BASE" | "QUALIFICATION" | "ALLOWANCE" | "OTHER";

/** 2026-11-10 より前の snapshot にある key。読み込み時に ALLOWANCE へ読み替える */
export type LegacyRaiseRowKey = "MANAGER" | "COUNSELOR";

/** 金額の単位。基本給だけ賃金の形に合わせ、手当は月額 */
export type RaiseUnit = "MONTH" | "HOUR" | "NIGHT";

export type RaiseRow = {
  key: RaiseRowKey;
  /** ALLOWANCE のときだけ。人ごとの手当の種類の code */
  code?: string;
  label: string;
  unit: RaiseUnit;
  beforeYen: number;
  afterYen: number;
};

/** 作成画面の入力 */
export type RaiseInput = {
  issuedOn: string;
  effectiveOn: string;
  kind: RaiseWageKind;
  rows: RaiseRow[];
  /** 書面に添えるひとこと (任意) */
  message: string;
};

/** 書面の描画に使う確定値。発行時に snapshot として保存する */
export type RaiseView = RaiseInput & {
  employeeName: string;
  company: { name: string; address: string; representative: string };
  officeName: string;
};
