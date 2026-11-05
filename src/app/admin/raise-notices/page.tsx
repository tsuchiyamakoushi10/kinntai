import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatYen } from "@/lib/labor-notice/calc";
import { UNIT_LABEL } from "@/lib/raise-notice/rows";
import type { RaiseView } from "@/lib/raise-notice/types";

import { RaiseArchiveButton } from "./[id]/raise-actions";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ folder?: string }> };

/** S-A-39 昇給通知 一覧 */
export default async function RaiseNoticeListPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const done = sp.folder === "done";

  const [notices, doneCount] = await Promise.all([
    prisma.raiseNotice.findMany({
      where: { archivedAt: done ? { not: null } : null },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      include: {
        employee: { select: { lastName: true, firstName: true } },
        office: { select: { name: true } },
      },
    }),
    prisma.raiseNotice.count({ where: { archivedAt: { not: null } } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">昇給通知</h1>
          <p className="mt-1 text-sm text-slate-500">
            新しい金額を入れると、昇給通知書（受領書つき・A4 1枚）を作れます。
          </p>
        </div>
        <Link
          href="/admin/raise-notices/new"
          className="rounded-lg bg-slate-900 px-5 py-3 text-base font-semibold text-white hover:bg-slate-800"
        >
          ＋ 新しく作る
        </Link>
      </header>

      <nav aria-label="フォルダ" className="flex gap-2 border-b border-slate-200">
        {(
          [
            ["active", "作業中", "/admin/raise-notices"],
            ["done", `完了フォルダ（${doneCount}）`, "/admin/raise-notices?folder=done"],
          ] as const
        ).map(([key, label, href]) => {
          const current = (key === "done") === done;
          return (
            <Link
              key={key}
              href={href}
              aria-current={current ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2.5 text-base font-semibold ${
                current
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {notices.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          {done
            ? "完了フォルダは空です。署名済みの受領書を登録すると、自動でここへ移ります。"
            : "作業中の昇給通知はありません。"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2">従業員</th>
                <th className="px-3 py-2">勤務先</th>
                <th className="px-3 py-2">新しい金額の開始日</th>
                <th className="px-3 py-2">基本の金額</th>
                <th className="px-3 py-2">状態</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {notices.map((n) => {
                const base = (n.snapshot as unknown as RaiseView).rows.find(
                  (r) => r.key === "BASE",
                );
                return (
                  <tr key={n.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/raise-notices/${n.id}`}
                        className="font-semibold hover:underline"
                      >
                        {n.employee.lastName} {n.employee.firstName}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{n.office.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(n.effectiveOn)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {base
                        ? `${UNIT_LABEL[base.unit]} ${formatYen(base.beforeYen)} → ${formatYen(base.afterYen)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">{n.signedAt ? "署名済み" : "署名待ち"}</td>
                    <td className="px-3 py-2">
                      <RaiseArchiveButton noticeId={n.id} archived={done} small />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
