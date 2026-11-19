/**
 * 従業員一覧 (S-A-04) の並び替え。URL の ?sort=&dir= で指定する。
 * 人数が少ない (数十〜百名) ので、DB ではなく取り出したあとに並べる
 * (フリガナの五十音順・未入力を最後にする、を素直に書くため)。
 */
import type { EmploymentStatus, EmploymentType, JobCategory } from "@prisma/client";

export const EMPLOYEE_SORT_KEYS = [
  "code",
  "kana",
  "office",
  "job",
  "type",
  "status",
  "joined",
] as const;
export type EmployeeSortKey = (typeof EMPLOYEE_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export const EMPLOYEE_SORT_LABELS: Record<EmployeeSortKey, string> = {
  code: "社員番号順",
  kana: "名前順 (フリガナ)",
  office: "拠点順",
  job: "職種順",
  type: "雇用形態順",
  status: "在籍状況順",
  joined: "入社日順",
};

export function normalizeSort(
  rawSort: string | undefined,
  rawDir: string | undefined,
): { sort: EmployeeSortKey; dir: SortDir } {
  const sort = (EMPLOYEE_SORT_KEYS as readonly string[]).includes(rawSort ?? "")
    ? (rawSort as EmployeeSortKey)
    : "code";
  const dir: SortDir = rawDir === "desc" ? "desc" : "asc";
  return { sort, dir };
}

export type SortableEmployee = {
  employeeCode: string;
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
  jobCategory: JobCategory | null;
  employmentType: EmploymentType | null;
  employmentStatus: EmploymentStatus;
  joinedAt: Date | null;
  /** 拠点の並び順 (拠点コード順の位置)。拠点なしは null */
  officeOrder: number | null;
};

const JOB_ORDER: JobCategory[] = [
  "CARE_WORKER",
  "NURSE",
  "LIFE_COUNSELOR",
  "CARE_MANAGER",
  "OFFICE_STAFF",
  "OTHER",
];
const TYPE_ORDER: EmploymentType[] = ["FULL_TIME", "PART_TIME_INSURED", "PART_TIME_UNINSURED"];
const STATUS_ORDER: EmploymentStatus[] = ["ACTIVE", "ON_LEAVE", "RETIRED"];

const collator = new Intl.Collator("ja");

function kanaOf(e: SortableEmployee): string {
  const kana = `${e.lastNameKana ?? ""}${e.firstNameKana ?? ""}`.trim();
  return kana || `${e.lastName}${e.firstName}`;
}

/** 値が無いものは、昇順でも降順でも最後にする */
function compareNullable<T>(a: T | null, b: T | null, cmp: (x: T, y: T) => number, dir: SortDir) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const r = cmp(a, b);
  return dir === "asc" ? r : -r;
}

const byIndex =
  <T>(order: T[]) =>
  (x: T, y: T) =>
    order.indexOf(x) - order.indexOf(y);

export function sortEmployees<T extends SortableEmployee>(
  list: T[],
  sort: EmployeeSortKey,
  dir: SortDir,
): T[] {
  const primary = (a: T, b: T): number => {
    switch (sort) {
      case "kana":
        return compareNullable(kanaOf(a), kanaOf(b), collator.compare, dir);
      case "office":
        return compareNullable(a.officeOrder, b.officeOrder, (x, y) => x - y, dir);
      case "job":
        return compareNullable(a.jobCategory, b.jobCategory, byIndex(JOB_ORDER), dir);
      case "type":
        return compareNullable(a.employmentType, b.employmentType, byIndex(TYPE_ORDER), dir);
      case "status":
        return compareNullable(a.employmentStatus, b.employmentStatus, byIndex(STATUS_ORDER), dir);
      case "joined":
        return compareNullable(
          a.joinedAt?.getTime() ?? null,
          b.joinedAt?.getTime() ?? null,
          (x, y) => x - y,
          dir,
        );
      case "code":
      default:
        return compareNullable(a.employeeCode, b.employeeCode, collator.compare, dir);
    }
  };
  // 同じ値の中は名前順 → 社員番号順
  return [...list].sort(
    (a, b) =>
      primary(a, b) ||
      collator.compare(kanaOf(a), kanaOf(b)) ||
      collator.compare(a.employeeCode, b.employeeCode),
  );
}
