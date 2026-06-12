/**
 * 職員が 1 か月に申請できる「希望休 (REQUESTED_OFF)」の上限。
 *
 * 雇用形態ごとに上限を変える運用ルール:
 *   - 正社員 (FULL_TIME)                          … 月 3 日まで
 *   - パート (PART_TIME_INSURED/UNINSURED)        … 月 5 日まで
 *
 * 有給 (PAID_LEAVE) と夜勤希望 (PREFERRED_NIGHT) は対象外 (希望休だけを数える)。
 * 値は将来 DB / 設定に外出しできるよう、ここに定数としてまとめる (CLAUDE.md §7)。
 */
import type { EmploymentType } from "@prisma/client";

/** 正社員の月あたり希望休上限。 */
export const REQUESTED_OFF_LIMIT_FULL_TIME = 3;
/** パート (社保あり/なし) の月あたり希望休上限。 */
export const REQUESTED_OFF_LIMIT_PART_TIME = 5;

/**
 * その雇用形態の「月あたり希望休の上限日数」を返す。
 *
 * 正社員だけ 3 日、それ以外 (パート、および雇用形態未設定) は 5 日。
 * 雇用形態が未設定 (CSV 取り込み直後など) の従業員を誤って厳しく制限しないよう、
 * 不明な場合はゆるい側 (パートの 5 日) を既定とする。
 */
export function maxRequestedOffPerMonth(employmentType: EmploymentType | null): number {
  return employmentType === "FULL_TIME"
    ? REQUESTED_OFF_LIMIT_FULL_TIME
    : REQUESTED_OFF_LIMIT_PART_TIME;
}

/**
 * 希望休の申請日数が上限内かを判定する。
 * 上限ちょうど (count === limit) は許可。超過 (count > limit) のときだけ false。
 */
export function isWithinRequestedOffLimit(
  count: number,
  employmentType: EmploymentType | null,
): boolean {
  return count <= maxRequestedOffPerMonth(employmentType);
}
