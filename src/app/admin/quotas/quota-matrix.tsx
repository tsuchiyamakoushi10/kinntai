"use client";

import { DayKind, type ShiftKind } from "@prisma/client";
import { useMemo, useState, useTransition } from "react";

import { SHIFT_KIND_LABELS } from "@/lib/shift-labels";

import { saveOfficeShiftQuotas, type QuotaInput } from "./actions";

export type PatternRow = {
  id: string;
  code: string;
  name: string;
  shiftKind: ShiftKind;
  color: string;
  isShared: boolean;
};

export type QuotaValue = {
  shiftPatternId: string;
  dayKind: DayKind;
  requiredCount: number;
};

type Props = {
  officeId: string;
  patterns: ReadonlyArray<PatternRow>;
  initialQuotas: ReadonlyArray<QuotaValue>;
};

const DAY_KIND_LABELS: Record<DayKind, string> = {
  WEEKDAY: "平日",
  SATURDAY: "土",
  SUNDAY_HOLIDAY: "日祝",
};

const DAY_KIND_ORDER: ReadonlyArray<DayKind> = [
  DayKind.WEEKDAY,
  DayKind.SATURDAY,
  DayKind.SUNDAY_HOLIDAY,
];

const MAX_REQUIRED_COUNT = 99;

function quotaKey(patternId: string, dayKind: DayKind): string {
  return `${patternId}:${dayKind}`;
}

export function QuotaMatrix({ officeId, patterns, initialQuotas }: Props) {
  const initialMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of initialQuotas) {
      m.set(quotaKey(q.shiftPatternId, q.dayKind), q.requiredCount);
    }
    return m;
  }, [initialQuotas]);

  const [values, setValues] = useState<Map<string, number>>(() => new Map(initialMap));
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    { kind: "success"; message: string } | { kind: "error"; message: string } | null
  >(null);

  const dirty = useMemo(() => {
    if (values.size !== initialMap.size) {
      // 編集で値が増えた可能性 (新規セル) を比較
    }
    for (const p of patterns) {
      for (const dk of DAY_KIND_ORDER) {
        const k = quotaKey(p.id, dk);
        const before = initialMap.get(k) ?? 0;
        const after = values.get(k) ?? 0;
        if (before !== after) return true;
      }
    }
    return false;
  }, [patterns, initialMap, values]);

  function setCount(patternId: string, dayKind: DayKind, count: number): void {
    const next = new Map(values);
    next.set(quotaKey(patternId, dayKind), count);
    setValues(next);
  }

  function copyColumn(from: DayKind, to: DayKind): void {
    const next = new Map(values);
    for (const p of patterns) {
      const fromCount = values.get(quotaKey(p.id, from)) ?? 0;
      next.set(quotaKey(p.id, to), fromCount);
    }
    setValues(next);
  }

  function clearAll(): void {
    const next = new Map<string, number>();
    setValues(next);
  }

  function reset(): void {
    setValues(new Map(initialMap));
    setFeedback(null);
  }

  function handleSave(): void {
    setFeedback(null);
    const payload: QuotaInput[] = [];
    for (const p of patterns) {
      for (const dk of DAY_KIND_ORDER) {
        const count = values.get(quotaKey(p.id, dk)) ?? 0;
        payload.push({ shiftPatternId: p.id, dayKind: dk, requiredCount: count });
      }
    }
    startTransition(async () => {
      const result = await saveOfficeShiftQuotas({ officeId, quotas: payload });
      if (result.ok) {
        setFeedback({ kind: "success", message: `${result.upserted} 件保存しました。` });
      } else {
        setFeedback({ kind: "error", message: result.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => copyColumn(DayKind.WEEKDAY, DayKind.SATURDAY)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          平日 → 土 にコピー
        </button>
        <button
          type="button"
          onClick={() => copyColumn(DayKind.WEEKDAY, DayKind.SUNDAY_HOLIDAY)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          平日 → 日祝 にコピー
        </button>
        <button
          type="button"
          onClick={() => copyColumn(DayKind.SATURDAY, DayKind.SUNDAY_HOLIDAY)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          土 → 日祝 にコピー
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          すべて 0 にクリア
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th scope="col" className="px-3 py-2">
                シフトパターン
              </th>
              <th scope="col" className="px-3 py-2">
                種別
              </th>
              {DAY_KIND_ORDER.map((dk) => (
                <th key={dk} scope="col" className="w-28 px-3 py-2 text-center">
                  {DAY_KIND_LABELS[dk]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {patterns.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-sm border border-slate-300"
                      style={{ backgroundColor: p.color }}
                      aria-hidden
                    />
                    <span className="font-medium text-slate-900">{p.name}</span>
                    <span className="text-xs text-slate-400">{p.code}</span>
                    {p.isShared && (
                      <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                        全拠点共通
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {SHIFT_KIND_LABELS[p.shiftKind]}
                </td>
                {DAY_KIND_ORDER.map((dk) => {
                  const k = quotaKey(p.id, dk);
                  const value = values.get(k) ?? 0;
                  return (
                    <td key={dk} className="px-3 py-2 text-center">
                      <input
                        type="number"
                        min={0}
                        max={MAX_REQUIRED_COUNT}
                        step={1}
                        value={value}
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10);
                          setCount(p.id, dk, Number.isFinite(n) && n >= 0 ? n : 0);
                        }}
                        aria-label={`${p.name} ${DAY_KIND_LABELS[dk]} の必要人員数`}
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "保存中…" : "保存"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending || !dirty}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          変更を破棄
        </button>
        {feedback && (
          <span
            role={feedback.kind === "error" ? "alert" : "status"}
            className={
              feedback.kind === "error"
                ? "text-sm font-medium text-red-700"
                : "text-sm font-medium text-emerald-700"
            }
          >
            {feedback.message}
          </span>
        )}
      </div>
    </div>
  );
}
