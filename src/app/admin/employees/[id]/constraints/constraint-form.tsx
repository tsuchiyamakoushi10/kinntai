"use client";

import { useActionState } from "react";

import type { ShiftConstraintFormState, ShiftConstraintFormValues } from "./actions";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

type Props = {
  action: (
    state: ShiftConstraintFormState,
    formData: FormData,
  ) => Promise<ShiftConstraintFormState>;
  initial: ShiftConstraintFormValues;
};

export function ConstraintForm({ action, initial }: Props) {
  const [state, formAction, pending] = useActionState<ShiftConstraintFormState, FormData>(action, {
    values: initial,
  });
  const v = state.values ?? initial;
  const selectedDays = new Set(
    v.unavailableDaysOfWeek
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number),
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="月間勤務時間上限 (時間)" hint="空欄 = 制限なし">
          <input
            type="number"
            name="maxMonthlyWorkHours"
            defaultValue={v.maxMonthlyWorkHours}
            min={0}
            max={400}
            step={0.5}
            className={inputCls}
          />
        </Field>
        <Field label="1 日勤務時間上限 (時間)" hint="空欄 = 制限なし">
          <input
            type="number"
            name="maxDailyWorkHours"
            defaultValue={v.maxDailyWorkHours}
            min={0}
            max={24}
            step={0.5}
            className={inputCls}
          />
        </Field>
        <Field label="月間夜勤上限 (回)" hint="正社員既定 5。空欄 = 制限なし">
          <input
            type="number"
            name="maxNightShiftsPerMonth"
            defaultValue={v.maxNightShiftsPerMonth}
            min={0}
            max={31}
            step={1}
            className={inputCls}
          />
        </Field>
        <Field
          label="夜勤希望 (月の回数)"
          hint="本人が入りたい回数。自動作成はこの回数まで夜勤を優先。空欄 = 希望なし"
        >
          <input
            type="number"
            name="desiredNightShiftsPerMonth"
            defaultValue={v.desiredNightShiftsPerMonth}
            min={0}
            max={31}
            step={1}
            className={inputCls}
          />
        </Field>
        <Field label="月間出勤目標 (日)" hint="正社員既定 21。空欄 = 目標なし">
          <input
            type="number"
            name="targetMonthlyWorkDays"
            defaultValue={v.targetMonthlyWorkDays}
            min={0}
            max={31}
            step={1}
            className={inputCls}
          />
        </Field>
        <Field label="年収上限 (円)" hint="パート扶養範囲。空欄 = 130 万円既定で警告">
          <input
            type="number"
            name="annualIncomeCapYen"
            defaultValue={v.annualIncomeCapYen}
            min={0}
            max={100_000_000}
            step={1}
            placeholder="例: 1300000"
            className={inputCls}
          />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="allowNightShiftOverride"
            defaultChecked={v.allowNightShiftOverride === "on"}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
          />
          <span className="flex flex-col">
            <span className="text-slate-700">人員不足時は夜勤上限超過を許可</span>
            <span className="text-xs text-slate-500">
              既定 ON。OFF にすると自動シフトは絶対に超過しない (S-A-26 で警告のみ)
            </span>
          </span>
        </label>
      </div>

      <fieldset className="rounded-xl border border-slate-200 bg-white p-5">
        <legend className="px-2 text-sm font-medium text-slate-700">勤務不可曜日</legend>
        <div className="flex flex-wrap gap-3 pt-2">
          {DAY_LABELS.map((label, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="unavailableDaysOfWeek"
                value={i}
                defaultChecked={selectedDays.has(i)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
              />
              <span className={i === 0 ? "text-red-600" : i === 6 ? "text-blue-600" : ""}>
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">備考 (任意)</span>
        <textarea
          name="notes"
          defaultValue={v.notes}
          maxLength={500}
          rows={3}
          className="rounded-md border border-slate-300 px-3 py-2"
          placeholder="例: 子の送迎で 8 時以前不可"
        />
      </label>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.message}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "保存中…" : "保存する"}
        </button>
      </div>
    </form>
  );
}

const inputCls = "rounded-md border border-slate-300 px-3 py-2 text-sm";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
