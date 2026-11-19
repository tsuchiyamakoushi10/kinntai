/**
 * 育成面談・人事考課の権限。docs/growth-review.md §2
 *
 * - 社長 (role=admin): 全職員
 * - 部署の管理者 (role=manager): growth_profiles.manager_employee_id が自分の職員だけ (自分自身は除く)
 * role は JWT ではなく毎回 DB から読む (付け替え直後でも正しく判定するため)。
 * Server Action からも必ず呼ぶこと (URL / fetch 直打ちで担当外を触れないようにする)。
 */
import type { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

import { canAccessStaff } from "./logic";

export type { GrowthActor } from "./logic";
import type { GrowthActor } from "./logic";

export async function getGrowthActor(): Promise<GrowthActor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, employeeId: true, isActive: true },
  });
  if (!user || !user.isActive) return null;
  return { userId: user.id, role: user.role, employeeId: user.employeeId };
}

/** 部署の管理者のページ用。違えばホームへ */
export async function requireManager(): Promise<GrowthActor & { employeeId: string }> {
  const actor = await getGrowthActor();
  if (!actor) redirect("/login");
  if (actor.role !== "MANAGER" || !actor.employeeId) redirect("/me");
  return { ...actor, employeeId: actor.employeeId };
}

/** 社長 (admin) か */
export async function requirePresident(): Promise<GrowthActor> {
  const actor = await getGrowthActor();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN") redirect("/me");
  return actor;
}

/**
 * 対象職員を見て / 直してよいか。だめなら null。
 * Server Action では null のときエラーを返し、ページでは notFound/redirect する。
 */
export async function checkStaffAccess(
  employeeId: string,
): Promise<{ actor: GrowthActor; officeId: string | null } | null> {
  const actor = await getGrowthActor();
  if (!actor) return null;
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, officeId: true, growthProfile: { select: { managerEmployeeId: true } } },
  });
  if (!employee) return null;
  const ok = canAccessStaff(actor, {
    employeeId: employee.id,
    managerEmployeeId: employee.growthProfile?.managerEmployeeId ?? null,
  });
  return ok ? { actor, officeId: employee.officeId } : null;
}

/** 画面のリンク先の土台。社長と部署の管理者で URL が違う */
export function staffBasePath(role: UserRole, employeeId: string): string {
  return role === "ADMIN" ? `/admin/growth/staff/${employeeId}` : `/me/team/${employeeId}`;
}
