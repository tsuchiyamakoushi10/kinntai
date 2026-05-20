"use client";

import { useActionState } from "react";

import type { PasswordFormState } from "./actions";

type Props = {
  action: (state: PasswordFormState, formData: FormData) => Promise<PasswordFormState>;
};

/**
 * 現パスワード + 新パスワード + 確認の 3 入力。Server Action 側で
 * 検証し、成功 / 失敗のメッセージを useActionState 経由で受け取る。
 */
export function PasswordForm({ action }: Props) {
  const [state, formAction, pending] = useActionState<PasswordFormState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field
        label="現在のパスワード"
        name="currentPassword"
        autoComplete="current-password"
        required
      />
      <Field
        label="新しいパスワード"
        name="newPassword"
        autoComplete="new-password"
        hint="8 文字以上"
        required
      />
      <Field
        label="新しいパスワード（確認）"
        name="confirmPassword"
        autoComplete="new-password"
        required
      />

      <button
        type="submit"
        disabled={pending}
        className="mt-1 self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "変更中..." : "パスワードを変更する"}
      </button>

      {state.error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm font-medium text-emerald-700">
          {state.message}
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  name,
  autoComplete,
  hint,
  required,
}: {
  label: string;
  name: string;
  autoComplete: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        type="password"
        name={name}
        autoComplete={autoComplete}
        required={required}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base shadow-sm focus:border-slate-500 focus:outline-none"
      />
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
