"use client";

import { useActionState, useEffect, useRef } from "react";

import { TRAINING_TYPE_OPTIONS } from "@/lib/employee-labels";

import type { TrainingRecordFormState, TrainingRecordFormValues } from "./actions";

type Props = {
  action: (state: TrainingRecordFormState, formData: FormData) => Promise<TrainingRecordFormState>;
  initial: TrainingRecordFormValues;
  submitLabel: string;
  /** true: 成功後にフォームをリセット (追加フォーム用)。false: 編集フォーム用に値を保持 */
  resetOnSuccess?: boolean;
};

export function TrainingForm({ action, initial, submitLabel, resetOnSuccess = false }: Props) {
  const [state, formAction, pending] = useActionState<TrainingRecordFormState, FormData>(action, {
    values: initial,
  });
  const v = state.values ?? initial;
  const formRef = useRef<HTMLFormElement>(null);

  // 成功時 (error なし & values なし = 初期形) のみリセット
  useEffect(() => {
    if (resetOnSuccess && !state.error && !state.values) {
      formRef.current?.reset();
    }
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-slate-600">研修名</span>
          <input
            type="text"
            name="trainingName"
            defaultValue={v.trainingName}
            required
            maxLength={200}
            placeholder="例: 認知症介護基礎研修"
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">種別</span>
          <select
            name="trainingType"
            defaultValue={v.trainingType}
            required
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            {TRAINING_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">研修日</span>
          <input
            type="date"
            name="trainedOn"
            defaultValue={v.trainedOn}
            required
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">費用 (円, 任意)</span>
          <input
            type="number"
            name="costYen"
            defaultValue={v.costYen}
            min={0}
            max={10_000_000}
            step={1}
            placeholder="例: 8000"
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-slate-600">備考 (任意)</span>
          <textarea
            name="notes"
            defaultValue={v.notes}
            maxLength={500}
            rows={2}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "保存中…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
