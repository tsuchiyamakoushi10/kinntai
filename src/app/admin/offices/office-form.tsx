"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { OfficeFormState } from "./actions";

type Initial = NonNullable<OfficeFormState["values"]>;

type Props = {
  action: (state: OfficeFormState, formData: FormData) => Promise<OfficeFormState>;
  initial: Initial;
  submitLabel: string;
  // 編集モードでは code を変更させない運用にしたい場合のためのフラグ。
  // 現状は code 変更可だが、将来のために用意。
  lockCode?: boolean;
};

export function OfficeForm({ action, initial, submitLabel, lockCode = false }: Props) {
  const [state, formAction, pending] = useActionState<OfficeFormState, FormData>(action, {
    values: initial,
  });
  const v = state.values ?? initial;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <Field label="拠点コード" hint="例: NRS-CENTER（英大文字・数字・ハイフン・アンダースコア）">
        <input
          name="code"
          defaultValue={v.code}
          required
          readOnly={lockCode}
          className="rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase focus:border-slate-500 focus:outline-none"
        />
      </Field>

      <Field label="名称" hint="現場で呼んでいる名前（例: ナーシングホーム結いの心）">
        <input
          name="name"
          defaultValue={v.name}
          required
          className="rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />
      </Field>

      <Field label="住所" hint="任意。郵送物や緊急連絡用">
        <input
          name="address"
          defaultValue={v.address}
          className="rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={v.isActive}
          className="size-4 rounded border-slate-300"
        />
        この拠点を稼働中にする
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
          href="/admin/offices"
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
