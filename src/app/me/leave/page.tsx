import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { todayJstYmd, toJstYmd } from "@/lib/attendance/business-date";
import { prisma } from "@/lib/db";
import { computeBalance } from "@/lib/leave/balance";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MyLeavePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const employeeId = session.user.employeeId;

  if (!employeeId) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-slate-50 p-5">
        <Header />
        <p className="rounded-2xl bg-white p-5 text-sm text-slate-700 shadow-sm">
          このアカウントには従業員情報が紐づいていません。
        </p>
      </main>
    );
  }

  const asOf = todayJstYmd();
  const [grants, consumptions] = await Promise.all([
    prisma.paidLeaveGrant.findMany({
      where: { employeeId },
      orderBy: { grantedOn: "desc" },
    }),
    prisma.paidLeaveConsumption.findMany({
      where: { employeeId },
      orderBy: { consumedOn: "desc" },
      include: {
        shift: { select: { workDate: true, shiftPattern: { select: { name: true } } } },
      },
      take: 50,
    }),
  ]);

  const allConsumptions = await prisma.paidLeaveConsumption.findMany({
    where: { employeeId },
    select: { consumedOn: true, consumedDays: true },
  });

  const balance = computeBalance(
    grants.map((g) => ({
      id: g.id,
      grantedOn: toJstYmd(g.grantedOn),
      expiresOn: toJstYmd(g.expiresOn),
      grantedDays: g.grantedDays.toNumber(),
    })),
    allConsumptions.map((c) => ({
      consumedOn: toJstYmd(c.consumedOn),
      consumedDays: c.consumedDays.toNumber(),
    })),
    asOf,
  );

  const remainingById = new Map(balance.perGrant.map((b) => [b.id, b]));

  // 次に失効する有効な付与 (期限が早い順、active のみ)
  const nextExpiring = balance.perGrant.find((b) => b.active && b.remainingDays > 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 bg-slate-50 p-5">
      <Header />

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs font-medium text-slate-500">いまの残数</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
          {balance.totalRemaining} 日
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">消化済み</dt>
          <dd className="text-right text-slate-700 tabular-nums">{balance.totalConsumed} 日</dd>
          {balance.totalExpired > 0 && (
            <>
              <dt className="text-slate-500">失効済み</dt>
              <dd className="text-right text-slate-700 tabular-nums">{balance.totalExpired} 日</dd>
            </>
          )}
          {nextExpiring && (
            <>
              <dt className="text-slate-500">次の失効</dt>
              <dd className="text-right text-slate-700 tabular-nums">
                {nextExpiring.expiresOn} まで {nextExpiring.remainingDays} 日
              </dd>
            </>
          )}
        </dl>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <h2 className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600">
          付与履歴
        </h2>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">付与日</th>
              <th className="px-3 py-2 text-right font-medium">付与</th>
              <th className="px-3 py-2 text-right font-medium">残</th>
              <th className="px-3 py-2 text-left font-medium">有効期限</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {grants.map((g) => {
              const bal = remainingById.get(g.id);
              const expired = bal && !bal.active;
              return (
                <tr key={g.id} className={expired ? "text-slate-400" : ""}>
                  <td className="px-3 py-2 tabular-nums">{formatDate(g.grantedOn)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.grantedDays.toString()}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {bal ? bal.remainingDays : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatDate(g.expiresOn)}
                    {expired && (
                      <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                        失効
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {grants.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  付与履歴はまだありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <h2 className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600">
          消化履歴 (直近 50 件)
        </h2>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">消化日</th>
              <th className="px-3 py-2 text-right font-medium">日数</th>
              <th className="px-3 py-2 text-left font-medium">シフト</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {consumptions.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 tabular-nums">{formatDate(c.consumedOn)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.consumedDays.toString()}</td>
                <td className="px-3 py-2 text-slate-600">{c.shift?.shiftPattern.name ?? "—"}</td>
              </tr>
            ))}
            {consumptions.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                  消化履歴はまだありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="text-center text-xs text-slate-400">※ 付与の調整は管理者へ連絡してください。</p>
    </main>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between">
      <Link
        href="/me"
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
      >
        ← ホーム
      </Link>
      <h1 className="text-base font-bold text-slate-900">有給</h1>
      <span aria-hidden className="w-16" />
    </header>
  );
}
