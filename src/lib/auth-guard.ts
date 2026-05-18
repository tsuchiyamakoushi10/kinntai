/**
 * Server Component / Server Action 用のロールガード。
 *
 * middleware でも経路は守っているが、Server Action は middleware を
 * 通らずに呼べてしまうケース（fetch 経由など）があるため、データを
 * 変更する処理の入り口でも必ずこれを呼ぶこと。
 */
import type { Session } from "next-auth";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    redirect("/me");
  }
  return session;
}
