"use client";

import { useActionState, useMemo, useState } from "react";

import { issueCredentials, type IssueCredentialsState } from "./actions";

export type IssuerEmployee = {
  id: string;
  employeeCode: string;
  name: string;
  officeName: string | null;
  /** すでに発行済みなら loginId、未発行なら null。 */
  loginId: string | null;
};

type Props = {
  employees: IssuerEmployee[];
};

const INITIAL: IssueCredentialsState = {};

export function CredentialIssuer({ employees }: Props) {
  const [state, formAction, pending] = useActionState(issueCredentials, INITIAL);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const unissued = useMemo(() => employees.filter((e) => !e.loginId), [employees]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllUnissued() {
    setSelected(new Set(unissued.map((e) => e.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  // 発行結果が返ってきたら、それを最優先で表示する（印刷して本人に渡す画面）。
  if (state.results && state.results.length > 0) {
    return <ResultView results={state.results} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={selectAllUnissued}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
        >
          未発行をすべて選択（{unissued.length}）
        </button>
        <button
          type="button"
          onClick={clearSelection}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
        >
          選択解除
        </button>
        <span className="text-slate-500">選択中: {selected.size} 名</span>
      </div>

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="w-10 px-4 py-3" />
              <th className="px-4 py-3 font-medium">氏名</th>
              <th className="px-4 py-3 font-medium">拠点</th>
              <th className="px-4 py-3 font-medium">ログイン状態</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((e) => {
              const checked = selected.has(e.id);
              return (
                <tr
                  key={e.id}
                  className={checked ? "bg-pink-50/60" : ""}
                  onClick={() => toggle(e.id)}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(e.id)}
                      onClick={(ev) => ev.stopPropagation()}
                      className="h-4 w-4 accent-pink-500"
                    />
                    {checked && <input type="hidden" name="employeeId" value={e.id} />}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">{e.name}</span>
                    <span className="ml-2 font-mono text-xs text-slate-400">{e.employeeCode}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{e.officeName ?? "—"}</td>
                  <td className="px-4 py-3">
                    {e.loginId ? (
                      <span className="text-slate-600">
                        発行済 <span className="font-mono text-slate-500">{e.loginId}</span>
                        <span className="ml-1 text-xs text-amber-600">（選択すると再発行）</span>
                      </span>
                    ) : (
                      <span className="font-semibold text-pink-600">未発行</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  在籍中の職員がいません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <button
          type="submit"
          disabled={pending || selected.size === 0}
          className="rounded-lg bg-pink-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-pink-200 transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          {pending ? "発行中…" : `選択した ${selected.size} 名に発行する`}
        </button>
        <p className="mt-2 text-xs text-slate-500">
          ※ 初期パスワードは発行直後の画面に一度だけ表示されます。印刷して本人へ渡してください。
        </p>
      </div>
    </form>
  );
}

function ResultView({ results }: { results: IssueCredentialsState["results"] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 print:hidden">
        {results?.length} 名分のログインを発行しました。下の一覧を印刷し、本人へ渡してください。
        この初期パスワードは再表示できません。
      </div>

      <div className="flex items-center justify-between print:hidden">
        <h2 className="text-lg font-bold text-slate-900">発行結果</h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          印刷する
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">氏名</th>
              <th className="px-4 py-3 font-medium">ログインID</th>
              <th className="px-4 py-3 font-medium">初期パスワード</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results?.map((r) => (
              <tr key={r.employeeId}>
                <td className="px-4 py-3 text-slate-900">{r.name}</td>
                <td className="px-4 py-3 font-mono text-base text-slate-900">{r.loginId}</td>
                <td className="px-4 py-3 font-mono text-base font-bold tracking-wider text-slate-900">
                  {r.initialPassword}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        ログイン後、本人に初回パスワード変更を促す画面が表示されます。
      </p>
    </div>
  );
}
