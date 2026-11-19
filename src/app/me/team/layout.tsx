import type { ReactNode } from "react";

import { requireManager } from "@/lib/growth/access";

export const dynamic = "force-dynamic";

/** 部署の管理者だけ (role は毎回 DB で確認)。docs/growth-review.md §2 */
export default async function TeamLayout({ children }: { children: ReactNode }) {
  await requireManager();
  return <div className="mx-auto min-h-screen max-w-6xl bg-slate-50 p-5">{children}</div>;
}
