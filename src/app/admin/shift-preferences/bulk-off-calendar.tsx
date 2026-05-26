"use client";

import { useActionState, useMemo, useState } from "react";

import type { BulkOffFormState } from "./actions";

type Props = {
  action: (state: BulkOffFormState, formData: FormData) => Promise<BulkOffFormState>;
  employeeId: string;
  employeeName: string;
  ym: string;
  days: ReadonlyArray<string>;
  /** 月の 1 日が JST で何曜日か (0=日 .. 6=土) */
  firstWeekday: number;
  initialSelected: ReadonlyArray<string>;
};

const WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 1 社員 × 1 月のカレンダー多選択フォーム。
 * クリックで日付の選択／解除を切り替え、保存で月内の希望休を上書きする。
 */
export function BulkOffCalendar({
  action,
  employeeId,
  employeeName,
  ym,
  days,
  firstWeekday,
  initialSelected,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  const [state, formAction, pending] = useActionState<BulkOffFormState, FormData>(action, {});

  const toggle = (date: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const clearAll = () => setSelected(new Set());

  const sortedSelected = useMemo(() => Array.from(selected).sort(), [selected]);
  const datesCsv = sortedSelected.join(",");

  // 月初の曜日に合わせて空セルを差し込む
  const leadEmpty = Array.from({ length: firstWeekday });

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="ym" value={ym} />
      <input type="hidden" name="dates" value={datesCsv} />

      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{employeeName} さんの希望休</p>
          <p className="text-xs text-slate-500">
            {formatYm(ym)} ／ 選択中 {selected.size} 日
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={clearAll}
            disabled={selected.size === 0 || pending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            選択をクリア
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "保存中…" : "希望休を保存"}
          </button>
        </div>
      </header>

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
          const isSelected = selected.has(d);
          const baseColor =
            wd === 0 ? "text-rose-600" : wd === 6 ? "text-sky-600" : "text-slate-900";
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              aria-pressed={isSelected}
              className={
                isSelected
                  ? "h-12 rounded-lg bg-amber-300 font-bold text-amber-900 ring-2 ring-amber-500"
                  : `h-12 rounded-lg bg-slate-50 font-medium hover:bg-slate-100 ${baseColor}`
              }
            >
              {day}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-500">
        日付をクリックすると選択/解除。保存すると {formatYm(ym)} の希望休が上書きされます
        (希望夜勤や勤務不可は影響しません)。
      </p>
    </form>
  );
}

function formatYm(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y} 年 ${Number(m)} 月`;
}
