import Link from "next/link";

import { PeriodTabs, StatusPill, StepBadge } from "@/components/growth/ui";
import { requireManager } from "@/lib/growth/access";
import { INTERVIEW_STATUS_LABELS } from "@/lib/growth/constants";
import { nextStep, NEXT_STEP_LABELS } from "@/lib/growth/logic";
import { employeeName, listPeriods, loadProgress, resolvePeriod } from "@/lib/growth/queries";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ period?: string }> };

/** S-E-15 担当職員一覧 (部署の管理者) */
export default async function TeamPage({ searchParams }: Props) {
  const actor = await requireManager();
  const sp = await searchParams;
  const periods = await listPeriods();
  const period = resolvePeriod(periods, sp.period);

  const staff = await prisma.employee.findMany({
    where: {
      employmentStatus: { not: "RETIRED" },
      growthProfile: { managerEmployeeId: actor.employeeId },
      id: { not: actor.employeeId },
    },
    orderBy: [{ lastNameKana: "asc" }, { employeeCode: "asc" }],
    select: {
      id: true,
      lastName: true,
      firstName: true,
      office: { select: { name: true } },
      growthProfile: { select: { growthStep: true } },
    },
  });
  const progress = period
    ? await loadProgress(
        period.id,
        staff.map((s) => s.id),
      )
    : null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link
          href="/me"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          ← 戻る
        </Link>
        <h1 className="text-lg font-bold text-slate-900">担当職員の面談・考課</h1>
      </header>

      {!period ? (
        <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">
          評価期間がまだありません。社長（管理者）に期間を作ってもらってください。
        </p>
      ) : (
        <>
          <PeriodTabs
            periods={periods}
            currentId={period.id}
            hrefFor={(id) => `/me/team?period=${id}`}
          />
          {staff.length === 0 ? (
            <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">
              担当の職員がまだいません。社長（管理者）に割り当ててもらってください。
            </p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {staff.map((s) => {
                const sheet = progress?.sheets.get(s.id);
                const record = progress?.records.get(s.id);
                const assessment = progress?.assessments.get(s.id);
                const next = nextStep({
                  sheetSubmitted: !!sheet?.submittedAt,
                  recordStatus: record?.status ?? null,
                  assessmentStatus: assessment?.status ?? null,
                  finalStatus: progress?.finals.get(s.id)?.status ?? null,
                  reviewStatus: progress?.reviews.get(s.id)?.status ?? null,
                });
                return (
                  <li key={s.id}>
                    <Link
                      href={`/me/team/${s.id}?period=${period.id}`}
                      className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-pink-300"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-base font-bold text-slate-900">
                          {employeeName(s)} さん
                        </span>
                        <StepBadge step={s.growthProfile?.growthStep} />
                      </span>
                      <span className="text-xs text-slate-500">{s.office?.name ?? "所属なし"}</span>
                      <span className="flex flex-wrap gap-1.5">
                        <StatusPill tone={sheet?.submittedAt ? "done" : "todo"}>
                          シート {sheet?.submittedAt ? "提出済み" : "まだ"}
                        </StatusPill>
                        <StatusPill
                          tone={record?.status === "DONE" ? "done" : record ? "doing" : "todo"}
                        >
                          面談 {record ? INTERVIEW_STATUS_LABELS[record.status] : "まだ"}
                        </StatusPill>
                        <StatusPill
                          tone={
                            assessment?.status === "SUBMITTED"
                              ? "done"
                              : assessment
                                ? "doing"
                                : "todo"
                          }
                        >
                          考課{" "}
                          {assessment?.status === "SUBMITTED"
                            ? "提出済み"
                            : assessment
                              ? "下書き"
                              : "まだ"}
                        </StatusPill>
                      </span>
                      <span className="text-sm font-semibold text-pink-700">
                        次: {NEXT_STEP_LABELS[next]}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
