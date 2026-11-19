import Link from "next/link";

import { PeriodTabs, RankBadge, StatusPill, StepBadge } from "@/components/growth/ui";
import { requireAdmin } from "@/lib/auth-guard";
import { INTERVIEW_STATUS_LABELS } from "@/lib/growth/constants";
import { nextStep, NEXT_STEP_LABELS, type NextStepKey } from "@/lib/growth/logic";
import { employeeName, listPeriods, loadProgress, resolvePeriod } from "@/lib/growth/queries";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ period?: string; office?: string; next?: string }> };

/** S-A-42 面談・考課の状況 (社長) */
export default async function GrowthDashboardPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const [periods, offices] = await Promise.all([
    listPeriods(),
    prisma.office.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const period = resolvePeriod(periods, sp.period);
  const officeId = offices.some((o) => o.id === sp.office) ? sp.office : undefined;

  const staff = await prisma.employee.findMany({
    where: { employmentStatus: { not: "RETIRED" }, ...(officeId ? { officeId } : {}) },
    orderBy: [{ office: { code: "asc" } }, { lastNameKana: "asc" }, { employeeCode: "asc" }],
    select: {
      id: true,
      lastName: true,
      firstName: true,
      office: { select: { name: true } },
      growthProfile: {
        select: { growthStep: true, manager: { select: { lastName: true, firstName: true } } },
      },
    },
  });
  const progress = period
    ? await loadProgress(
        period.id,
        staff.map((s) => s.id),
      )
    : null;
  const rows = staff.map((s) => {
    const p = {
      sheet: progress?.sheets.get(s.id),
      record: progress?.records.get(s.id),
      assessment: progress?.assessments.get(s.id),
      final: progress?.finals.get(s.id),
      review: progress?.reviews.get(s.id),
    };
    const next = nextStep({
      sheetSubmitted: !!p.sheet?.submittedAt,
      recordStatus: p.record?.status ?? null,
      assessmentStatus: p.assessment?.status ?? null,
      finalStatus: p.final?.status ?? null,
      reviewStatus: p.review?.status ?? null,
    });
    return { s, p, next };
  });
  const counts = rows.reduce<Record<NextStepKey, number>>(
    (acc, r) => ({ ...acc, [r.next]: acc[r.next] + 1 }),
    { sheet: 0, record: 0, assessment: 0, final: 0, review: 0, done: 0 },
  );
  const nextFilter = (Object.keys(NEXT_STEP_LABELS) as NextStepKey[]).find((k) => k === sp.next);
  const shown = nextFilter ? rows.filter((r) => r.next === nextFilter) : rows;
  const href = (o: { period?: string; office?: string; next?: string }) => {
    const q = new URLSearchParams();
    const v = { period: period?.id, office: officeId, next: nextFilter, ...o };
    for (const [k, val] of Object.entries(v)) if (val) q.set(k, val);
    return `/admin/growth?${q.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">面談・人事考課</h1>
          <p className="mt-1 text-sm text-slate-500">
            職員の面談シート → 担当者の面談記録・一次考課 → 社長の最終考課・面談確認
            の進み具合です。
          </p>
        </div>
        <Link
          href="/admin/growth/settings"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          期間・担当者の設定
        </Link>
      </header>

      {!period ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          評価期間がまだありません。
          <Link href="/admin/growth/settings" className="text-pink-700 underline">
            設定
          </Link>
          で「2026年 下期」のような期間を作ってください。
        </p>
      ) : (
        <>
          <PeriodTabs
            periods={periods}
            currentId={period.id}
            hrefFor={(id) => href({ period: id })}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(Object.keys(NEXT_STEP_LABELS) as NextStepKey[]).map((k) => (
              <Link
                key={k}
                href={href({ next: nextFilter === k ? "" : k })}
                aria-current={nextFilter === k ? "true" : undefined}
                className={`rounded-xl bg-white p-3 ring-1 hover:ring-pink-300 ${
                  nextFilter === k ? "ring-2 ring-pink-500" : "ring-slate-200"
                }`}
              >
                <p className="text-xs text-slate-500">{NEXT_STEP_LABELS[k]}</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{counts[k]}</p>
              </Link>
            ))}
          </div>

          <form className="flex flex-wrap items-center gap-2" action="/admin/growth">
            <input type="hidden" name="period" value={period.id} />
            {nextFilter && <input type="hidden" name="next" value={nextFilter} />}
            <label className="text-sm text-slate-600" htmlFor="office">
              拠点
            </label>
            <select
              id="office"
              name="office"
              defaultValue={officeId ?? ""}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">すべて</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              絞り込む
            </button>
          </form>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="bg-slate-50 text-left text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2">職員</th>
                  <th className="px-3 py-2">拠点</th>
                  <th className="px-3 py-2">STEP</th>
                  <th className="px-3 py-2">担当</th>
                  <th className="px-3 py-2">面談シート</th>
                  <th className="px-3 py-2">面談記録</th>
                  <th className="px-3 py-2">一次考課</th>
                  <th className="px-3 py-2">最終考課</th>
                  <th className="px-3 py-2">面談確認</th>
                  <th className="px-3 py-2">次</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ s, p, next }) => {
                  const base = `/admin/growth/staff/${s.id}`;
                  const q = `?period=${period.id}`;
                  return (
                    <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <Link
                          href={`${base}${q}`}
                          className="font-semibold text-pink-700 underline"
                        >
                          {employeeName(s)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{s.office?.name ?? "—"}</td>
                      <td className="px-3 py-2">
                        <StepBadge step={s.growthProfile?.growthStep} compact />
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {s.growthProfile?.manager ? employeeName(s.growthProfile.manager) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill
                          tone={p.sheet?.submittedAt ? "done" : p.sheet ? "doing" : "todo"}
                        >
                          {p.sheet?.submittedAt ? "提出済み" : p.sheet ? "書きかけ" : "まだ"}
                        </StatusPill>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`${base}/interview${q}`}>
                          <StatusPill
                            tone={
                              p.record?.status === "DONE" ? "done" : p.record ? "doing" : "todo"
                            }
                          >
                            {p.record ? INTERVIEW_STATUS_LABELS[p.record.status] : "まだ"}
                          </StatusPill>
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`${base}/assessment${q}`}>
                          <StatusPill
                            tone={
                              p.assessment?.status === "SUBMITTED"
                                ? "done"
                                : p.assessment
                                  ? "doing"
                                  : "todo"
                            }
                          >
                            {p.assessment?.status === "SUBMITTED"
                              ? "提出済み"
                              : p.assessment
                                ? "下書き"
                                : "まだ"}
                          </StatusPill>
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`${base}/final${q}`} className="inline-flex items-center gap-1">
                          {p.final?.status === "CONFIRMED" ? (
                            <RankBadge rank={p.final.overallRank} />
                          ) : (
                            <StatusPill tone={p.final ? "doing" : "todo"}>
                              {p.final ? "下書き" : "まだ"}
                            </StatusPill>
                          )}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`${base}/review${q}`}>
                          <StatusPill
                            tone={
                              p.review?.status === "CONFIRMED"
                                ? "done"
                                : p.review
                                  ? "doing"
                                  : "todo"
                            }
                          >
                            {p.review?.status === "CONFIRMED"
                              ? "確定"
                              : p.review
                                ? "下書き"
                                : "まだ"}
                          </StatusPill>
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold text-slate-700">
                        {NEXT_STEP_LABELS[next]}
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                      該当する職員はいません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
