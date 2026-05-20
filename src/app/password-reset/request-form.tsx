"use client";

import { useActionState } from "react";

import type { ResetRequestFormState } from "./actions";

type Props = {
  action: (state: ResetRequestFormState, formData: FormData) => Promise<ResetRequestFormState>;
};

export function ResetRequestForm({ action }: Props) {
  const [state, formAction, pending] = useActionState<ResetRequestFormState, FormData>(action, {});

  if (state.submitted) {
    return (
      <div className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">
        <p className="font-semibold">パスワード再設定のリンクを送信しました。</p>
        <p className="mt-2">
          メールに記載のリンクから新しいパスワードを設定してください。30
          分以内に手続きしてください。
        </p>
        <p className="mt-2 text-xs text-emerald-700">
          ※登録されていないメールでも、本画面の表示は同じです。届かない場合は管理者にご確認ください。
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">メールアドレス</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          className="rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-500 focus:outline-none"
        />
      </label>

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {pending ? "送信中…" : "再設定リンクを送る"}
      </button>
    </form>
  );
}
