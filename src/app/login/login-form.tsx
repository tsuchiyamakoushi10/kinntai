"use client";

import { useActionState } from "react";

import { loginAction, type LoginState } from "./actions";

const INITIAL: LoginState = {};

type Props = {
  from: string;
};

export function LoginForm({ from }: Props) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="from" value={from} />

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

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">パスワード</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
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
        className="mt-2 rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {pending ? "確認中…" : "ログイン"}
      </button>
    </form>
  );
}
