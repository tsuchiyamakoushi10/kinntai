"use client";

import { useActionState } from "react";

import type { ReissueCredentialState } from "../actions";

type Props = {
  /** 現在の loginId。未発行なら null。 */
  loginId: string | null;
  reissueAction: (
    state: ReissueCredentialState,
    formData: FormData,
  ) => Promise<ReissueCredentialState>;
};

/**
 * 職員ログインID / 初期パスワードの個別発行・再発行フォーム。
 *
 * 現在の loginId を表示し、ボタンでパスワードを再生成する。発行直後だけ平文の
 * 初期パスワードを表示し、管理者が本人へ伝える運用。複数名まとめて発行する場合は
 * 「ログイン発行」ページを使う。
 */
export function LoginCredentialForm({ loginId, reissueAction }: Props) {
  const [state, formAction, pending] = useActionState<ReissueCredentialState, FormData>(
    reissueAction,
    {},
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        職員がスマホからログインして希望休・夜勤・有給を申請するためのIDとパスワード。
      </p>

      <p className="text-sm">
        <span className="text-slate-500">ログインID: </span>
        {loginId ? (
          <span className="font-mono font-semibold text-slate-900">{loginId}</span>
        ) : (
          <span className="font-semibold text-slate-500">未発行</span>
        )}
      </p>

      {state.issued && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p className="font-semibold">発行しました（初期パスワードはこの一度だけ表示）</p>
          <p className="mt-1">
            ID: <span className="font-mono">{state.issued.loginId}</span>
          </p>
          <p>
            初期パスワード:{" "}
            <span className="font-mono text-base font-bold tracking-wider">
              {state.issued.initialPassword}
            </span>
          </p>
        </div>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "発行中…" : loginId ? "パスワードを再発行する" : "ログインを発行する"}
        </button>
      </form>
    </div>
  );
}
