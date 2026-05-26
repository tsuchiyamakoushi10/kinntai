import Link from "next/link";

import { todayJstYmd, toJstYmd } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { evaluateFiveDayRule, type FiveDayStatus } from "@/lib/leave/five-day-rule";

export const dynamic = "force-dynamic";

const SEVERITY_ORDER: Record<FiveDayStatus["severity"], number> = {
  violated: 0,
  warn: 1,
  watch: 2,
  ok: 3,
};

const SEVERITY_BADGE: Record<FiveDayStatus["severity"], string> = {
  violated: "bg-rose-100 text-rose-800",
  warn: "bg-amber-100 text-amber-800",
  watch: "bg-sky-100 text-sky-800",
  ok: "bg-slate-100 text-slate-600",
};

const SEVERITY_LABEL: Record<FiveDayStatus["severity"], string> = {
  violated: "違反",
  warn: "要対応",
  watch: "監視",
  ok: "達成",
};

export default async function AdminLeaveAlertsPage() {
  await requireAdmin();
  const asOf = todayJstYmd();

  const employees = await prisma.employee.findMany({
    where: { retiredAt: null },
    orderBy: [{ officeId: "asc" }, { employeeCode: "asc" }],
    select: {
      id: true,
      employeeCode: true,
      lastName: true,
      firstName: true,
      office: { select: { name: true } },
      paidLeaveGrants: {
        select: {
          id: true,
          grantedOn: true,
          expiresOn: true,
          grantedDays: true,
        },
      },
      paidLeaveConsumptions: {
        select: { consumedOn: true, consumedDays: true },
      },
    },
  });

  type Row = {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    officeName: string;
    status: FiveDayStatus;
  };

  const rows: Row[] = [];
  for (const e of employees) {
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
    const statuses = evaluateFiveDayRule(grants, consumptions, asOf);
    for (const s of statuses) {
      if (s.severity === "ok") continue;
      rows.push({
        employeeId: e.id,
        employeeName: `${e.lastName} ${e.firstName}`,
        employeeCode: e.employeeCode,
        officeName: e.office?.name ?? "—",
        status: s,
      });
    }
  }

  rows.sort((a, b) => {
    const o = SEVERITY_ORDER[a.status.severity] - SEVERITY_ORDER[b.status.severity];
    if (o !== 0) return o;
    return a.status.daysLeft - b.status.daysLeft;
  });

  const counts = rows.reduce(
    (acc, r) => {
      acc[r.status.severity] += 1;
      return acc;
    },
    { violated: 0, warn: 0, watch: 0, ok: 0 } as Record<FiveDayStatus["severity"], number>,
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/admin/leave"
            className="text-sm text-slate-500 hover:text-slate-900 hover:underline"
          >
            ← 有給管理に戻る
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">年5日取得義務アラート</h1>
          <p className="mt-1 text-sm text-slate-500">
            本日 {asOf} 時点・10 日以上の付与のうち、年 5 日に達していない分を表示
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <Badge severity="violated" count={counts.violated} />
          <Badge severity="warn" count={counts.warn} />
          <Badge severity="watch" count={counts.watch} />
        </div>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">状況</th>
              <th className="px-4 py-3 font-medium">氏名</th>
              <th className="px-4 py-3 font-medium">拠点</th>
              <th className="px-4 py-3 font-medium">付与日</th>
              <th className="px-4 py-3 text-right font-medium">付与日数</th>
              <th className="px-4 py-3 text-right font-medium">取得済</th>
              <th className="px-4 py-3 text-right font-medium">あと</th>
              <th className="px-4 py-3 font-medium">期限</th>
              <th className="px-4 py-3 text-right font-medium">残期間</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={`${r.employeeId}:${r.status.grantId}`}>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[r.status.severity]}`}
                  >
                    {SEVERITY_LABEL[r.status.severity]}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/leave/${r.employeeId}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {r.employeeName}
                  </Link>
                  <div className="text-xs">
                    <span className="font-mono text-slate-400">{r.employeeCode}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-slate-700">{r.officeName}</td>
                <td className="px-4 py-2.5 text-slate-600 tabular-nums">{r.status.grantedOn}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.status.grantedDays}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.status.consumedInWindow}</td>
                <td className="px-4 py-2.5 text-right font-medium text-rose-700 tabular-nums">
                  {r.status.shortBy} 日
                </td>
                <td className="px-4 py-2.5 text-slate-600 tabular-nums">{r.status.deadline}</td>
                <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                  {r.status.daysLeft >= 0
                    ? `${r.status.daysLeft} 日`
                    : `超過 ${-r.status.daysLeft} 日`}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  取得不足の付与はありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Badge({ severity, count }: { severity: FiveDayStatus["severity"]; count: number }) {
  return (
    <span className={`rounded-full px-3 py-1 font-medium ${SEVERITY_BADGE[severity]}`}>
      {SEVERITY_LABEL[severity]} {count}
    </span>
  );
}
