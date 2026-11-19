/**
 * 結いナビのデータを DB から読む (サーバー専用)。docs/growth-review.md
 * 権限の判定そのものは access.ts (純粋関数) で行う。
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { Staff } from "@/yui/types";

import { scopeSnapshot } from "./access";
import {
  employeeToStaff,
  presidentOnlyStaff,
  type EmployeeRow,
  type StaffProfileData,
} from "./mapping";
import type { YuiActor, YuiRecordKind, YuiSnapshot } from "./types";

export function todayJst(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

async function loadProfiles(): Promise<Map<string, StaffProfileData>> {
  const rows = await prisma.yuiStaffProfile.findMany();
  return new Map(rows.map((r) => [r.id, (r.data ?? {}) as StaffProfileData]));
}

const EMPLOYEE_SELECT = {
  id: true,
  employeeCode: true,
  lastName: true,
  firstName: true,
  lastNameKana: true,
  firstNameKana: true,
  jobCategory: true,
  employmentType: true,
  nightShiftOnly: true,
  joinedAt: true,
  employmentStatus: true,
  retiredAt: true,
  office: { select: { name: true } },
  user: { select: { role: true, email: true, isActive: true } },
} as const;

type EmployeeSelected = {
  id: string;
  employeeCode: string;
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
  jobCategory: EmployeeRow["jobCategory"];
  employmentType: EmployeeRow["employmentType"];
  nightShiftOnly: boolean;
  joinedAt: Date | null;
  employmentStatus: EmployeeRow["employmentStatus"];
  retiredAt: Date | null;
  office: { name: string } | null;
  user: { role: "ADMIN" | "EMPLOYEE" | "MANAGER"; email: string | null; isActive: boolean } | null;
};

export function toEmployeeRow(e: EmployeeSelected): EmployeeRow {
  return {
    id: e.id,
    employeeCode: e.employeeCode,
    lastName: e.lastName,
    firstName: e.firstName,
    lastNameKana: e.lastNameKana,
    firstNameKana: e.firstNameKana,
    jobCategory: e.jobCategory,
    employmentType: e.employmentType,
    nightShiftOnly: e.nightShiftOnly,
    joinedAt: e.joinedAt,
    employmentStatus: e.employmentStatus,
    retiredAt: e.retiredAt,
    officeName: e.office?.name ?? null,
    userRole: e.user?.role ?? null,
    userEmail: e.user?.email ?? null,
  };
}

/** 全職員 (従業員 + 従業員に紐づかない社長) を結いナビの形で */
export async function loadAllStaff(): Promise<Staff[]> {
  const [employees, admins, profiles] = await Promise.all([
    prisma.employee.findMany({
      select: EMPLOYEE_SELECT,
      orderBy: [{ employeeCode: "asc" }],
    }),
    prisma.user.findMany({
      where: { role: "ADMIN", employeeId: null, isActive: true },
      select: { id: true, email: true, loginId: true },
      orderBy: { createdAt: "asc" },
    }),
    loadProfiles(),
  ]);
  const today = todayJst();
  const list = employees.map((e) =>
    employeeToStaff(toEmployeeRow(e as EmployeeSelected), profiles.get(e.id) ?? {}, today),
  );
  for (const a of admins) {
    list.push(presidentOnlyStaff(a.id, profiles.get(a.id) ?? {}, "社長"));
  }
  return list;
}

export async function loadStaff(id: string): Promise<Staff | null> {
  const all = await loadAllStaff();
  return all.find((s) => s.id === id) ?? null;
}

/** ログイン中の人と、結いナビでの役割。結いナビを使えない人は null */
export async function getYuiActor(): Promise<YuiActor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, employeeId: true, isActive: true },
  });
  if (!user || !user.isActive) return null;
  if (user.role === "ADMIN") {
    return { userId: user.id, role: "president", staffId: user.employeeId ?? user.id };
  }
  if (!user.employeeId) return null;
  let role: YuiActor["role"] = user.role === "MANAGER" ? "manager" : "staff";
  if (role === "staff") {
    const p = await prisma.yuiStaffProfile.findUnique({ where: { id: user.employeeId } });
    if ((p?.data as StaffProfileData | null)?.role === "manager") role = "manager";
  }
  return { userId: user.id, role, staffId: user.employeeId };
}

async function loadRecords<T>(kind: YuiRecordKind): Promise<T[]> {
  const rows = await prisma.yuiRecord.findMany({ where: { kind }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => r.data as T);
}

export async function loadSnapshot(actor: YuiActor): Promise<YuiSnapshot> {
  const [
    staff,
    staffInterviews,
    managerInterviews,
    presidentReviews,
    periods,
    growthExpectations,
    growthPaths,
    hrAssessments,
  ] = await Promise.all([
    loadAllStaff(),
    loadRecords<YuiSnapshot["staffInterviews"][number]>("staffInterview"),
    loadRecords<YuiSnapshot["managerInterviews"][number]>("managerInterview"),
    loadRecords<YuiSnapshot["presidentReviews"][number]>("presidentReview"),
    loadRecords<YuiSnapshot["periods"][number]>("period"),
    loadRecords<YuiSnapshot["growthExpectations"][number]>("growthExpectation"),
    loadRecords<YuiSnapshot["growthPaths"][number]>("growthPath"),
    loadRecords<YuiSnapshot["hrAssessments"][number]>("hrAssessment"),
  ]);
  periods.sort((a, b) => a.startDate.localeCompare(b.startDate));
  return scopeSnapshot(actor, {
    meId: actor.staffId,
    staff,
    staffInterviews,
    managerInterviews,
    presidentReviews,
    periods,
    growthExpectations,
    growthPaths,
    hrAssessments,
  });
}

/** いまの評価期間の名前 (記録はこの名前で結びつく)。無ければ null */
export async function currentPeriodLabel(): Promise<string | null> {
  const rows = await prisma.yuiRecord.findMany({
    where: { kind: "period" },
    select: { data: true },
  });
  const periods = rows.map((r) => r.data as { label: string; active: boolean; startDate: string });
  const p =
    periods.find((x) => x.active) ??
    periods.sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return p?.label ?? null;
}

/** 面談シートを出したか */
export async function hasSubmittedSheet(staffId: string, period: string): Promise<boolean> {
  const rows = await prisma.yuiRecord.findMany({
    where: { kind: "staffInterview", staffId, period },
    select: { data: true },
  });
  return rows.some((r) => !!(r.data as { submittedAt?: string | null }).submittedAt);
}
