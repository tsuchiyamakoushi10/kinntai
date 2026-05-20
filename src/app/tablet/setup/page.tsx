import { prisma } from "@/lib/db";
import { getTabletOfficeId } from "@/lib/tablet/session";

import { registerTabletOffice, resetTabletOffice } from "./actions";

type PageProps = {
  searchParams: Promise<{ err?: string }>;
};

/**
 * S-T-01 タブレット初期セットアップ。
 *
 * 拠点を選んで「この端末をこの拠点に紐づける」操作。完了すると以降は
 * ログアウト操作をしない限り /tablet を起動するだけで打刻フローに入れる。
 */
export default async function TabletSetupPage({ searchParams }: PageProps) {
  const { err } = await searchParams;
  const offices = await prisma.office.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, name: true, code: true },
  });
  const currentOfficeId = await getTabletOfficeId();
  const currentName = currentOfficeId
    ? (offices.find((o) => o.id === currentOfficeId)?.name ?? null)
    : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wider text-slate-500">
          タブレットセットアップ
        </p>
        <h1 className="text-2xl font-bold text-slate-900">この端末を使う拠点を選んでください</h1>
        <p className="text-sm text-slate-600">
          設定はこの端末に保存され、選んだ拠点の従業員が打刻に使えるようになります。
        </p>
      </header>

      {currentName && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-semibold text-emerald-900">現在: {currentName}</p>
          <p className="mt-1 text-emerald-800">
            拠点を変更するには下のリストから選び直してください。
          </p>
          <form action={resetTabletOffice} className="mt-3">
            <button
              type="submit"
              className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
            >
              登録を解除する
            </button>
          </form>
        </div>
      )}

      {err && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {err}
        </p>
      )}

      <form action={registerTabletOffice} className="flex flex-col gap-4">
        <ul className="grid grid-cols-1 gap-3">
          {offices.map((o) => (
            <li key={o.id}>
              <label className="flex cursor-pointer items-center gap-4 rounded-2xl border border-slate-300 bg-white px-5 py-4 text-lg shadow-sm transition hover:bg-slate-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                <input
                  type="radio"
                  name="officeId"
                  value={o.id}
                  defaultChecked={o.id === currentOfficeId}
                  className="size-5 accent-blue-600"
                />
                <span className="flex-1 font-medium text-slate-900">{o.name}</span>
                <span className="text-xs text-slate-500">{o.code}</span>
              </label>
            </li>
          ))}
        </ul>

        <button
          type="submit"
          className="mt-2 rounded-2xl bg-blue-600 py-5 text-xl font-bold text-white shadow-md transition hover:bg-blue-700 active:scale-[0.99]"
        >
          この拠点で使う
        </button>
      </form>
    </div>
  );
}
