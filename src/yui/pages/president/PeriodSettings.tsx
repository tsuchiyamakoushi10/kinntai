"use client";

/**
 * CrossShift 追加: 評価期間の設定。結いナビでは期間を画面から増やせなかったため足した。
 * 記録は期間の名前 (例「2026年 下期」) で結びつくので、記録がある期間の名前は変えられない。
 */
import { useState } from "react";
import { Link } from "@/yui/router";
import { ArrowLeft, CalendarRange, CheckCircle2, Plus, Save } from "lucide-react";
import {
  periodStore,
  uid,
  staffInterviewStore,
  managerInterviewStore,
  hrAssessmentStore,
  presidentReviewStore,
  growthExpectationStore,
} from "@/yui/storage";
import PageHeader from "../../components/PageHeader";
import type { Period } from "../../types";

function hasRecords(label: string): boolean {
  return (
    staffInterviewStore.list().some((x) => x.period === label) ||
    managerInterviewStore.byPeriod(label).length > 0 ||
    hrAssessmentStore.byPeriod(label).length > 0 ||
    presidentReviewStore.byPeriod(label).length > 0 ||
    growthExpectationStore.list().some((x) => x.period === label)
  );
}

/** いまの期間の次の半期 (上期 4〜9月 / 下期 10〜翌3月) */
function nextHalf(periods: Period[]): Omit<Period, "id" | "active"> {
  const last = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate)).at(-1);
  const base = last ? new Date(`${last.endDate}T00:00:00`) : new Date();
  base.setDate(base.getDate() + 1);
  const y = base.getFullYear();
  const m = base.getMonth() + 1;
  if (m >= 4 && m <= 9) {
    return { label: `${y}年 上期`, startDate: `${y}-04-01`, endDate: `${y}-09-30` };
  }
  const fy = m <= 3 ? y - 1 : y;
  return { label: `${fy}年 下期`, startDate: `${fy}-10-01`, endDate: `${fy + 1}-03-31` };
}

export default function PeriodSettings() {
  const [periods, setPeriods] = useState<Period[]>(() =>
    periodStore.list().sort((a, b) => b.startDate.localeCompare(a.startDate)),
  );
  const [draft, setDraft] = useState(() => nextHalf(periodStore.list()));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const reload = () =>
    setPeriods(periodStore.list().sort((a, b) => b.startDate.localeCompare(a.startDate)));

  const add = () => {
    const label = draft.label.trim();
    if (!label || !draft.startDate || !draft.endDate) {
      setError("期間の名前・開始日・終了日を入力してください");
      return;
    }
    if (draft.startDate > draft.endDate) {
      setError("終了日は開始日より後にしてください");
      return;
    }
    if (periodStore.list().some((p) => p.label === label)) {
      setError("同じ名前の期間があります");
      return;
    }
    periodStore.upsert({
      id: uid("period"),
      label,
      startDate: draft.startDate,
      endDate: draft.endDate,
      active: false,
    });
    setError("");
    setMessage(`「${label}」を追加しました`);
    setDraft(nextHalf(periodStore.list()));
    reload();
  };

  const makeActive = (p: Period) => {
    periodStore.upsert({ ...p, active: true });
    setMessage(`いまの期間を「${p.label}」にしました`);
    reload();
  };

  const saveDates = (p: Period, startDate: string, endDate: string) => {
    periodStore.upsert({ ...p, startDate, endDate });
    reload();
  };

  return (
    <>
      <PageHeader
        title="評価期間"
        subtitle="面談・人事考課をまとめる半期を管理します"
        right={
          <Link
            to="/president/settings"
            className="text-ink-600 border-cream-200 hover:bg-cream-50 inline-flex items-center gap-1.5 rounded-full border bg-white px-4 py-2 text-sm font-medium transition"
          >
            <ArrowLeft className="h-4 w-4" />
            設定に戻る
          </Link>
        }
      />

      {message && (
        <div className="card bg-sage-50 border-sage-200 mb-5 flex items-center gap-3">
          <CheckCircle2 className="text-sage-600 h-5 w-5 shrink-0" />
          <span className="text-ink-800 text-sm">{message}</span>
        </div>
      )}

      <section className="card mb-5">
        <div className="border-cream-100 mb-4 flex items-center gap-2 border-b pb-3">
          <div className="bg-warm-100 text-warm-600 flex h-8 w-8 items-center justify-center rounded-lg">
            <CalendarRange className="h-4 w-4" />
          </div>
          <h2 className="text-ink-800 font-bold">期間の一覧</h2>
        </div>
        <div className="space-y-3">
          {periods.map((p) => (
            <PeriodRow
              key={p.id}
              period={p}
              locked={hasRecords(p.label)}
              onActive={() => makeActive(p)}
              onSave={(s, e) => saveDates(p, s, e)}
            />
          ))}
        </div>
      </section>

      <section className="card">
        <div className="border-cream-100 mb-4 flex items-center gap-2 border-b pb-3">
          <div className="bg-warm-100 text-warm-600 flex h-8 w-8 items-center justify-center rounded-lg">
            <Plus className="h-4 w-4" />
          </div>
          <h2 className="text-ink-800 font-bold">期間を追加</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label-base">名前</label>
            <input
              className="input-base"
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            />
          </div>
          <div>
            <label className="label-base">開始日</label>
            <input
              type="date"
              className="input-base"
              value={draft.startDate}
              onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
            />
          </div>
          <div>
            <label className="label-base">終了日</label>
            <input
              type="date"
              className="input-base"
              value={draft.endDate}
              onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
            />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-orange-700">{error}</p>}
        <div className="mt-5">
          <button type="button" className="btn-primary" onClick={add}>
            <Plus className="h-4 w-4" />
            追加する
          </button>
        </div>
      </section>
    </>
  );
}

function PeriodRow({
  period,
  locked,
  onActive,
  onSave,
}: {
  period: Period;
  locked: boolean;
  onActive: () => void;
  onSave: (startDate: string, endDate: string) => void;
}) {
  const [start, setStart] = useState(period.startDate);
  const [end, setEnd] = useState(period.endDate);
  const dirty = start !== period.startDate || end !== period.endDate;
  return (
    <div
      className={`rounded-xl border p-4 ${
        period.active ? "border-warm-300 bg-warm-50" : "border-cream-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-ink-800 text-base font-bold">{period.label}</span>
        {period.active ? (
          <span className="chip bg-warm-500 text-white">いまの期間</span>
        ) : (
          <button type="button" className="btn-secondary !px-4 !py-1.5 text-sm" onClick={onActive}>
            いまの期間にする
          </button>
        )}
        {locked && <span className="text-ink-400 text-xs">記録あり</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="label-base">開始日</label>
          <input
            type="date"
            className="input-base"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div>
          <label className="label-base">終了日</label>
          <input
            type="date"
            className="input-base"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        {dirty && (
          <button
            type="button"
            className="btn-primary !px-4 !py-2 text-sm"
            onClick={() => start && end && start <= end && onSave(start, end)}
          >
            <Save className="h-4 w-4" />
            保存
          </button>
        )}
      </div>
    </div>
  );
}
