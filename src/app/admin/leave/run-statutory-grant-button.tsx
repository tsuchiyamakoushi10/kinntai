"use client";

import { useState, useTransition } from "react";

import { runStatutoryGrant } from "./actions";

type Props = {
  pendingTotal: number;
};

/**
 * 「自動付与を実行」ボタン。クリックすると Server Action を呼び、
 * STATUTORY 種別で未付与の分を一括作成する。
 */
export function RunStatutoryGrantButton({ pendingTotal }: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function onClick(): void {
    if (pendingTotal === 0) {
      setMessage({ kind: "ok", text: "未付与の対象はありません。" });
      return;
    }
    const ok = confirm(`${pendingTotal} 件の有給付与を実行します。よろしいですか？`);
    if (!ok) return;
    startTransition(async () => {
      const res = await runStatutoryGrant();
      if (res.ok) {
        setMessage({
          kind: "ok",
          text: `付与しました (${res.createdCount} 件 / ${res.employeesProcessed} 名処理)。`,
        });
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending
          ? "付与中…"
          : pendingTotal > 0
            ? `自動付与を実行 (${pendingTotal} 件)`
            : "自動付与を実行"}
      </button>
      {message && (
        <span
          className={message.kind === "ok" ? "text-xs text-emerald-700" : "text-xs text-rose-700"}
          role="status"
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
