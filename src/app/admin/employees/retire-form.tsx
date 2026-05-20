"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { RetireFormState } from "./actions";

type Initial = NonNullable<RetireFormState["values"]>;

type Props = {
  action: (state: RetireFormState, formData: FormData) => Promise<RetireFormState>;
  initial: Initial;
  employeeId: string;
};

export function RetireForm({ action, initial, employeeId }: Props) {
  const [state, formAction, pending] = useActionState<RetireFormState, FormData>(action, {
    values: initial,
  });
  const v = state.values ?? initial;

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-5">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">退職日</span>
        <input
          type="date"
          name="retiredAt"
          defaultValue={v.retiredAt}
          required
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <span className="text-xs text-slate-500">雇い入れ日より前の日付は受け付けません。</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">退職理由</span>
        <textarea
          name="retirementReason"
          rows={3}
          defaultValue={v.retirementReason}
          required
          placeholder="例: 一身上の都合 / 契約期間満了 / 定年退職"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <span className="text-xs text-slate-500">
          退職者一覧 (S-A-20) に表示されます。社労士確認用に分かるよう簡潔に記載してください。
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">備考（任意）</span>
        <textarea
          name="notes"
          rows={3}
          defaultValue={v.notes}
          placeholder="社内向けメモなど"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <span className="text-xs text-slate-500">既存の備考に追記されます。</span>
      </label>

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-slate-200 pt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {pending ? "処理中…" : "退職にする"}
        </button>
        <Link
          href={`/admin/employees/${employeeId}`}
          className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
        >
          キャンセル
        </Link>
      </div>
    </form>
  );
}
