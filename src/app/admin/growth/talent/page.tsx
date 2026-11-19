import Link from "next/link";

import { PeriodTabs, RankBadge, StepBadge } from "@/components/growth/ui";
import { requireAdmin } from "@/lib/auth-guard";
import { GROWTH_STEPS, STEP_LABELS } from "@/lib/growth/constants";
import { employeeName, listPeriods, resolvePeriod } from "@/lib/growth/queries";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ period?: string }> };

/** S-A-43 人材ダッシュボード (社長) */
export default async function TalentDashboardPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const periods = await listPeriods();
  const period = resolvePeriod(periods, sp.period);

  const staff = await prisma.employee.findMany({
    where: { employmentStatus: { not: "RETIRED" } },
    orderBy: [{ office: { code: "asc" } }, { lastNameKana: "asc" }, { employeeCode: "asc" }],
    select: {
      id: true,
      lastName: true,
      firstName: true,
      office: { select: { name: true } },
      growthProfile: { select: { growthStep: true } },
    },
  });
  const ids = staff.map((s) => s.id);
  const [reviews, finals] = period
    ? await Promise.all([
        prisma.growthReview.findMany({ where: { periodId: period.id, employeeId: { in: ids } } }),
        prisma.hrFinalAssessment.findMany({
          where: { periodId: period.id, employeeId: { in: ids }, status: "CONFIRMED" },
          select: { employeeId: true, overallRank: true },
        }),
      ])
    : [[], []];
  const reviewBy = new Map(reviews.map((r) => [r.employeeId, r]));
  const finalBy = new Map(finals.map((r) => [r.employeeId, r]));
  const stepCounts = GROWTH_STEPS.map((st) => ({
    st,
    n: staff.filter((s) => s.growthProfile?.growthStep === st).length,
  }));
  const unset = staff.filter((s) => !s.growthProfile?.growthStep).length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">人材ダッシュボード</h1>
        <p className="mt-1 text-sm text-slate-500">
          全職員の STEP と、面談確認で決めた育成の判断をまとめて見られます。
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {stepCounts.map(({ st, n }) => (
          <div key={st} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">
              {STEP_LABELS[st].short} {STEP_LABELS[st].title}
            </p>
            <p className="text-2xl font-bold tabular-nums">{n}</p>
          </div>
        ))}
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">未設定</p>
          <p className="text-2xl font-bold tabular-nums">{unset}</p>
        </div>
      </div>

      {period && (
        <PeriodTabs
          periods={periods}
          currentId={period.id}
          hrefFor={(id) => `/admin/growth/talent?period=${id}`}
        />
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">職員</th>
              <th className="px-3 py-2">拠点</th>
              <th className="px-3 py-2">STEP</th>
              <th className="px-3 py-2">総合評価</th>
              <th className="px-3 py-2">期待度</th>
              <th className="px-3 py-2">育成区分</th>
              <th className="px-3 py-2">人材ポテンシャル</th>
              <th className="px-3 py-2">将来任せたい役割</th>
              <th className="px-3 py-2">育成方針</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const r = reviewBy.get(s.id);
              return (
                <tr key={s.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/growth/staff/${s.id}/review${period ? `?period=${period.id}` : ""}`}
                      className="font-semibold text-pink-700 underline"
                    >
                      {employeeName(s)}
                    </Link>
                    {r?.needsFollowUp && (
                      <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">
                        要フォロー
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{s.office?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <StepBadge step={s.growthProfile?.growthStep} compact />
                  </td>
                  <td className="px-3 py-2">
                    <RankBadge rank={finalBy.get(s.id)?.overallRank} />
                  </td>
                  <td className="px-3 py-2">{r?.expectationLevel ?? "—"}</td>
                  <td className="px-3 py-2">{r?.developmentRank ?? "—"}</td>
                  <td className="px-3 py-2">{r?.talentPotential ?? "—"}</td>
                  <td className="px-3 py-2">{r?.futureRole || "—"}</td>
                  <td className="max-w-xs px-3 py-2 whitespace-pre-wrap">
                    {r?.developmentPolicy || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
