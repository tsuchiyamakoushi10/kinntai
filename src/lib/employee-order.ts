/**
 * 勤務表の従業員の並び順。
 *
 * 既定は「正社員 → パート（社保あり）→ パート（社保なし）」の雇用形態順、同区分内は社員コード順。
 * 管理者が勤務表上で手動並べ替えした場合は employees.display_order が優先される
 * (保存時に index*10 を振る)。display_order=0 は未設定とみなし雇用形態順にフォールバックする。
 */
import type { EmploymentType } from "@prisma/client";

/** 雇用形態の既定の並び順 (小さいほど上)。null (未設定) は最後。 */
export const EMPLOYMENT_TYPE_RANK: Record<EmploymentType, number> = {
  FULL_TIME: 0,
  PART_TIME_INSURED: 1,
  PART_TIME_UNINSURED: 2,
};

const UNSET_RANK = 99;

export type RosterSortable = {
  employmentType: EmploymentType | null;
  employeeCode: string;
  displayOrder: number;
};

function typeRank(t: EmploymentType | null): number {
  return t === null ? UNSET_RANK : EMPLOYMENT_TYPE_RANK[t];
}

/**
 * 勤務表の並び比較。
 *   1. display_order 昇順 (0 = 未設定は雇用形態順に委ねる)
 *   2. 雇用形態ランク (正 → 社保あり → 社保なし → 未設定)
 *   3. 社員コード昇順
 */
export function compareForRoster(a: RosterSortable, b: RosterSortable): number {
  if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
  const ra = typeRank(a.employmentType);
  const rb = typeRank(b.employmentType);
  if (ra !== rb) return ra - rb;
  return a.employeeCode.localeCompare(b.employeeCode);
}

/** compareForRoster で並べ替えた新しい配列を返す (非破壊)。 */
export function sortForRoster<T extends RosterSortable>(employees: ReadonlyArray<T>): T[] {
  return [...employees].sort(compareForRoster);
}
