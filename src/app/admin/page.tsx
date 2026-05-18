import { auth, signOut } from "@/auth";

export const dynamic = "force-dynamic";

async function logoutAction(): Promise<void> {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function AdminHomePage() {
  const session = await auth();
  const name = session?.user?.name ?? "管理者";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">管理者ホーム</h1>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            ログアウト
          </button>
        </form>
      </header>
      <section className="rounded-xl bg-white p-5 shadow-sm">
        <p className="text-slate-700">
          ようこそ、<span className="font-semibold">{name}</span> さん。
        </p>
        <p className="mt-2 text-sm text-slate-500">
          ※ メニューは次のスライス（拠点設定・従業員管理）で追加します。
        </p>
      </section>
    </main>
  );
}
