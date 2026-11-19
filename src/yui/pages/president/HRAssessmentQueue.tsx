"use client";

import { useMemo } from "react";
import { Link } from "@/yui/router";
import { ClipboardCheck, ChevronRight } from "lucide-react";
import { staffStore, hrAssessmentStore, presidentReviewStore, periodStore } from "@/yui/storage";
import type { Staff, HRAssessment, PresidentReview, HRPresidentEvaluation } from "../../types";
import { GROWTH_STEP_OPTIONS } from "../../types";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";

interface Row {
  staff: Staff;
  hr: HRAssessment;
  pr: PresidentReview | null;
  manager: Staff | null;
}

function isHRDone(pr: PresidentReview | null): boolean {
  const ev: HRPresidentEvaluation | undefined = pr?.hrFinalEvaluation;
  if (!ev) return false;
  return (
    ev.userCenteredAction.rank !== null &&
    ev.respectfulInteraction.rank !== null &&
    ev.teamwork.rank !== null &&
    ev.initiativeImprovement.rank !== null &&
    ev.responsibility.rank !== null
  );
}

export default function PresidentHRAssessmentQueue() {
  const period = periodStore.active();
  const pk = period?.label === "2026年 上期" ? "2026-上期" : (period?.label ?? "");

  const rows = useMemo<Row[]>(() => {
    const confirmed = hrAssessmentStore.byPeriod(pk).filter((h) => h.status === "confirmed");
    return confirmed
      .map((hr) => {
        const staff = staffStore.get(hr.staffId);
        if (!staff || !staff.active) return null;
        const manager = staff.managerId ? staffStore.get(staff.managerId) : null;
        const pr = presidentReviewStore.byStaffAndPeriod(staff.id, pk);
        return { staff, hr, pr, manager };
      })
      .filter((x): x is Row => x !== null);
  }, [pk]);

  const pending = rows.filter((r) => !isHRDone(r.pr));
  const done = rows.filter((r) => isHRDone(r.pr));

  return (
    <>
      <PageHeader
        title="人事考課確認"
        subtitle="管理者の一次考課を確認し、社長が最終考課を行います"
      />

      <div className="card mb-6">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardCheck className="text-warm-500 h-5 w-5" />
          <h2 className="text-ink-800 text-lg font-bold">
            未完了 <span className="text-ink-400 text-sm font-normal">（{pending.length}件）</span>
          </h2>
        </div>
        {pending.length === 0 ? (
          <div className="text-ink-400 py-8 text-center text-sm">未完了の人事考課はありません</div>
        ) : (
          <div className="space-y-2">
            {pending.map((r) => (
              <HRQueueRow key={r.staff.id} row={r} done={false} />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-ink-800 mb-4 text-lg font-bold">
          完了 <span className="text-ink-400 text-sm font-normal">（{done.length}件）</span>
        </h2>
        {done.length === 0 ? (
          <div className="text-ink-400 py-8 text-center text-sm">
            まだ完了した人事考課はありません
          </div>
        ) : (
          <div className="space-y-2">
            {done.map((r) => (
              <HRQueueRow key={r.staff.id} row={r} done={true} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function HRQueueRow({ row, done }: { row: Row; done: boolean }) {
  const { staff, hr, manager } = row;
  const stepLabel = staff.growthStep
    ? (GROWTH_STEP_OPTIONS.find((o) => o.value === staff.growthStep)?.label ?? staff.growthStep)
    : "未設定";

  return (
    <Link
      to={`/president/hr-assessments/${staff.id}`}
      className="border-cream-200 hover:border-warm-300 hover:bg-warm-50 block rounded-xl border p-4 transition"
    >
      <div className="flex items-center gap-3">
        <div className="bg-cream-100 text-ink-600 flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold">
          {staff.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-ink-800 font-medium">{staff.name}</div>
          <div className="text-ink-400 mt-0.5 text-xs">
            {staff.department} ／ 管理者：{manager?.name ?? "—"}
          </div>
          <div className="text-ink-400 text-xs">
            {hr.period} ／ {stepLabel}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge label="一次考課提出済" variant="done" />
          {done ? (
            <StatusBadge label="最終考課完了" variant="done" />
          ) : (
            <StatusBadge label="最終考課 未完了" variant="pending" />
          )}
        </div>
        <ChevronRight className="text-ink-400 h-4 w-4 shrink-0" />
      </div>
    </Link>
  );
}
