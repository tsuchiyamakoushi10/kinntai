import { auth, signOut } from "@/auth";

export const dynamic = "force-dynamic";

async function logoutAction(): Promise<void> {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function MyHomePage() {
  const session = await auth();
  const name = session?.user?.name ?? "従業員";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{name} さんのページ</h1>
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
        <p className="text-slate-700">ログインできました。</p>
        <p className="mt-2 text-sm text-slate-500">
          ※ 打刻 / 月別シフトは次以降のスライスで追加します。
        </p>
      </section>
    </main>
  );
}
