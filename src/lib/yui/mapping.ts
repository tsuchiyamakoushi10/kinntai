/**
 * 従業員マスタ (employees) ⇔ 結いナビの職員 (Staff) の変換。docs/growth-review.md §8
 *
 * - 氏名・フリガナ・入社日・在籍/退職は従業員マスタが正。
 *   結いナビの画面で直したときも従業員マスタへ書き戻す (二重管理にしない)。
 * - 勤次郎コード (クロスシフトの社員番号とは別)・部署・主職種・雇用形態 (夜勤専従を含む結いナビの区分)・職位・資格・成長STEP・担当管理者・メモは
 *   結いナビ側だけで持つ (yui_staff_profiles.data)。未設定なら従業員マスタから初期値を作る。
 */
import type {
  EmploymentStatus as DbEmploymentStatus,
  EmploymentType as DbEmploymentType,
  JobCategory,
} from "@prisma/client";

import {
  ALL_DEPARTMENTS,
  type Department,
  type EmploymentStatus,
  type EmploymentType,
  type JobType,
  type Role,
  type Staff,
} from "@/yui/types";

/** yui_staff_profiles.data に入れる項目 (結いナビ側だけで持つもの) */
export type StaffProfileData = Partial<
  Pick<
    Staff,
    | "email"
    | "kinjiroCode"
    | "department"
    | "secondaryDepartments"
    | "jobType"
    | "position"
    | "employmentType"
    | "employmentStatus"
    | "returnDate"
    | "retirementDate"
    | "qualifications"
    | "growthStep"
    | "managerMemo"
    | "titleLabel"
    | "managerId"
    | "role"
  >
> & {
  /** 従業員に紐づかない社長アカウントだけが使う */
  name?: string;
  furigana?: string;
  joinedAt?: string;
};

export interface EmployeeRow {
  id: string;
  employeeCode: string;
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
  jobCategory: JobCategory | null;
  employmentType: DbEmploymentType | null;
  nightShiftOnly: boolean;
  joinedAt: Date | null;
  employmentStatus: DbEmploymentStatus;
  retiredAt: Date | null;
  officeName: string | null;
  userRole: "ADMIN" | "EMPLOYEE" | "MANAGER" | null;
  userEmail: string | null;
}

export function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** 拠点名 → 結いナビの部署 (「ナーシングホーム結いの心」→「ナーシングホーム結いの心 Honjo」など) */
export function departmentFromOffice(officeName: string | null): Department | null {
  if (!officeName) return null;
  const n = officeName.trim();
  return ALL_DEPARTMENTS.find((d) => d === n || d.startsWith(n) || n.startsWith(d)) ?? null;
}

/** 結いナビの部署 → 拠点名に合う拠点 ID */
export function officeIdForDepartment(
  department: string | undefined,
  offices: { id: string; name: string }[],
): string | null {
  if (!department) return null;
  const hit = offices.find((o) => departmentFromOffice(o.name) === department);
  return hit?.id ?? null;
}

const JOB_FROM_CATEGORY: Record<JobCategory, JobType> = {
  CARE_WORKER: "介護職員",
  NURSE: "看護職員",
  LIFE_COUNSELOR: "生活相談員",
  CARE_MANAGER: "ケアマネ",
  OFFICE_STAFF: "事務",
  OTHER: "介護職員",
};

const CATEGORY_FROM_JOB: Partial<Record<JobType, JobCategory>> = {
  介護職員: "CARE_WORKER",
  看護職員: "NURSE",
  看護師: "NURSE",
  生活相談員: "LIFE_COUNSELOR",
  ケアマネ: "CARE_MANAGER",
  ケアマネジャー: "CARE_MANAGER",
  事務: "OFFICE_STAFF",
};

export function jobCategoryFromJobType(j: JobType | undefined): JobCategory | null {
  if (!j) return null;
  return CATEGORY_FROM_JOB[j] ?? "OTHER";
}

export function employmentTypeFromDb(
  t: DbEmploymentType | null,
  nightShiftOnly: boolean,
): EmploymentType {
  if (nightShiftOnly) return "夜勤専従";
  if (t === "PART_TIME_INSURED" || t === "PART_TIME_UNINSURED") return "パート";
  return "正社員";
}

/** 結いナビで新しく職員を追加したときの、従業員マスタの雇用形態 */
export function employmentTypeToDb(t: EmploymentType | undefined): {
  employmentType: DbEmploymentType | null;
  nightShiftOnly: boolean;
} {
  if (t === "パート") return { employmentType: "PART_TIME_UNINSURED", nightShiftOnly: false };
  if (t === "夜勤専従") return { employmentType: "FULL_TIME", nightShiftOnly: true };
  if (t === "正社員" || t === "契約社員" || t === "嘱託")
    return { employmentType: "FULL_TIME", nightShiftOnly: false };
  return { employmentType: null, nightShiftOnly: false };
}

