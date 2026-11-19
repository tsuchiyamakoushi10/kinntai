/**
 * 育成面談・人事考課の画面部品 (サーバー / クライアント両方で使える素の部品)。
 */
import type { EvalRank, GrowthStep } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";

import { EVAL_RANK_HINTS, EVAL_RANKS, GROWTH_STEPS, STEP_LABELS } from "@/lib/growth/constants";

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200";

export const primaryButton =
  "rounded-lg bg-slate-900 px-5 py-3 text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-50";
export const secondaryButton =
  "rounded-lg border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50";

export function Card({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-bold text-slate-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function TextArea({
  name,
  label,
  defaultValue,
  rows = 3,
  hint,
  readOnly,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  rows?: number;
  hint?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        readOnly={readOnly}
        className={`${inputClass} ${readOnly ? "bg-slate-50" : ""}`}
      />
    </label>
  );
}

export function StepSelect({
  name,
  defaultValue,
  allowEmpty = true,
}: {
  name: string;
  defaultValue?: GrowthStep | null;
  allowEmpty?: boolean;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className={inputClass}>
      {allowEmpty && <option value="">（未設定）</option>}
      {GROWTH_STEPS.map((s) => (
        <option key={s} value={s}>
          {STEP_LABELS[s].short} {STEP_LABELS[s].title}
        </option>
      ))}
    </select>
  );
}

/** S/A/B/C を大きめのボタンで選ぶ (ラジオ) */
export function RankRadios({
  name,
  defaultValue,
  disabled,
}: {
  name: string;
  defaultValue?: EvalRank | null;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {EVAL_RANKS.map((r) => (
        <label key={r} title={EVAL_RANK_HINTS[r]} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={r}
            defaultChecked={defaultValue === r}
            disabled={disabled}
            className="peer sr-only"
          />
          <span className="inline-flex size-12 items-center justify-center rounded-lg border-2 border-slate-300 bg-white text-lg font-bold text-slate-600 peer-checked:border-pink-500 peer-checked:bg-pink-500 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-pink-300">
            {r}
          </span>
        </label>
      ))}
      <label className="cursor-pointer">
        <input
          type="radio"
          name={name}
          value=""
          defaultChecked={!defaultValue}
          disabled={disabled}
          className="peer sr-only"
        />
        <span className="inline-flex h-12 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-3 text-sm text-slate-500 peer-checked:border-slate-500 peer-checked:text-slate-800">
          未
        </span>
      </label>
    </div>
  );
}

export function CheckboxGroup({
  name,
  options,
  defaultValues,
}: {
  name: string;
  options: readonly string[];
  defaultValues: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label
          key={o}
          className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm has-[:checked]:border-pink-400 has-[:checked]:bg-pink-50"
        >
          <input type="checkbox" name={name} value={o} defaultChecked={defaultValues.includes(o)} />
          {o}
        </label>
      ))}
    </div>
  );
}

export function OptionSelect({
  name,
  options,
  defaultValue,
}: {
  name: string;
  options: readonly string[];
  defaultValue: string | null;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className={inputClass}>
      <option value="">（未設定）</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function RankBadge({ rank }: { rank: EvalRank | null | undefined }) {
  if (!rank) return <span className="text-slate-400">—</span>;
  const color: Record<EvalRank, string> = {
    S: "bg-pink-500 text-white",
    A: "bg-emerald-500 text-white",
    B: "bg-amber-400 text-slate-900",
    C: "bg-slate-500 text-white",
  };
  return (
    <span
      className={`inline-flex size-7 items-center justify-center rounded-md text-sm font-bold ${color[rank]}`}
    >
      {rank}
    </span>
  );
}

export function StepBadge({
  step,
  compact,
}: {
  step: GrowthStep | null | undefined;
  /** 表の中など狭い場所では STEP 番号だけ出す */
  compact?: boolean;
}) {
  if (!step) return <span className="text-sm whitespace-nowrap text-slate-400">未設定</span>;
  if (compact) {
    return (
      <span
        title={STEP_LABELS[step].title}
        className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-sky-800 ring-1 ring-sky-200"
      >
        {STEP_LABELS[step].short}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-800 ring-1 ring-sky-200">
      {STEP_LABELS[step].short}
      <span className="font-normal">{STEP_LABELS[step].title}</span>
    </span>
  );
}

/** STEP1〜5 の進み具合 */
export function StepIndicator({ step }: { step: GrowthStep | null | undefined }) {
  const idx = step ? GROWTH_STEPS.indexOf(step) : -1;
  return (
    <ol className="grid grid-cols-5 gap-1">
      {GROWTH_STEPS.map((s, i) => (
        <li key={s} className="flex flex-col items-center gap-1 text-center">
          <span
            className={`h-2 w-full rounded-full ${i <= idx ? "bg-sky-500" : "bg-slate-200"}`}
            aria-hidden
          />
          <span
            className={`text-[11px] leading-tight ${i === idx ? "font-bold text-sky-800" : "text-slate-500"}`}
          >
            {STEP_LABELS[s].short}
            <br />
            {STEP_LABELS[s].title}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: "done" | "doing" | "todo";
  children: ReactNode;
}) {
  const cls = {
    done: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    doing: "bg-amber-50 text-amber-800 ring-amber-200",
    todo: "bg-slate-50 text-slate-500 ring-slate-200",
  }[tone];
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ${cls}`}
    >
      {children}
    </span>
  );
}

/** 期間の切り替え (リンク) */
export function PeriodTabs({
  periods,
  currentId,
  hrefFor,
}: {
  periods: { id: string; name: string; isCurrent: boolean }[];
  currentId: string;
  hrefFor: (periodId: string) => string;
}) {
  if (periods.length <= 1) return null;
  return (
    <nav aria-label="期間" className="flex flex-wrap gap-2">
      {periods.map((p) => (
        <Link
          key={p.id}
          href={hrefFor(p.id)}
          aria-current={p.id === currentId ? "page" : undefined}
          className={`rounded-full px-3 py-1.5 text-sm ${
            p.id === currentId
              ? "bg-slate-900 font-semibold text-white"
              : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
          }`}
        >
          {p.name}
          {p.isCurrent && "（いま）"}
        </Link>
      ))}
    </nav>
  );
}
