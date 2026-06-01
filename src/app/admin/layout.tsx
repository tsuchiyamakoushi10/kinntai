import Link from "next/link";
import type { ReactNode } from "react";

import { signOut } from "@/auth";
import { AdminSidebar } from "@/components/admin/sidebar";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

async function logoutAction(): Promise<void> {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdmin();
  const name = session.user.name ?? "管理者";

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-slate-900">kinntai</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">管理</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/profile"
            className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
          >
            {name} さん
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
          <AdminSidebar />
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
