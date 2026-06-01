import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { changeMyPassword } from "@/app/me/profile/actions";
import { PasswordForm } from "@/app/me/profile/password-form";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function logoutAction(): Promise<void> {
  "use server";
  await signOut({ redirectTo: "/login" });
}

/**
 * 初期パスワード強制変更画面。
 *
 * users.must_change_password = true のユーザーは /me・/admin の各 layout で
 * ここへ誘導される。role を問わず使えるよう、あえて /me・/admin の外に置く
 * （middleware の role ガードに引っかからない中立ルート）。
 *
 * 変更が完了すると changeMyPassword が must_change_password を false にするため、
 * 次の遷移で layout ガードを素通りしてホームに入れる。
 */
export default async function PasswordChangePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // 既に変更済みのユーザーが URL を直打ちしたらホームへ戻す。
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true },
  });
  if (user && !user.mustChangePassword) {
    redirect(session.user.role === "ADMIN" ? "/admin" : "/me");
  }

  const home = session.user.role === "ADMIN" ? "/admin" : "/me";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 bg-slate-50 p-5">
      <header>
        <h1 className="text-xl font-bold text-slate-900">パスワードの変更</h1>
        <p className="mt-2 text-sm text-slate-600">
          安全のため、初回ログイン時にパスワードの変更が必要です。新しいパスワードを設定してください。
        </p>
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <PasswordForm action={changeMyPassword} />
      </section>

      <div className="flex items-center justify-between text-sm">
        <a href={home} className="text-slate-600 hover:text-slate-900 hover:underline">
          変更後はこちらから続ける →
        </a>
        <form action={logoutAction}>
          <button type="submit" className="text-slate-500 hover:text-slate-700 hover:underline">
            ログアウト
          </button>
        </form>
      </div>
    </main>
  );
}
