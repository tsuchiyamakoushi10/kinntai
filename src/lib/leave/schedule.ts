/**
 * 有給付与日のスケジューリング。
 *
 * 労基法上の原則:
 *  - 初回付与は雇い入れ日から 6 か月後
 *  - 以後は前回付与日から 1 年ごと
 *
 * 本実装はバッチ実行 (S-A-11 の自動付与) と、特定従業員の次回付与日を
 * 画面で表示するために使う。日付は JST の暦日で扱う。
 */

import { fromJstYmd, toJstYmd } from "@/lib/attendance/business-date";

/** YYYY-MM-DD の暦日に n か月加算 (月末は素直にクリップ)。 */
function addMonthsYmd(ymd: string, months: number): string {
  const d = fromJstYmd(ymd);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  // クリップ: 加算後の月の末日と元の日を比較し、小さい方を採る
  const targetY = y + Math.floor((m + months) / 12);
  const targetM = (((m + months) % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetY, targetM + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return toJstYmd(new Date(Date.UTC(targetY, targetM, targetDay)));
}

/** YYYY-MM-DD に年加算した日付を返す (うるう年の 2/29 は 2/28 にクリップ)。 */
export function addYearsYmd(ymd: string, years: number): string {
  return addMonthsYmd(ymd, years * 12);
}

/**
 * 初回付与日 (雇い入れ日 + 6 か月) を返す。
 */
export function firstGrantDate(hiredOn: string): string {
  return addMonthsYmd(hiredOn, 6);
}

/**
 * 雇い入れ日と「これまでに付与した中で最も新しい付与日」から、次回付与日を返す。
 * - 一度も付与していない → 雇い入れ + 6 か月
 * - 前回付与あり → 前回付与日 + 1 年
 */
export function nextGrantDate(hiredOn: string, lastGrantedOn: string | null): string {
  if (!lastGrantedOn) return firstGrantDate(hiredOn);
  return addYearsYmd(lastGrantedOn, 1);
}

export type DueGrant = {
  /** 付与すべき日 (YYYY-MM-DD) */
  grantedOn: string;
  /** その時点での雇い入れからの経過月数 (整数) */
  monthsSinceHired: number;
};

/** YYYY-MM-DD を Date 化して経過月数 (端数切り捨て) を返す。 */
function monthsBetween(fromYmd: string, toYmd: string): number {
  const a = fromJstYmd(fromYmd);
  const b = fromJstYmd(toYmd);
  const months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  // 日が満たない場合は -1 する (例: 1/15 → 7/14 はまだ 6 か月未満)
  if (b.getUTCDate() < a.getUTCDate()) {
    return months - 1;
  }
  return months;
}

/**
 * 雇い入れ日から `asOf` までに「付与すべきだった日」を全列挙する。
 * 既に付与した日のリスト (`already`) を渡すと、それより新しいものだけ返す。
 *
 * バッチ実行で「過去にまとめて未付与だった分を一気に追いつかせる」用途。
 * 退職済み従業員 (`retiredOn` 指定) は退職日を超える付与日を含めない。
 */
export function dueGrants(
  hiredOn: string,
  asOf: string,
  options: {
    already?: ReadonlyArray<string>;
    retiredOn?: string | null;
  } = {},
): DueGrant[] {
  const already = new Set(options.already ?? []);
  const retiredOn = options.retiredOn ?? null;

  const dues: DueGrant[] = [];
  let candidate = firstGrantDate(hiredOn);
  // 上限ガード (異常入力で無限ループを避ける)
  for (let i = 0; i < 100; i++) {
    if (candidate > asOf) break;
    if (retiredOn && candidate > retiredOn) break;
    if (!already.has(candidate)) {
      dues.push({
        grantedOn: candidate,
        monthsSinceHired: monthsBetween(hiredOn, candidate),
      });
    }
    candidate = addYearsYmd(candidate, 1);
  }
  return dues;
}
