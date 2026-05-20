"use client";

import { useActionState } from "react";

import type { ContactFormState } from "./actions";

type Props = {
  action: (state: ContactFormState, formData: FormData) => Promise<ContactFormState>;
  initialPhone: string;
};

/**
 * 連絡先 (電話番号) を更新する。氏名や雇用情報は管理者経由で更新するため、
 * 従業員側ではここでは触れない。
 */
export function ContactForm({ action, initialPhone }: Props) {
  const [state, formAction, pending] = useActionState<ContactFormState, FormData>(action, {
    values: { phone: initialPhone },
  });
  const phone = state.values?.phone ?? initialPhone;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">電話番号</span>
        <input
          type="tel"
          name="phone"
          defaultValue={phone}
          autoComplete="tel"
          inputMode="tel"
          placeholder="例: 090-1234-5678"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base shadow-sm focus:border-slate-500 focus:outline-none"
        />
        <span className="text-xs text-slate-500">
          氏名・所属拠点・メールアドレスを変更したい場合は管理者へ連絡してください。
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "保存中..." : "連絡先を保存"}
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
