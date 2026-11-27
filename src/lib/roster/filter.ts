/**
 * 名簿の抽出と並び替え (純関数)。DB から取った従業員に条件を当てる。
 */
import type { EmploymentStatus, EmploymentType, Gender, JobCategory } from "@prisma/client";

import type { RosterQuery } from "./query";

export type RosterEmployee = {
  id: string;
  employeeCode: string;
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
  birthDate: Date | null;
  gender: Gender | null;
  officeId: string | null;
  officeName: string | null;
  /** 拠点の並び (コード順の位置)。拠点なしは null。 */
  officeOrder: number | null;
  jobCategory: JobCategory | null;
  employmentType: EmploymentType | null;
  employmentStatus: EmploymentStatus;
  joinedAt: Date | null;
};

/**
 * 基準日時点の満年齢。誕生日の当日に 1 つ増える。
 * birthDate は @db.Date (UTC 00:00) なので UTC の年月日で比べる。
 * 2/29 生まれは平年では 3/1 に増える。
 */
export function ageOn(birthDate: Date, refDate: Date): number {
  const by = birthDate.getUTCFullYear();
  const bm = birthDate.getUTCMonth();
  const bd = birthDate.getUTCDate();
  const ry = refDate.getUTCFullYear();
  const rm = refDate.getUTCMonth();
  const rd = refDate.getUTCDate();
  let a = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) a -= 1;
  return a;
}

export type RosterResult = {
  rows: RosterEmployee[];
  /** 生年月日が無くて年齢条件から外れた人数。 */
  missingBirth: number;
  /** 性別が無くて性別条件から外れた人数。 */
  missingGender: number;
};

/**
 * @param nightWorkerIds 期間内に夜勤 (夜入) に入った従業員 ID。nightOnly のときだけ使う。
 */
export function filterRoster(
  employees: ReadonlyArray<RosterEmployee>,
  q: RosterQuery,
  nightWorkerIds: ReadonlySet<string>,
): RosterResult {
  const ref = new Date(`${q.refDate}T00:00:00.000Z`);
  const useAge = q.ageMin !== null || q.ageMax !== null;
  let missingBirth = 0;
  let missingGender = 0;
  const rows: RosterEmployee[] = [];

  for (const e of employees) {
    if (e.employmentStatus === "RETIRED") continue;
    if (e.employmentStatus === "ON_LEAVE" && !q.includeOnLeave) continue;
    if (q.officeIds.length > 0 && (!e.officeId || !q.officeIds.includes(e.officeId))) continue;
    if (q.jobs.length > 0 && (!e.jobCategory || !q.jobs.includes(e.jobCategory))) continue;
    if (q.types.length > 0 && (!e.employmentType || !q.types.includes(e.employmentType))) continue;
    if (q.nightOnly && !nightWorkerIds.has(e.id)) continue;
    if (q.gender) {
      if (!e.gender) {
        missingGender += 1;
        continue;
      }
      if (e.gender !== q.gender) continue;
    }
    if (useAge) {
      if (!e.birthDate) {
        missingBirth += 1;
        continue;
      }
      const a = ageOn(e.birthDate, ref);
      if (q.ageMin !== null && a < q.ageMin) continue;
      if (q.ageMax !== null && a > q.ageMax) continue;
    }
    rows.push(e);
  }

  return { rows: sortRoster(rows, q.sort), missingBirth, missingGender };
}

const collator = new Intl.Collator("ja");

function kanaKey(e: RosterEmployee): string {
  return `${e.lastNameKana ?? e.lastName} ${e.firstNameKana ?? e.firstName}`;
}

function byKana(a: RosterEmployee, b: RosterEmployee): number {
  return collator.compare(kanaKey(a), kanaKey(b)) || a.employeeCode.localeCompare(b.employeeCode);
}

export function sortRoster(
  rows: ReadonlyArray<RosterEmployee>,
  sort: RosterQuery["sort"],
): RosterEmployee[] {
  const list = [...rows];
  if (sort === "code") return list.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
  if (sort === "kana") return list.sort(byKana);
  // 拠点順 → フリガナ順。拠点なしは最後。
  return list.sort((a, b) => {
    const oa = a.officeOrder ?? Number.MAX_SAFE_INTEGER;
    const ob = b.officeOrder ?? Number.MAX_SAFE_INTEGER;
    return oa - ob || byKana(a, b);
  });
}

/** 拠点ごとに分ける (並び順は保つ)。 */
export function groupByOffice(
  rows: ReadonlyArray<RosterEmployee>,
): Array<{ officeName: string; rows: RosterEmployee[] }> {
  const groups = new Map<string, { officeName: string; rows: RosterEmployee[] }>();
  for (const e of rows) {
    const key = e.officeId ?? "";
    let g = groups.get(key);
    if (!g) {
      g = { officeName: e.officeName ?? "拠点なし", rows: [] };
      groups.set(key, g);
    }
    g.rows.push(e);
  }
  return [...groups.values()];
}
