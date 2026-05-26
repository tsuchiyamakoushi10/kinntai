import Link from "next/link";

import { todayJstYmd, toJstYmd } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { computeBalance } from "@/lib/leave/balance";
import { planGrantsForEmployee, type EmployeeContext } from "@/lib/leave/grant-apply";
import { nextGrantDate } from "@/lib/leave/schedule";
import { formatDate } from "@/lib/format";

import { RunStatutoryGrantButton } from "./run-statutory-grant-button";

export const dynamic = "force-dynamic";

type SearchParams = { officeId?: string };
type Props = { searchParams: Promise<SearchParams> };

export default async function AdminLeavePage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const officeId = sp.officeId ?? "";
  const asOf = todayJstYmd();

  const [offices, employees] = await Promise.all([
    prisma.office.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, name: true },
    }),
    prisma.employee.findMany({
      where: {
        ...(officeId ? { officeId } : {}),
        retiredAt: null,
      },
      orderBy: [{ officeId: "asc" }, { employeeCode: "asc" }],
      select: {
        id: true,
        employeeCode: true,
        lastName: true,
        firstName: true,
        hiredAt: true,
        retiredAt: true,
        weeklyWorkDays: true,
        dailyWorkHours: true,
        office: { select: { name: true } },
        paidLeaveGrants: {
          select: {
            id: true,
            grantedOn: true,
            expiresOn: true,
            grantedDays: true,
            grantType: true,
          },
        },
        paidLeaveConsumptions: {
          select: { consumedOn: true, consumedDays: true },
        },
      },
    }),
  ]);

  // 残数 + 未付与予定の事前計算
  const rows = employees.map((e) => {
    const grants = e.paidLeaveGrants.map((g) => ({
      id: g.id,
      grantedOn: toJstYmd(g.grantedOn),
      expiresOn: toJstYmd(g.expiresOn),
      grantedDays: g.grantedDays.toNumber(),
    }));
    const consumptions = e.paidLeaveConsumptions.map((c) => ({
      consumedOn: toJstYmd(c.consumedOn),
      consumedDays: c.consumedDays.toNumber(),
    }));
    const balance = computeBalance(grants, consumptions, asOf);

    // CSV 取り込みで未入力の従業員は法定計算をスキップ。表示上は「—」扱い。
    const hasGrantInputs =
      e.hiredAt !== null && e.weeklyWorkDays !== null && e.dailyWorkHours !== null;
    let pendingCount = 0;
    let nextGrantOn: string | null = null;
    if (hasGrantInputs) {
      const weeklyDays = e.weeklyWorkDays!.toNumber();
      const dailyHours = e.dailyWorkHours!.toNumber();
      const ctx: EmployeeContext = {
        id: e.id,
        hiredOn: toJstYmd(e.hiredAt!),
        retiredOn: null,
        weeklyWorkDays: weeklyDays,
        weeklyWorkHours: weeklyDays * dailyHours,
      };
      const statutoryDates = e.paidLeaveGrants
        .filter((g) => g.grantType === "STATUTORY")
        .map((g) => toJstYmd(g.grantedOn));
      const pendingPlans = planGrantsForEmployee(ctx, asOf, statutoryDates);
      const lastStatutory = statutoryDates.sort().at(-1) ?? null;
      pendingCount = pendingPlans.length;
      nextGrantOn = nextGrantDate(toJstYmd(e.hiredAt!), lastStatutory);
    }

    return {
      id: e.id,
      code: e.employeeCode,
      name: `${e.lastName} ${e.firstName}`,
      officeName: e.office?.name ?? "—",
      hiredOn: e.hiredAt,
      totalRemaining: balance.totalRemaining,
      totalConsumed: balance.totalConsumed,
      pendingCount,
      nextGrantOn,
    };
  });

  const pendingTotal = rows.reduce((s, r) => s + r.pendingCount, 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">有給管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            {rows.length} 名表示中・本日 {asOf} 時点の残数
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/leave/alerts"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            年5日取得アラート →
          </Link>
          <RunStatutoryGrantButton pendingTotal={pendingTotal} />
        </div>
      </header>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <label className="flex min-w-44 flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-slate-600">拠点</span>
          <select
            name="officeId"
            defaultValue={officeId}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">すべて</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          絞り込み
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">氏名</th>
              <th className="px-4 py-3 font-medium">拠点</th>
              <th className="px-4 py-3 font-medium">入社日</th>
              <th className="px-4 py-3 text-right font-medium">残数</th>
              <th className="px-4 py-3 text-right font-medium">消化合計</th>
              <th className="px-4 py-3 font-medium">次回付与</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/leave/${r.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {r.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    <span className="font-mono text-slate-400">{r.code}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">{r.officeName}</td>
                <td className="px-4 py-3 text-slate-600 tabular-nums">{formatDate(r.hiredOn)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                  {r.totalRemaining} 日
                </td>
                <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                  {r.totalConsumed} 日
                </td>
                <td className="px-4 py-3 text-slate-600 tabular-nums">
                  {r.pendingCount > 0 ? (
                    <span className="font-medium text-amber-700">未付与 {r.pendingCount} 件</span>
                  ) : (
                    r.nextGrantOn
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/leave/${r.id}`}
                    className="text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline"
                  >
                    詳細
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  該当する従業員がいません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
