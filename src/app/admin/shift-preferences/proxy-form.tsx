"use client";

import { useActionState, useEffect, useRef } from "react";

import { SHIFT_PREFERENCE_TYPE_OPTIONS } from "@/lib/employee-labels";

import type { ProxyPreferenceFormState } from "./actions";

const EMPTY = {
  employeeId: "",
  targetDate: "",
  preferenceType: "REQUESTED_OFF",
  note: "",
} as const;

type EmployeeOption = {
  id: string;
  employeeCode: string;
  name: string;
  officeName: string;
};

type Props = {
  action: (
    state: ProxyPreferenceFormState,
    formData: FormData,
  ) => Promise<ProxyPreferenceFormState>;
  employees: EmployeeOption[];
  /** 月絞り込みと連動した既定の対象日 (YYYY-MM-DD)。 */
  defaultDate?: string;
};

/**
 * 紙で集めた希望休を管理者がまとめて入力する用のフォーム。
 * 送信直後にフォームをリセットして、同じ日付・別従業員を続けて入力しやすくする。
 */
export function ProxyPreferenceForm({ action, employees, defaultDate }: Props) {
  const initial = { ...EMPTY, targetDate: defaultDate ?? "" };
  const [state, formAction, pending] = useActionState<ProxyPreferenceFormState, FormData>(action, {
    values: initial,
  });
  const v = state.values ?? initial;
  const formRef = useRef<HTMLFormElement>(null);
  const employeeRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!state.error && !state.values) {
      formRef.current?.reset();
      employeeRef.current?.focus();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-[1.5fr_1fr_1fr_1.5fr_auto]"
    >
      <label className="flex flex-col gap-1">
        <span className="text-slate-600">従業員</span>
        <select
          ref={employeeRef}
          name="employeeId"
          defaultValue={v.employeeId}
          required
          className="rounded-md border border-slate-300 px-3 py-2"
        >
          <option value="">選択してください</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}（{e.officeName}）
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-slate-600">対象日</span>
        <input
          type="date"
          name="targetDate"
          defaultValue={v.targetDate}
          required
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1">
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
      <label className="flex flex-col gap-1">
        <span className="text-slate-600">メモ (任意)</span>
        <input
          type="text"
          name="note"
          defaultValue={v.note}
          maxLength={500}
          placeholder="例: 子の学校行事のため"
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "追加中…" : "追加"}
        </button>
      </div>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-5">
          {state.error}
        </p>
      )}
    </form>
  );
}
