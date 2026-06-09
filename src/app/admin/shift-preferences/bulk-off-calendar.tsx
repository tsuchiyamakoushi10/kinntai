"use client";

import { useActionState, useMemo, useState } from "react";

import type { BulkOffFormState } from "./actions";

/** カレンダーで扱う希望種別 (希望休 / 有給 / 夜勤希望)。 */
type PrefType = "REQUESTED_OFF" | "PAID_LEAVE" | "PREFERRED_NIGHT";

type Mark = { date: string; type: PrefType };

type Props = {
  action: (state: BulkOffFormState, formData: FormData) => Promise<BulkOffFormState>;
  employeeId: string;
  employeeName: string;
  ym: string;
  days: ReadonlyArray<string>;
  /** 月の 1 日が JST で何曜日か (0=日 .. 6=土) */
  firstWeekday: number;
  /** 既存の希望休 / 有給 / 夜勤希望 (日付 + 種別)。 */
  initialMarks: ReadonlyArray<Mark>;
  /** 夜勤のある拠点 (ショート/NRS) のとき true。夜勤希望の種別を出す。 */
  allowNight?: boolean;
};

const WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const TYPE_LABEL: Record<PrefType, string> = {
  REQUESTED_OFF: "希望休",
  PAID_LEAVE: "有給",
  PREFERRED_NIGHT: "夜勤希望",
};
// 勤務表の凡例と色を統一 (希望休=ピンク / 有給=アンバー / 夜勤希望=藍)。
const TYPE_STYLE: Record<PrefType, { sel: string; chip: string }> = {
  REQUESTED_OFF: {
    sel: "bg-pink-200 font-bold text-pink-900 ring-2 ring-pink-500",
    chip: "bg-pink-200 text-pink-900",
  },
  PAID_LEAVE: {
    sel: "bg-amber-200 font-bold text-amber-900 ring-2 ring-amber-500",
    chip: "bg-amber-200 text-amber-900",
  },
  PREFERRED_NIGHT: {
    sel: "bg-indigo-200 font-bold text-indigo-900 ring-2 ring-indigo-500",
    chip: "bg-indigo-200 text-indigo-900",
  },
};

/**
 * 1 社員 × 1 月のカレンダー多選択フォーム。
 * 「塗る種別」(希望休 / 有給) を選び、日付クリックでその種別を付与/解除する (1 日 1 種別)。
 * 保存で月内の希望休・有給をまとめて上書きする (希望夜勤・勤務不可は触らない)。
 */
export function BulkOffCalendar({
  action,
  employeeId,
  employeeName,
  ym,
  days,
  firstWeekday,
  initialMarks,
  allowNight = false,
}: Props) {
  const [marks, setMarks] = useState<Map<string, PrefType>>(
    () => new Map(initialMarks.map((m) => [m.date, m.type])),
  );
  const [paintType, setPaintType] = useState<PrefType>("REQUESTED_OFF");
  const [state, formAction, pending] = useActionState<BulkOffFormState, FormData>(action, {});

  // 表示する種別 (夜勤希望は夜勤のある拠点だけ)。
  const visibleTypes: PrefType[] = allowNight
    ? ["REQUESTED_OFF", "PAID_LEAVE", "PREFERRED_NIGHT"]
    : ["REQUESTED_OFF", "PAID_LEAVE"];

  const toggle = (date: string) => {
    setMarks((prev) => {
      const next = new Map(prev);
      if (next.get(date) === paintType) next.delete(date);
      else next.set(date, paintType);
      return next;
    });
  };

  const clearAll = () => setMarks(new Map());

  const offCount = useMemo(
    () => [...marks.values()].filter((t) => t === "REQUESTED_OFF").length,
    [marks],
  );
  const paidCount = useMemo(
    () => [...marks.values()].filter((t) => t === "PAID_LEAVE").length,
    [marks],
  );

  const requestedOffCsv = useMemo(
    () =>
      [...marks.entries()]
        .filter(([, t]) => t === "REQUESTED_OFF")
        .map(([d]) => d)
        .sort()
        .join(","),
    [marks],
  );
  const paidLeaveCsv = useMemo(
    () =>
      [...marks.entries()]
        .filter(([, t]) => t === "PAID_LEAVE")
        .map(([d]) => d)
        .sort()
        .join(","),
    [marks],
  );
  const preferredNightCsv = useMemo(
    () =>
      [...marks.entries()]
        .filter(([, t]) => t === "PREFERRED_NIGHT")
        .map(([d]) => d)
        .sort()
        .join(","),
    [marks],
  );
  const nightCount = useMemo(
    () => [...marks.values()].filter((t) => t === "PREFERRED_NIGHT").length,
    [marks],
  );

  // 月初の曜日に合わせて空セルを差し込む
  const leadEmpty = Array.from({ length: firstWeekday });

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="ym" value={ym} />
      <input type="hidden" name="requestedOff" value={requestedOffCsv} />
      <input type="hidden" name="paidLeave" value={paidLeaveCsv} />
      <input type="hidden" name="preferredNight" value={preferredNightCsv} />

      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {employeeName} さんの希望休 / 有給{allowNight ? " / 夜勤希望" : ""}
          </p>
          <p className="text-xs text-slate-500">
            {formatYm(ym)} ／ 希望休 {offCount} 日・有給 {paidCount} 日
            {allowNight ? `・夜勤希望 ${nightCount} 日` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={clearAll}
            disabled={marks.size === 0 || pending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            選択をクリア
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "保存中…" : "保存"}
          </button>
        </div>
      </header>

      {/* 塗る種別の切替 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600">クリックで付ける種別:</span>
        {visibleTypes.map((t) => {
          const active = paintType === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setPaintType(t)}
              aria-pressed={active}
              className={[
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm",
                active ? "border-slate-900 ring-2 ring-slate-900/30" : "border-slate-300",
              ].join(" ")}
            >
              <span className={`inline-block size-3 rounded-sm ${TYPE_STYLE[t].chip}`} />
              {TYPE_LABEL[t]}
            </button>
          );
        })}
      </div>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.saved !== undefined && !state.error && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          保存しました ({state.saved} 日)
        </p>
      )}

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEK_LABELS.map((w, i) => (
          <div
            key={w}
            className={i === 0 ? "text-rose-600" : i === 6 ? "text-sky-600" : "text-slate-500"}
          >
            {w}
          </div>
        ))}
        {leadEmpty.map((_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {days.map((d) => {
          const day = Number(d.slice(8));
          const wd = (firstWeekday + day - 1) % 7;
          const mark = marks.get(d);
          const baseColor =
            wd === 0 ? "text-rose-600" : wd === 6 ? "text-sky-600" : "text-slate-900";
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              aria-pressed={mark !== undefined}
              title={mark ? TYPE_LABEL[mark] : undefined}
              className={
                mark
                  ? `h-12 rounded-lg ${TYPE_STYLE[mark].sel}`
                  : `h-12 rounded-lg bg-slate-50 font-medium hover:bg-slate-100 ${baseColor}`
              }
            >
              {day}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-500">
        上で種別を選んでから日付をクリックすると付与/解除できます (1 日 1 種別)。保存すると{" "}
        {formatYm(ym)} の希望休・有給{allowNight ? "・夜勤希望" : ""}が上書きされます
        (勤務不可は影響しません)。
      </p>
    </form>
  );
}

function formatYm(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y} 年 ${Number(m)} 月`;
}
