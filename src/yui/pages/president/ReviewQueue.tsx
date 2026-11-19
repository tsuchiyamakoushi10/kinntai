"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/yui/router";
import { ClipboardList, ChevronRight } from "lucide-react";
import {
  staffStore,
  managerInterviewStore,
  presidentReviewStore,
  periodStore,
} from "@/yui/storage";
import type { Staff, ManagerInterview, PresidentReview, Evaluation } from "../../types";
import { EVAL_LABELS } from "../../types";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";
import EvalBadge from "../../components/EvalBadge";

interface Row {
  staff: Staff;
  mi: ManagerInterview;
  pr: PresidentReview | null;
}

export default function PresidentReviewQueue() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const period = periodStore.active();
    const pk = period?.label === "2026年 上期" ? "2026-上期" : (period?.label ?? "");
    const all = managerInterviewStore.byPeriod(pk).filter((m) => m.status === "done");
    setRows(
      all
        .map((mi) => {
          const staff = staffStore.get(mi.staffId);
          if (!staff) return null;
          return {
            staff,
            mi,
            pr: presidentReviewStore.byStaffAndPeriod(staff.id, pk),
          };
        })
        .filter((x): x is Row => x !== null),
    );
  }, []);

  const pending = useMemo(() => rows.filter((r) => r.pr?.status !== "confirmed"), [rows]);
  const confirmed = useMemo(() => rows.filter((r) => r.pr?.status === "confirmed"), [rows]);

  return (
    <>
      <PageHeader title="最終確認" subtitle="管理者面談が完了した職員の社長確認を行います" />

      <div className="card mb-6">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="text-warm-500 h-5 w-5" />
          <h2 className="text-ink-800 text-lg font-bold">
            未確認 <span className="text-ink-400 text-sm font-normal">（{pending.length}件）</span>
          </h2>
        </div>
        {pending.length === 0 ? (
          <div className="text-ink-400 py-8 text-center text-sm">未確認の職員はいません</div>
        ) : (
          <div className="space-y-2">
            {pending.map((r) => (
              <ReviewRow key={r.staff.id} row={r} />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-ink-800 mb-4 text-lg font-bold">
          確認済 <span className="text-ink-400 text-sm font-normal">（{confirmed.length}件）</span>
        </h2>
        {confirmed.length === 0 ? (
          <div className="text-ink-400 py-8 text-center text-sm">まだ確認済の職員はいません</div>
        ) : (
          <div className="space-y-2">
            {confirmed.map((r) => (
              <ReviewRow key={r.staff.id} row={r} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ReviewRow({ row }: { row: Row }) {
  const { staff, mi, pr } = row;
  return (
    <Link
      to={`/president/staff/${staff.id}`}
      className="border-cream-200 hover:border-warm-300 hover:bg-warm-50 block rounded-xl border p-4 transition"
    >
      <div className="flex items-center gap-3">
        <div className="bg-cream-100 text-ink-600 flex h-10 w-10 items-center justify-center rounded-full font-bold">
          {staff.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-ink-800 font-medium">{staff.name}</div>
          <div className="text-ink-400 text-xs">
            {staff.department} ／ {staff.jobType}
          </div>
        </div>
        <div className="hidden items-center gap-1 md:flex">
          {(Object.keys(EVAL_LABELS) as (keyof Evaluation)[]).map((k) => (
            <EvalBadge key={k} rank={mi.evaluation[k]} />
          ))}
        </div>
        <div className="ml-2">
          {pr?.status === "confirmed" ? (
            <StatusBadge label="確認済" variant="done" />
          ) : (
            <StatusBadge label="未確認" variant="pending" />
          )}
        </div>
        <ChevronRight className="text-ink-400 h-4 w-4" />
      </div>
    </Link>
  );
}
