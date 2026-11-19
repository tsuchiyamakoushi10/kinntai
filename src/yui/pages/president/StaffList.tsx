"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/yui/router";
import { Search, ChevronRight, Pencil, X, Check } from "lucide-react";
import {
  staffStore,
  staffInterviewStore,
  managerInterviewStore,
  periodStore,
  presidentReviewStore,
} from "@/yui/storage";
import type {
  Staff,
  StaffInterview,
  ManagerInterview,
  PresidentReview,
  Department,
} from "../../types";
import { isRetired, ALL_DEPARTMENTS, DEPARTMENT_MASTER } from "../../types";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";

interface Row {
  staff: Staff;
  managerName: string;
  si: StaffInterview | null;
  mi: ManagerInterview | null;
  pr: PresidentReview | null;
}

export default function PresidentStaffList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);

  const load = () => {
    const period = periodStore.active();
    const pk = period?.label === "2026年 上期" ? "2026-上期" : (period?.label ?? "");
    const staffs = staffStore.list().filter((s) => s.role === "staff");
    setRows(
      staffs.map((s) => ({
        staff: s,
        managerName: s.managerId ? (staffStore.get(s.managerId)?.name ?? "—") : "—",
        si: staffInterviewStore.byStaffAndPeriod(s.id, pk),
        mi: managerInterviewStore.byStaffAndPeriod(s.id, pk),
        pr: presidentReviewStore.byStaffAndPeriod(s.id, pk),
      })),
    );
  };

  useEffect(() => {
    load();
  }, []);

  const depts = useMemo(() => {
    return Array.from(
      new Set(
        staffStore
          .list()
          .map((s) => s.department)
          .filter(Boolean),
      ),
    ).sort();
  }, [rows]);

  const managers = useMemo(
    () => staffStore.list().filter((s) => s.role === "manager" && s.active),
    [rows],
  );

  const retiredCount = useMemo(() => rows.filter((r) => isRetired(r.staff)).length, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!showRetired && isRetired(r.staff)) return false;
      if (deptFilter && r.staff.department !== deptFilter) return false;
      if (filter) {
        const t = filter.toLowerCase();
        if (!r.staff.name.toLowerCase().includes(t) && !r.staff.jobType.toLowerCase().includes(t)) {
          return false;
        }
      }
      return true;
    });
  }, [rows, filter, deptFilter, showRetired]);

  return (
    <>
      <PageHeader title="職員一覧" subtitle="全職員を一覧で確認・編集します" />

      <div className="card mb-6">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="text-ink-400 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <input
              className="input-base pl-9"
              placeholder="氏名・職種で検索"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <select
            className="input-base md:w-56"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="">すべての所属</option>
            {depts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <label className="text-ink-600 mt-3 flex cursor-pointer items-center gap-2 text-sm select-none">
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
        {filtered.length === 0 ? (
          <div className="text-ink-400 py-10 text-center text-sm">該当する職員がいません</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <div
                key={r.staff.id}
                className="border-cream-200 hover:border-warm-300 rounded-xl border transition"
              >
                <div className="flex items-center gap-3 p-4">
                  <Link
                    to={`/president/staff/${r.staff.id}`}
                    className="hover:bg-warm-50 -m-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 transition"
                  >
                    <div className="bg-cream-100 text-ink-600 flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold">
                      {r.staff.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-ink-800 font-medium">{r.staff.name}</div>
                      <div className="text-ink-400 flex flex-wrap gap-x-2 text-xs">
                        <span>{r.staff.department}</span>
                        <span>·</span>
                        <span>{r.staff.jobType}</span>
                        <span>·</span>
                        <span>管理者：{r.managerName}</span>
                      </div>
                    </div>
                  </Link>

                  <div className="hidden items-center gap-2 md:flex">
                    {r.pr?.needsFollowUp && <StatusBadge label="要フォロー" variant="warning" />}
                    {r.si ? (
                      <StatusBadge label="提出済" variant="done" />
                    ) : (
                      <StatusBadge label="未提出" variant="pending" />
                    )}
                    {r.mi?.status === "done" ? (
                      <StatusBadge label="面談済" variant="done" />
                    ) : (
                      <StatusBadge label="面談前" variant="pending" />
                    )}
                    {r.pr?.status === "confirmed" ? (
                      <StatusBadge label="社長確認済" variant="done" />
                    ) : (
                      <StatusBadge label="社長未確認" variant="pending" />
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditing(r.staff)}
                    className="text-ink-600 border-cream-200 hover:bg-warm-50 hover:border-warm-300 hover:text-warm-600 inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    編集
                  </button>

                  <Link
                    to={`/president/staff/${r.staff.id}`}
                    className="text-ink-400 hover:text-warm-500 shrink-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditStaffModal
          staff={editing}
          managers={managers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function EditStaffModal({
  staff,
  managers,
  onClose,
  onSaved,
}: {
  staff: Staff;
  managers: Staff[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [department, setDepartment] = useState<Department>(staff.department);
  const [managerId, setManagerId] = useState<string>(staff.managerId ?? "");

  const handleSave = () => {
    staffStore.upsert({
      ...staff,
      department,
      managerId: managerId || null,
    });
    onSaved();
  };

  return (
    <div
      className="bg-ink-800/40 fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="shadow-card w-full max-w-md rounded-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-cream-100 flex items-center justify-between border-b px-5 py-4">
          <div>
            <div className="text-ink-400 text-xs">職員情報を編集</div>
            <h3 className="text-ink-800 text-base font-bold">{staff.name} さん</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-400 hover:bg-cream-100 hover:text-ink-800 flex h-8 w-8 items-center justify-center rounded-full transition"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="text-ink-600 mb-1.5 block text-xs font-medium">所属部署</label>
            <select
              className="input-base"
              value={department}
              onChange={(e) => setDepartment(e.target.value as Department)}
            >
              {ALL_DEPARTMENTS.map((d) => {
                const isPrep = DEPARTMENT_MASTER.find((m) => m.name === d)?.status === "prep";
                return (
                  <option key={d} value={d}>
                    {d}
                    {isPrep ? "（準備中）" : ""}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="text-ink-600 mb-1.5 block text-xs font-medium">担当管理者</label>
            <select
              className="input-base"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
            >
              <option value="">— 未設定 —</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}（{m.department}）
                </option>
              ))}
            </select>
            <p className="text-ink-400 mt-1.5 text-xs leading-relaxed">
              担当管理者を変更すると、変更後の管理者のホームに表示されます。
            </p>
          </div>
        </div>

        <div className="border-cream-100 bg-cream-50 flex items-center justify-end gap-2 rounded-b-2xl border-t px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="text-ink-600 rounded-full px-4 py-2 text-sm font-medium transition hover:bg-white"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="bg-warm-500 hover:bg-warm-600 shadow-soft inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-bold text-white transition"
          >
            <Check className="h-4 w-4" />
            保存する
          </button>
        </div>
      </div>
    </div>
  );
}
