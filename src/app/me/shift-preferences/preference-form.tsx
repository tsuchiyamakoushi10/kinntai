"use client";

import { useActionState, useEffect, useRef } from "react";

import { SHIFT_PREFERENCE_TYPE_OPTIONS } from "@/lib/employee-labels";

import type { ShiftPreferenceFormState } from "./actions";

const EMPTY = { targetDate: "", preferenceType: "REQUESTED_OFF", note: "" } as const;

type Props = {
  action: (
    state: ShiftPreferenceFormState,
    formData: FormData,
  ) => Promise<ShiftPreferenceFormState>;
  /** UI のカレンダー絞り込み用、初期表示の対象日 (YYYY-MM-DD)。 */
  defaultDate?: string;
};

export function PreferenceForm({ action, defaultDate }: Props) {
  const [state, formAction, pending] = useActionState<ShiftPreferenceFormState, FormData>(action, {
    values: { ...EMPTY, targetDate: defaultDate ?? "" },
  });
  const v = state.values ?? { ...EMPTY, targetDate: defaultDate ?? "" };
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.error && !state.values) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-slate-800">希望を出す</h2>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">対象日</span>
        <input
          type="date"
          name="targetDate"
          defaultValue={v.targetDate}
          required
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">種別</span>
        <select
          name="preferenceType"
          defaultValue={v.preferenceType}
          required
          className="rounded-md border border-slate-300 px-3 py-2"
        >
          {SHIFT_PREFERENCE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">メモ (任意)</span>
        <textarea
          name="note"
          defaultValue={v.note}
          maxLength={500}
          rows={2}
          placeholder="例: 子の学校行事のため"
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "送信中…" : "希望を提出する"}
      </button>
    </form>
  );
}
