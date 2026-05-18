import Link from "next/link";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function OfficeListPage() {
  const offices = await prisma.office.findMany({
    orderBy: [{ isActive: "desc" }, { code: "asc" }],
    include: {
      _count: { select: { employees: { where: { retiredAt: null } } } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">拠点設定</h1>
        <Link
          href="/admin/offices/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          ＋ 新規追加
        </Link>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">コード</th>
              <th className="px-4 py-3 font-medium">名称</th>
              <th className="px-4 py-3 font-medium">住所</th>
              <th className="px-4 py-3 font-medium">在籍</th>
              <th className="px-4 py-3 font-medium">状態</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {offices.map((o) => (
              <tr key={o.id} className={o.isActive ? "" : "bg-slate-50/60 text-slate-500"}>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{o.code}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{o.name}</td>
                <td className="px-4 py-3 text-slate-600">{o.address ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700">{o._count.employees} 人</td>
                <td className="px-4 py-3">
                  {o.isActive ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                      稼働中
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      停止中
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/offices/${o.id}/edit`}
                    className="text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline"
                  >
                    編集
                  </Link>
                </td>
              </tr>
            ))}
            {offices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  拠点が登録されていません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
