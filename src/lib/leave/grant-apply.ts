/**
 * 自動付与の適用計画。
 *
 * 役割:
 *  - 「今日時点で付与すべきだが、まだ付与履歴がない分」を従業員ごとに列挙する
 *  - Server Action はこの結果を見て PaidLeaveGrant を一括 createMany する
 *
 * DB アクセスは行わない (pure)。テストしやすくするため、入力は「従業員 1 人分
 * の雇い入れ日・退職日・勤務形態 + 既存付与日リスト」のみに絞る。
 */

import { computeGrantDays } from "./grant-table";
import { addYearsYmd, dueGrants } from "./schedule";

export type EmployeeContext = {
  id: string;
  hiredOn: string; // YYYY-MM-DD
  retiredOn: string | null;
  weeklyWorkDays: number;
  weeklyWorkHours: number;
};

export type PlannedGrant = {
  employeeId: string;
  grantedOn: string;
  expiresOn: string; // grantedOn + 2 年 (労基法準拠)
  grantedDays: number;
  monthsSinceHired: number;
};

/**
 * 1 人分の付与計画を返す。週所定 0 日は付与なし (= 空配列)。
 *
 * `existingStatutoryGrantDates` は STATUTORY タイプで既に発行済みの日付一覧。
 * 手動付与 (MANUAL_ADJUSTMENT) や繰越 (CARRY_OVER) はここに含めない。
 */
export function planGrantsForEmployee(
  emp: EmployeeContext,
  asOf: string,
  existingStatutoryGrantDates: ReadonlyArray<string>,
): PlannedGrant[] {
  if (emp.weeklyWorkDays <= 0) return [];

  const dues = dueGrants(emp.hiredOn, asOf, {
    already: existingStatutoryGrantDates,
    retiredOn: emp.retiredOn,
  });

  const plans: PlannedGrant[] = [];
  for (const due of dues) {
    const grantedDays = computeGrantDays({
      monthsSinceHired: due.monthsSinceHired,
      weeklyWorkDays: emp.weeklyWorkDays,
      weeklyWorkHours: emp.weeklyWorkHours,
    });
    if (grantedDays <= 0) continue;
    plans.push({
      employeeId: emp.id,
      grantedOn: due.grantedOn,
      expiresOn: addYearsYmd(due.grantedOn, 2),
      grantedDays,
      monthsSinceHired: due.monthsSinceHired,
    });
  }
  return plans;
}
