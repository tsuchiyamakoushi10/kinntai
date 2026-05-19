import Link from "next/link";
import { notFound } from "next/navigation";

import { todayJstYmd, toJstYmd } from "@/lib/attendance/business-date";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { computeBalance } from "@/lib/leave/balance";
import { formatDate } from "@/lib/format";

import { ManualGrantForm } from "./manual-grant-form";

export const dynamic = "force-dynamic";

const GRANT_TYPE_LABEL: Record<string, string> = {
  STATUTORY: "法定付与",
  MANUAL_ADJUSTMENT: "手動付与",
  CARRY_OVER: "繰越",
};

export default async function AdminLeaveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      office: { select: { name: true } },
      paidLeaveGrants: {
        orderBy: { grantedOn: "desc" },
      },
      paidLeaveConsumptions: {
        orderBy: { consumedOn: "desc" },
        include: {
          shift: {
            select: {
              workDate: true,
              shiftPattern: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!employee) notFound();

  const asOf = todayJstYmd();
  const grants = employee.paidLeaveGrants.map((g) => ({
    id: g.id,
    grantedOn: toJstYmd(g.grantedOn),
    expiresOn: toJstYmd(g.expiresOn),
    grantedDays: g.grantedDays.toNumber(),
  }));
  const consumptions = employee.paidLeaveConsumptions.map((c) => ({
    consumedOn: toJstYmd(c.consumedOn),
    consumedDays: c.consumedDays.toNumber(),
  }));
  const balance = computeBalance(grants, consumptions, asOf);

  const remainingById = new Map(balance.perGrant.map((b) => [b.id, b]));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link
          href="/admin/leave"
          className="text-sm text-slate-500 hover:text-slate-900 hover:underline"
        >
          ← 一覧に戻る
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {employee.lastName} {employee.firstName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {employee.office.name}・入社 {formatDate(employee.hiredAt)}
        </p>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <SummaryCard label="残数" value={`${balance.totalRemaining} 日`} />
        <SummaryCard label="消化済み" value={`${balance.totalConsumed} 日`} />
        <SummaryCard label="失効済み" value={`${balance.totalExpired} 日`} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">付与履歴</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2 font-medium">付与日</th>
                <th className="px-4 py-2 font-medium">種別</th>
                <th className="px-4 py-2 text-right font-medium">付与日数</th>
                <th className="px-4 py-2 text-right font-medium">残数</th>
                <th className="px-4 py-2 font-medium">有効期限</th>
                <th className="px-4 py-2 font-medium">メモ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employee.paidLeaveGrants.map((g) => {
                const bal = remainingById.get(g.id);
                const expired = bal && !bal.active;
                return (
                  <tr key={g.id} className={expired ? "text-slate-400" : ""}>
                    <td className="px-4 py-2 tabular-nums">{formatDate(g.grantedOn)}</td>
                    <td className="px-4 py-2">{GRANT_TYPE_LABEL[g.grantType] ?? g.grantType}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {g.grantedDays.toString()}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {bal ? bal.remainingDays : "—"}
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      {formatDate(g.expiresOn)}
                      {expired && (
                        <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-600">
                          失効
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{g.note ?? "—"}</td>
                  </tr>
                );
              })}
              {employee.paidLeaveGrants.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    付与履歴はまだありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">手動付与の追加</h2>
        <ManualGrantForm employeeId={employee.id} defaultDate={asOf} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">消化履歴 (直近 30 件)</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2 font-medium">消化日</th>
                <th className="px-4 py-2 text-right font-medium">日数</th>
                <th className="px-4 py-2 font-medium">関連シフト</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employee.paidLeaveConsumptions.slice(0, 30).map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 tabular-nums">{formatDate(c.consumedOn)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.consumedDays.toString()}</td>
                  <td className="px-4 py-2 text-slate-600">{c.shift?.shiftPattern.name ?? "—"}</td>
                </tr>
              ))}
              {employee.paidLeaveConsumptions.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                    消化履歴はまだありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}