export function statusFromDb(
  status: DbEmploymentStatus,
  retiredAt: Date | null,
  profile: StaffProfileData,
  today: string,
): EmploymentStatus {
  if (status === "RETIRED") return "退職済";
  if (status === "ON_LEAVE") {
    return profile.employmentStatus === "産休・育休中" ? "産休・育休中" : "休職中";
  }
  const r = isoDate(retiredAt);
  if (r && r >= today) return "退職予定";
  if (profile.employmentStatus === "退職予定") return "退職予定";
  return "在籍中";
}

/** 結いナビの在籍状況 → 従業員マスタの在籍・退職日 */
export function statusToDb(
  s: EmploymentStatus | undefined,
  retirementDate: string | null | undefined,
): { employmentStatus: DbEmploymentStatus; retiredAt: Date | null } {
  const d = retirementDate ? new Date(`${retirementDate}T00:00:00Z`) : null;
  switch (s) {
    case "退職済":
      return { employmentStatus: "RETIRED", retiredAt: d };
    case "退職予定":
      return { employmentStatus: "ACTIVE", retiredAt: d };
    case "休職中":
    case "産休・育休中":
      return { employmentStatus: "ON_LEAVE", retiredAt: null };
    default:
      return { employmentStatus: "ACTIVE", retiredAt: null };
  }
}

export function roleFrom(userRole: EmployeeRow["userRole"], profile: StaffProfileData): Role {
  if (userRole === "ADMIN") return "president";
  if (userRole === "MANAGER" || profile.role === "manager") return "manager";
  return "staff";
}

export function joinName(a: string | null | undefined, b: string | null | undefined): string {
  return [a, b].filter((x) => x && x.trim()).join(" ");
}

/** "山田 花子" → 姓・名。空白が無ければ全部を姓に入れる */
export function splitName(full: string): [string, string] {
  const t = full.trim().replace(/　/g, " ");
  const i = t.indexOf(" ");
  if (i < 0) return [t, ""];
  return [t.slice(0, i), t.slice(i + 1).trim()];
}

export function employeeToStaff(e: EmployeeRow, profile: StaffProfileData, today: string): Staff {
  const employmentStatus = statusFromDb(e.employmentStatus, e.retiredAt, profile, today);
  return {
    id: e.id,
    name: joinName(e.lastName, e.firstName),
    furigana: joinName(e.lastNameKana, e.firstNameKana) || undefined,
    kinjiroCode: profile.kinjiroCode,
    email: profile.email ?? e.userEmail ?? undefined,
    department:
      (profile.department as Department | undefined) ??
      departmentFromOffice(e.officeName) ??
      "本部",
    secondaryDepartments: profile.secondaryDepartments,
    jobType: profile.jobType ?? (e.jobCategory ? JOB_FROM_CATEGORY[e.jobCategory] : "介護職員"),
    position: profile.position,
    joinedAt: isoDate(e.joinedAt) ?? "",
    employmentType:
      profile.employmentType ?? employmentTypeFromDb(e.employmentType, e.nightShiftOnly),
    employmentStatus,
    returnDate: profile.returnDate ?? null,
    retirementDate:
      isoDate(e.retiredAt) ??
      (employmentStatus === "退職予定" ? (profile.retirementDate ?? null) : null),
    qualifications: profile.qualifications,
    growthStep: profile.growthStep,
    managerMemo: profile.managerMemo,
    titleLabel: profile.titleLabel,
    role: roleFrom(e.userRole, profile),
    managerId: profile.managerId ?? null,
    active: employmentStatus !== "退職済",
  };
}

/** 従業員に紐づかない社長 (admin ユーザー) */
export function presidentOnlyStaff(
  userId: string,
  profile: StaffProfileData,
  fallbackName: string,
): Staff {
  return {
    id: userId,
    name: profile.name || fallbackName,
    furigana: profile.furigana,
    email: profile.email,
    department: (profile.department as Department | undefined) ?? "本部",
    jobType: profile.jobType ?? "管理者",
    joinedAt: profile.joinedAt ?? "",
    employmentType: profile.employmentType ?? "正社員",
    employmentStatus: "在籍中",
    titleLabel: profile.titleLabel ?? "社長",
    role: "president",
    managerId: null,
    active: true,
  };
}

/** 結いナビの Staff から、結いナビ側だけで持つ項目を取り出す */
export function profileFromStaff(s: Staff, withIdentity: boolean): StaffProfileData {
  const p: StaffProfileData = {
    kinjiroCode: s.kinjiroCode?.trim() || undefined,
    email: s.email,
    department: s.department,
    secondaryDepartments: s.secondaryDepartments,
    jobType: s.jobType,
    position: s.position,
    employmentType: s.employmentType,
    employmentStatus: s.employmentStatus,
    returnDate: s.returnDate ?? null,
    retirementDate: s.retirementDate ?? null,
    qualifications: s.qualifications,
    growthStep: s.growthStep,
    managerMemo: s.managerMemo,
    titleLabel: s.titleLabel,
    managerId: s.managerId ?? null,
    role: s.role,
  };
  if (withIdentity) {
    p.name = s.name;
    p.furigana = s.furigana;
    p.joinedAt = s.joinedAt;
  }
  // undefined は JSON に残らないので落とす
  return JSON.parse(JSON.stringify(p)) as StaffProfileData;
}
