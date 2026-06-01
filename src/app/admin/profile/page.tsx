import Link from "next/link";

import { changeMyPassword } from "@/app/me/profile/actions";
import { PasswordForm } from "@/app/me/profile/password-form";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * S-A-29 管理者プロフィール / パスワード変更。
 *
 * 管理者は middleware で /me 配下に入れないため、admin 専用の変更画面を持つ。
 * 変更ロジックは従業員側 (changeMyPassword) と完全に共通で、session.user.id
 * に対する更新なので role を問わず動作する。
 */
export default async function AdminProfilePage() {
  const session = await requireAdmin();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, createdAt: true },
  });

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5">
      <header>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-700">
          ← 管理ダッシュボードに戻る
        </Link>
        <h1 className="mt-2 text-xl font-bold text-slate-900">管理者プロフィール</h1>
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">アカウント情報</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">メール</dt>
          <dd className="text-right text-slate-900">{user?.email ?? "—"}</dd>
          <dt className="text-slate-500">表示名</dt>
          <dd className="text-right text-slate-900">{session.user.name ?? "管理者"}</dd>
        </dl>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">パスワード変更</h2>
        <div className="mt-3">
          <PasswordForm action={changeMyPassword} />
        </div>
      </section>
    </div>
  );
}
