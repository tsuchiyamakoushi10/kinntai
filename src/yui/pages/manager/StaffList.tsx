"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/yui/router";
import { ChevronRight, UserPlus } from "lucide-react";
import { useAuth } from "@/yui/auth";
import { staffStore, staffInterviewStore, managerInterviewStore, periodStore } from "@/yui/storage";
import type { Staff, StaffInterview, ManagerInterview } from "../../types";
import { isRetired } from "../../types";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";
import { formatDate } from "../../utils/date";

interface Row {
  staff: Staff;
  staffInterview: StaffInterview | null;
  managerInterview: ManagerInterview | null;
}

export default function ManagerStaffList() {
  const { user } = useAuth();
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [showRetired, setShowRetired] = useState(false);

  useEffect(() => {
    if (!user) return;
    const period = periodStore.active();
    const pk = period?.label === "2026年 上期" ? "2026-上期" : (period?.label ?? "");
    const myStaff = staffStore.list().filter((s) => s.managerId === user.id);
    setAllRows(
      myStaff.map((s) => ({
        staff: s,
        staffInterview: staffInterviewStore.byStaffAndPeriod(s.id, pk),
        managerInterview: managerInterviewStore.byStaffAndPeriod(s.id, pk),
      })),
    );
  }, [user]);

  const retiredCount = useMemo(() => allRows.filter((r) => isRetired(r.staff)).length, [allRows]);

  const rows = useMemo(
    () => allRows.filter((r) => (showRetired ? true : !isRetired(r.staff))),
    [allRows, showRetired],
  );

  return (
    <>
      <PageHeader
        title="部署職員一覧"
        subtitle={`${user?.department ?? ""} の職員の面談・評価進捗`}
        right={
          <Link
            to="/manager/staff-list/new"
            className="bg-warm-500 hover:bg-warm-600 shadow-soft inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold text-white transition"
          >
            <UserPlus className="h-4 w-4" />
            ＋職員追加
          </Link>
        }
      />

      <div className="card mb-4 py-3">
        <label className="text-ink-600 flex cursor-pointer items-center gap-2 text-sm select-none">
          <input
            type="checkbox"
            className="accent-warm-500 h-4 w-4"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.target.checked)}
          />
          <span>退職者も表示</span>
          {retiredCount > 0 && (
            <span className="chip bg-cream-100 text-ink-600">{retiredCount}名</span>
          )}
        </label>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="text-ink-400 py-10 text-center text-sm">
            あなたの部署に登録された職員がいません
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <StaffRow key={row.staff.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function StaffRow({ row }: { row: Row }) {
  const { staff, staffInterview, managerInterview } = row;
  const retired = isRetired(staff);

  const submitBadge = staffInterview ? (
    <StatusBadge label="提出済" variant="done" />
  ) : (
    <StatusBadge label="未提出" variant="pending" />
  );

  const interviewBadge =
    managerInterview?.status === "done" ? (
      <StatusBadge label="面談済" variant="done" />
    ) : managerInterview?.status === "in_progress" ? (
      <StatusBadge label="面談予定" variant="progress" />
    ) : (
      <StatusBadge label="未対応" variant="pending" />
    );

  const evalDone =
    managerInterview && Object.values(managerInterview.evaluation).every((v) => v !== null);
  const evalBadge = evalDone ? (
    <StatusBadge label="評価済" variant="done" />
  ) : (
    <StatusBadge label="未評価" variant="pending" />
  );

  return (
    <Link
      to={`/manager/staff/${staff.id}`}
      className={`block rounded-xl border p-4 transition ${
        retired
          ? "border-cream-200 bg-cream-50 hover:border-cream-300"
          : "border-cream-200 hover:border-warm-300 hover:bg-warm-50"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="bg-cream-100 text-ink-600 flex h-10 w-10 items-center justify-center rounded-full font-bold">
          {staff.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-ink-800 flex items-center gap-2 font-medium">
            {staff.name}
            {retired && <span className="chip bg-ink-400/10 text-ink-400">退職済</span>}
            {staff.employmentStatus &&
              staff.employmentStatus !== "在籍中" &&
              staff.employmentStatus !== "退職済" && (
                <span className="chip bg-sage-100 text-sage-600">{staff.employmentStatus}</span>
              )}
          </div>
          <div className="text-ink-400 flex flex-wrap gap-x-2 text-xs">
            <span>{staff.jobType}</span>
            <span>·</span>
            <span>{staff.employmentType}</span>
            <span>·</span>
            <span>入社 {formatDate(staff.joinedAt)}</span>
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          {submitBadge}
          {interviewBadge}
          {evalBadge}
        </div>
        <ChevronRight className="text-ink-400 h-4 w-4" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 md:hidden">
        {submitBadge}
        {interviewBadge}
        {evalBadge}
      </div>
    </Link>
  );
}
