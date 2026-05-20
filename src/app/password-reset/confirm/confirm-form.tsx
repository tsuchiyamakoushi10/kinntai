"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { ResetConfirmFormState } from "../actions";

type Props = {
  action: (state: ResetConfirmFormState, formData: FormData) => Promise<ResetConfirmFormState>;
  token: string;
};

export function ResetConfirmForm({ action, token }: Props) {
  const [state, formAction, pending] = useActionState<ResetConfirmFormState, FormData>(action, {});

  if (state.done) {
    return (
      <div className="flex flex-col gap-3 rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">
        <p className="font-semibold">パスワードを変更しました。</p>
        <Link
          href="/login"
          className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          ログイン画面へ
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">新しいパスワード</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-500 focus:outline-none"
        />
        <span className="text-xs text-slate-500">8 文字以上</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">新しいパスワード（確認）</span>
        <input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          minLength={8}
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
        {pending ? "変更中…" : "パスワードを変更する"}
      </button>
    </form>
  );
}
