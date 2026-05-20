"use client";

import { useActionState } from "react";

import type { TabletPinFormState } from "../actions";

type Props = {
  hasPin: boolean;
  setAction: (state: TabletPinFormState, formData: FormData) => Promise<TabletPinFormState>;
  clearAction: () => Promise<void>;
};

/**
 * 共有タブレット用の 4 桁暗証番号を設定 / 無効化するフォーム。
 *
 * セキュリティ上、現在値の平文は表示しない。「設定済み」「未設定」の状態と、
 * 新しい値の上書き、無効化（ハッシュを NULL に）の 3 つの操作を提供する。
 */
export function TabletPinForm({ hasPin, setAction, clearAction }: Props) {
  const [state, formAction, pending] = useActionState<TabletPinFormState, FormData>(setAction, {});

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        共有タブレット (S-T-04) で本人確認に使う 4 桁の暗証番号。
        本人だけが知る番号を設定してください。
      </p>

      <p className="text-sm">
        <span className="text-slate-500">現在: </span>
        {hasPin ? (
          <span className="font-semibold text-emerald-700">設定済み</span>
        ) : (
          <span className="font-semibold text-slate-500">未設定（タブレットでは打刻不可）</span>
        )}
      </p>

      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-slate-500">
          新しい暗証番号（4 桁）
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="\d{4}"
            maxLength={4}
            required
            className="mt-1 w-32 rounded-md border border-slate-300 px-3 py-2 text-lg tracking-[0.5em] tabular-nums"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "保存中..." : "保存"}
        </button>
      </form>

      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-emerald-700">
          {state.message}
        </p>
      )}

      {hasPin && (
        <form action={clearAction} className="mt-1">
          <button
            type="submit"
            className="text-xs text-slate-500 underline-offset-2 hover:text-red-600 hover:underline"
          >
            暗証番号を無効化する
          </button>
        </form>
      )}
    </div>
  );
}
