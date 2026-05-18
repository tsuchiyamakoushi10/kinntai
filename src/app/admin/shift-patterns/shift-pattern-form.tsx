"use client";

import Link from "next/link";
import { useActionState } from "react";

import { SHIFT_KIND_OPTIONS } from "@/lib/shift-labels";

import type { ShiftPatternFormState, ShiftPatternFormValues } from "./actions";

type Initial = ShiftPatternFormValues;

type Props = {
  action: (state: ShiftPatternFormState, formData: FormData) => Promise<ShiftPatternFormState>;
  initial: Initial;
  submitLabel: string;
  offices: ReadonlyArray<{ id: string; name: string }>;
};

export function ShiftPatternForm({ action, initial, submitLabel, offices }: Props) {
  const [state, formAction, pending] = useActionState<ShiftPatternFormState, FormData>(action, {
    values: initial,
  });
  const v = state.values ?? initial;

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="コード" hint="例: HAYA、DEAY (英大文字・数字・ハイフン)">
          <input
            name="code"
            defaultValue={v.code}
            required
            className="rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase focus:border-slate-500 focus:outline-none"
          />
        </Field>

        <Field label="名称" hint="現場での呼び方 (例: 早、デ日)">
          <input
            name="name"
            defaultValue={v.name}
            required
            className="rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="拠点" hint="空欄なら全拠点共通">
          <select
            name="officeId"
            defaultValue={v.officeId}
            className="rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          >
            <option value="">全拠点共通</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="種別" hint="勤務 / 夜入 / 夜明 / 公休 / 有休 / 欠勤 / 希望休">
          <select
            name="shiftKind"
            defaultValue={v.shiftKind}
            required
            className="rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          >
            {SHIFT_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="開始時刻" hint="勤務系のみ。例: 08:15">
          <input
            type="time"
            name="startTime"
            defaultValue={v.startTime}
            className="rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          />
        </Field>

        <Field label="終了時刻" hint="勤務系のみ。例: 17:15">
          <input
            type="time"
            name="endTime"
            defaultValue={v.endTime}
            className="rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          />
        </Field>

        <Field label="休憩分" hint="例: 60 (= 1 時間休憩)">
          <input
            type="number"
            name="breakMinutes"
            defaultValue={v.breakMinutes}
            min={0}
            max={480}
            className="rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="crossesMidnight"
          defaultChecked={v.crossesMidnight}
          className="size-4 rounded border-slate-300"
        />
        日付をまたぐシフト (例: フル夜勤)
      </label>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="有給消化単位" hint="有休: 1.0、半休: 0.5、それ以外: 0">
          <input
            type="number"
            name="paidLeaveUnits"
            defaultValue={v.paidLeaveUnits}
            min={0}
            max={1}
            step={0.5}
            className="rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          />
        </Field>

        <Field label="色" hint="勤務表のセル背景に使う">
          <input
            type="color"
            name="color"
            defaultValue={v.color || "#888888"}
            className="h-10 w-full rounded-lg border border-slate-300"
          />
        </Field>

        <Field label="並び順" hint="小さい順で表示。同値はコード順">
          <input
            type="number"
            name="sortOrder"
            defaultValue={v.sortOrder}
            min={0}
            max={9999}
            className="rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={v.isActive}
          className="size-4 rounded border-slate-300"
        />
        勤務表で選択できるようにする (有効)
      </label>

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {pending ? "保存中…" : submitLabel}
        </button>
        <Link
          href="/admin/shift-patterns"
          className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
        >
          キャンセル
        </Link>
      </div>
    </form>
  );
}

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
      <span className="font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
