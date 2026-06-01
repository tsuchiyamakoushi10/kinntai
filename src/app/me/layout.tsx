import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * 従業員画面共通のガード。
 *
 * 初期パスワードのまま (must_change_password = true) のユーザーは、
 * 業務画面に入る前に /password-change へ誘導する。判定は毎リクエスト
 * DB を読むため、変更直後の遷移で即座に解除される（JWT の陳腐化を避ける）。
 */
export default async function MeLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true },
  });
  if (user?.mustChangePassword) redirect("/password-change");

  return <>{children}</>;
}
