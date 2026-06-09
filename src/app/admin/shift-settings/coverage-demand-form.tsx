"use client";

import type { DayKind } from "@prisma/client";
import { useMemo, useState, useTransition } from "react";

import {
  COVERAGE_DEMAND_BOUNDS,
  DAY_KINDS,
  DAY_KIND_LABELS,
  isOperatingDay,
  type CoverageDemandValues,
} from "@/lib/shift/coverage-demand";

import { saveOfficeCoverageDemand } from "./actions";

type FieldKey = keyof CoverageDemandValues;

const ROWS: ReadonlyArray<{ key: FieldKey; label: string }> = [
  { key: "amRequired", label: "午前の必要人数" },
  { key: "pmRequired", label: "午後の必要人数" },
  { key: "counselorAmRequired", label: "うち相談員 (午前)" },
  { key: "counselorPmRequired", label: "うち相談員 (午後)" },
  { key: "earlyAmRequired", label: "うち送迎 (8:15開始)" },
  { key: "nightInRequired", label: "夜入" },
  { key: "nightOutRequired", label: "夜明" },
];

type Values = Record<DayKind, CoverageDemandValues>;

type Props = {
  officeId: string;
  initial: Values;
};

export function CoverageDemandForm({ officeId, initial }: Props) {
  const [values, setValues] = useState<Values>(initial);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(
    null,
  );

  const dirty = useMemo(
    () => DAY_KINDS.some((dk) => ROWS.some((r) => values[dk][r.key] !== initial[dk][r.key])),
    [values, initial],
  );

  function setCell(dayKind: DayKind, key: FieldKey, raw: string): void {
    const n = Number.parseInt(raw, 10);
    const v = Number.isFinite(n) && n >= 0 ? n : 0;
    setValues((prev) => ({ ...prev, [dayKind]: { ...prev[dayKind], [key]: v } }));
  }

  function reset(): void {
    setValues(initial);
    setFeedback(null);
  }

  function handleSave(): void {
    setFeedback(null);
    startTransition(async () => {
      const result = await saveOfficeCoverageDemand({
        officeId,
        demands: DAY_KINDS.map((dayKind) => ({ dayKind, values: values[dayKind] })),
      });
      setFeedback(
        result.ok
          ? { kind: "success", message: "保存しました。" }
          : { kind: "error", message: result.error },
      );
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        「午前◯名・午後◯名」で必要人数を決めます (相談員を含む総数)。合計が 0 の列は{" "}
        <span className="font-medium">休業日</span> 扱いになります (例: デイの日祝)。
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th scope="col" className="px-3 py-2">
                項目
              </th>
              {DAY_KINDS.map((dk) => (
                <th key={dk} scope="col" className="w-28 px-3 py-2 text-center">
                  {DAY_KIND_LABELS[dk]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-700">{row.label}</td>
                {DAY_KINDS.map((dk) => {
                  const { min, max } = COVERAGE_DEMAND_BOUNDS[row.key];
                  return (
                    <td key={dk} className="px-3 py-2 text-center">
                      <input
                        type="number"
                        min={min}
                        max={max}
                        step={1}
                        value={values[dk][row.key]}
                        onChange={(e) => setCell(dk, row.key, e.target.value)}
                        aria-label={`${DAY_KIND_LABELS[dk]} の${row.label}`}
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-3 py-2 text-xs font-medium text-slate-500">営業日判定</td>
              {DAY_KINDS.map((dk) => {
                const open = isOperatingDay(values[dk]);
                return (
                  <td key={dk} className="px-3 py-2 text-center">
                    <span
                      className={
                        open
                          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700"
                          : "rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600"
                      }
                    >
                      {open ? "営業" : "休業"}
                    </span>
                  </td>
                );
              })}
            </tr>
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
