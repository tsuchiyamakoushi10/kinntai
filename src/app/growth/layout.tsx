import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { prisma } from "@/lib/db";
import { getYuiActor, loadSnapshot } from "@/lib/yui/server";
import YuiAppShell from "@/yui/app-shell";

/**
 * 育成面談・人事考課 (結いナビ)。docs/growth-review.md
 * 結いナビの画面をそのまま移植したもの。データは CrossShift の DB に保存する。
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "結いナビ" };

export default async function GrowthLayout({ children }: { children: ReactNode }) {
  const actor = await getYuiActor();
  if (!actor) redirect("/login");

  const account = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { mustChangePassword: true },
  });
  if (account?.mustChangePassword) redirect("/password-change");

  const snapshot = await loadSnapshot(actor);
  const homeHref = actor.role === "president" ? "/admin" : "/me";
  return (
    <YuiAppShell snapshot={snapshot} homeHref={homeHref}>
      {children}
    </YuiAppShell>
  );
}
