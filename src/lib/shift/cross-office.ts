/**
 * 事業所またぎ勤務 (応援) の自動作成サポート。
 *
 * ある拠点の自動作成で「応援 (support) 職員が別拠点で既に勤務/公休が入っている日」を
 * 勤務不可日として扱うための集約。Shift は @@unique([employeeId, workDate]) なので、
 * 別拠点にシフトが 1 行でもある日はその人はその日を使えない (二重配置不可)。
 *
 * DB アクセスはここでは行わない (純関数)。ローダが別拠点シフトを渡す。
 */

/** 別拠点シフト 1 件分 (集約に必要な最小情報)。 */
export type CrossOfficeShift = {
  employeeId: string;
  /** そのシフトが属する事業所。targetOfficeId と一致するものは無視する。 */
  officeId: string;
  /** `YYYY-MM-DD` */
  workDate: string;
};

/**
 * 別拠点で埋まっている日を従業員ごとに集約する。
 *
 * - `targetOfficeId` と同じ officeId のシフトは「自拠点の予定」なので無視する
 *   (自動作成はその拠点の中で通常どおり判断する)。
 * - 戻り値は employeeId → その人が別拠点で塞がっている日付 (`YYYY-MM-DD`) の Set。
 *   ローダ側で各職員の `unavailableDates` にマージして使う。
 */
export function mergeCrossOfficeBusyDays(
  shifts: ReadonlyArray<CrossOfficeShift>,
  targetOfficeId: string,
): Map<string, Set<string>> {
  const busy = new Map<string, Set<string>>();
  for (const s of shifts) {
    if (s.officeId === targetOfficeId) continue;
    const set = busy.get(s.employeeId) ?? new Set<string>();
    set.add(s.workDate);
    busy.set(s.employeeId, set);
  }
  return busy;
}
